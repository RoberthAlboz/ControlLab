import { describe, expect, it } from "vitest";
import {
  assertArchiveAllowed,
  assertItemEditAllowed,
  assertLoanTransition,
  assertManualMovementReason,
  availableQuantity,
  InventoryRuleError,
  isLowStock,
  normalizeItemCode,
  outstandingLoanQuantity,
  planLoanReturn,
  planStockChange,
  stockHealth,
  type StockSnapshot,
} from "@shared/inventory";

const stock = (overrides: Partial<StockSnapshot> = {}): StockSnapshot => ({
  physical: 20,
  reserved: 0,
  status: "disponivel",
  archived: false,
  returnable: true,
  ...overrides,
});

function ruleCode(action: () => unknown) {
  try {
    action();
  } catch (error) {
    if (error instanceof InventoryRuleError) return error.code;
    throw error;
  }
  return null;
}

describe("estoque · entradas e saídas", () => {
  it("entrada soma ao saldo físico", () => {
    expect(planStockChange(stock({ physical: 5 }), "entrada", 3)).toEqual({ physicalBefore: 5, physicalAfter: 8, reservedBefore: 0, reservedAfter: 0 });
  });

  it("saída desconta do saldo físico", () => {
    expect(planStockChange(stock({ physical: 12 }), "saida", 4)).toMatchObject({ physicalAfter: 8 });
  });

  it("bloqueia saída acima da quantidade disponível (considera reservas)", () => {
    expect(ruleCode(() => planStockChange(stock({ physical: 10, reserved: 8 }), "saida", 3))).toBe("INSUFFICIENT_STOCK");
    expect(planStockChange(stock({ physical: 10, reserved: 8 }), "saida", 2)).toMatchObject({ physicalAfter: 8, reservedAfter: 8 });
  });

  it("nunca produz saldo negativo", () => {
    expect(ruleCode(() => planStockChange(stock({ physical: 0 }), "saida", 1))).toBe("INSUFFICIENT_STOCK");
    expect(ruleCode(() => planStockChange(stock({ physical: 3 }), "ajuste_saida", 4))).toBe("INSUFFICIENT_STOCK");
  });

  it("recusa quantidades zero, negativas, fracionadas ou absurdas", () => {
    for (const quantity of [0, -1, 1.5, Number.NaN, 1_000_000]) {
      expect(ruleCode(() => planStockChange(stock(), "entrada", quantity))).toBe("INVALID_QUANTITY");
    }
  });

  it("item arquivado não recebe movimentações", () => {
    expect(ruleCode(() => planStockChange(stock({ archived: true }), "entrada", 1))).toBe("ARCHIVED");
  });

  it("detecta saldo inconsistente gravado (reserva maior que o físico)", () => {
    expect(ruleCode(() => planStockChange(stock({ physical: 1, reserved: 2 }), "entrada", 1))).toBe("INVALID_STATE");
  });
});

describe("estoque · motivos e justificativas", () => {
  it("aceita somente motivos compatíveis com o tipo", () => {
    expect(() => assertManualMovementReason("entrada", "compra")).not.toThrow();
    expect(ruleCode(() => assertManualMovementReason("entrada", "aula"))).toBe("INVALID_REASON");
    expect(ruleCode(() => assertManualMovementReason("saida", "compra"))).toBe("INVALID_REASON");
  });

  it("exige justificativa em ajustes, perdas e avarias", () => {
    expect(ruleCode(() => assertManualMovementReason("ajuste_saida", "correcao", "curta"))).toBe("JUSTIFICATION_REQUIRED");
    expect(() => assertManualMovementReason("ajuste_saida", "correcao", "Contagem física encontrou 2 a menos.")).not.toThrow();
    expect(ruleCode(() => assertManualMovementReason("saida", "perda", ""))).toBe("JUSTIFICATION_REQUIRED");
    expect(() => assertManualMovementReason("saida", "aula")).not.toThrow();
  });
});

describe("estoque · empréstimo (reserva → retirada → devolução)", () => {
  it("percurso 20 → 18 do ControlLab: reserva 2, retirada desconta uma única vez", () => {
    const reserved = planStockChange(stock({ physical: 20 }), "reserva", 2);
    expect(reserved).toMatchObject({ physicalAfter: 20, reservedAfter: 2 });
    expect(availableQuantity({ physical: reserved.physicalAfter, reserved: reserved.reservedAfter })).toBe(18);
    const delivered = planStockChange(stock({ physical: 20, reserved: 2 }), "retirada", 2);
    expect(delivered).toMatchObject({ physicalAfter: 18, reservedAfter: 0 });
    expect(availableQuantity({ physical: 18, reserved: 0 })).toBe(18);
  });

  it("não reserva consumíveis, itens em manutenção ou acima do disponível", () => {
    expect(ruleCode(() => planStockChange(stock({ returnable: false }), "reserva", 1))).toBe("NOT_RETURNABLE");
    expect(ruleCode(() => planStockChange(stock({ status: "manutencao" }), "reserva", 1))).toBe("UNAVAILABLE");
    expect(ruleCode(() => planStockChange(stock({ physical: 3, reserved: 2 }), "reserva", 2))).toBe("INSUFFICIENT_STOCK");
  });

  it("retirada precisa de reserva correspondente", () => {
    expect(ruleCode(() => planStockChange(stock({ physical: 5, reserved: 0 }), "retirada", 1))).toBe("INVALID_STATE");
  });

  it("cancelar reserva libera o disponível sem mexer no físico", () => {
    expect(planStockChange(stock({ physical: 5, reserved: 2 }), "cancelamento_reserva", 2)).toMatchObject({ physicalAfter: 5, reservedAfter: 0 });
  });

  it("devolução em bom estado volta ao saldo; avaria fica registrada sem voltar", () => {
    expect(planStockChange(stock({ physical: 18 }), "devolucao", 2)).toMatchObject({ physicalAfter: 20 });
    expect(planStockChange(stock({ physical: 18 }), "devolucao_avaria", 1)).toMatchObject({ physicalAfter: 18, reservedAfter: 0 });
  });

  it("devolução parcial mantém o empréstimo aberto e a total o encerra", () => {
    const loan = { status: "retirado" as const, quantity: 3, returnedQuantity: 0, damagedQuantity: 0 };
    const partial = planLoanReturn(loan, 1, 0);
    expect(partial).toMatchObject({ status: "retirado", closed: false, outstandingAfter: 2 });
    const final = planLoanReturn({ ...loan, returnedQuantity: 1 }, 1, 1);
    expect(final).toMatchObject({ status: "devolvido", closed: true, returnedQuantity: 2, damagedQuantity: 1, outstandingAfter: 0 });
  });

  it("não aceita devolver mais que o pendente nem devolução vazia", () => {
    const loan = { status: "retirado" as const, quantity: 2, returnedQuantity: 1, damagedQuantity: 0 };
    expect(outstandingLoanQuantity(loan)).toBe(1);
    expect(ruleCode(() => planLoanReturn(loan, 2, 0))).toBe("INVALID_QUANTITY");
    expect(ruleCode(() => planLoanReturn(loan, 0, 0))).toBe("INVALID_QUANTITY");
  });

  it("respeita a máquina de estados do empréstimo", () => {
    expect(() => assertLoanTransition({ status: "reservado", quantity: 1, returnedQuantity: 0, damagedQuantity: 0 }, "deliver")).not.toThrow();
    expect(ruleCode(() => assertLoanTransition({ status: "retirado", quantity: 1, returnedQuantity: 0, damagedQuantity: 0 }, "cancel"))).toBe("INVALID_STATE");
    expect(ruleCode(() => assertLoanTransition({ status: "reservado", quantity: 1, returnedQuantity: 0, damagedQuantity: 0 }, "return"))).toBe("INVALID_STATE");
    expect(ruleCode(() => assertLoanTransition({ status: "devolvido", quantity: 1, returnedQuantity: 1, damagedQuantity: 0 }, "deliver"))).toBe("INVALID_STATE");
  });
});

describe("estoque · cadastro e arquivamento", () => {
  const context = { physical: 4, reserved: 0, unit: "UN" as const, returnable: true, status: "disponivel" as const, hasMovements: true, activeLoans: 0 };

  it("bloqueia troca de unidade (UN ↔ JG) quando há saldo ou histórico", () => {
    expect(ruleCode(() => assertItemEditAllowed(context, { unit: "JG", returnable: true, status: "disponivel" }))).toBe("LOCKED_FIELD");
    expect(() => assertItemEditAllowed({ ...context, physical: 0, hasMovements: false }, { unit: "JG", returnable: true, status: "disponivel" })).not.toThrow();
  });

  it("bloqueia mudanças que deixariam empréstimos ou reservas inconsistentes", () => {
    expect(ruleCode(() => assertItemEditAllowed({ ...context, activeLoans: 1 }, { unit: "UN", returnable: false, status: "disponivel" }))).toBe("LOCKED_FIELD");
    expect(ruleCode(() => assertItemEditAllowed({ ...context, reserved: 1 }, { unit: "UN", returnable: true, status: "manutencao" }))).toBe("LOCKED_FIELD");
  });

  it("só arquiva sem empréstimos ou reservas em andamento", () => {
    expect(ruleCode(() => assertArchiveAllowed({ reserved: 0, activeLoans: 1 }))).toBe("LOCKED_FIELD");
    expect(() => assertArchiveAllowed({ reserved: 0, activeLoans: 0 })).not.toThrow();
  });

  it("normaliza o código patrimonial para evitar duplicidade por caixa/espaços", () => {
    expect(normalizeItemCode("  brc hss 008 ")).toBe("BRC-HSS-008");
  });
});

describe("estoque · alertas", () => {
  it("estoque baixo considera o disponível e ignora mínimo zero ou item arquivado", () => {
    expect(isLowStock({ physical: 12, reserved: 4, minQuantity: 10, archived: false })).toBe(true);
    expect(isLowStock({ physical: 30, reserved: 0, minQuantity: 10, archived: false })).toBe(false);
    expect(isLowStock({ physical: 0, reserved: 0, minQuantity: 0, archived: false })).toBe(false);
    expect(isLowStock({ physical: 1, reserved: 0, minQuantity: 5, archived: true })).toBe(false);
  });

  it("classifica a situação exibida ao docente", () => {
    const base = { physical: 10, reserved: 0, minQuantity: 2, archived: false, status: "disponivel" as const };
    expect(stockHealth(base)).toBe("ok");
    expect(stockHealth({ ...base, physical: 2 })).toBe("baixo");
    expect(stockHealth({ ...base, physical: 3, reserved: 3 })).toBe("sem_saldo");
    expect(stockHealth({ ...base, status: "manutencao" })).toBe("manutencao");
    expect(stockHealth({ ...base, archived: true })).toBe("arquivado");
  });
});
