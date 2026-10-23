/**
 * Regras de domínio do estoque da ferramentaria.
 *
 * Origem: regras do protótipo ControlLab (saldo físico × reservado × disponível,
 * reserva no empréstimo, retirada que desconta uma única vez, devolução com
 * conferência de avaria, ajuste com justificativa, código SAP não único),
 * reimplementadas como funções puras. O servidor usa estas funções dentro de
 * transações com bloqueio de linha; os testes as exercitam sem banco.
 *
 * Nenhuma função aqui acessa banco, rede ou relógio.
 */

export const ITEM_TYPES = ["tool", "machine", "material", "part"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  tool: "Ferramenta",
  machine: "Máquina",
  material: "Material",
  part: "Peça / mini peça",
};

/** Unidades contáveis. Quantidades são sempre inteiras (UN e JG são distintas). */
export const ITEM_UNITS = ["UN", "JG", "PC", "CX", "PAR"] as const;
export type ItemUnit = (typeof ITEM_UNITS)[number];
export const ITEM_UNIT_LABELS: Record<ItemUnit, string> = {
  UN: "Unidade",
  JG: "Jogo",
  PC: "Peça / barra",
  CX: "Caixa",
  PAR: "Par",
};

export const ITEM_CONSERVATION = ["novo", "bom", "regular", "ruim"] as const;
export type ItemConservation = (typeof ITEM_CONSERVATION)[number];
export const ITEM_CONSERVATION_LABELS: Record<ItemConservation, string> = {
  novo: "Novo",
  bom: "Bom",
  regular: "Regular",
  ruim: "Ruim",
};

export const ITEM_STATUSES = ["disponivel", "manutencao", "indisponivel"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  disponivel: "Disponível",
  manutencao: "Em manutenção",
  indisponivel: "Indisponível",
};

/** Movimentos registráveis manualmente pelo docente. */
export const MANUAL_MOVEMENT_TYPES = ["entrada", "saida", "ajuste_entrada", "ajuste_saida"] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

/** Movimentos gerados pelo fluxo de empréstimo. */
export const LOAN_MOVEMENT_TYPES = ["reserva", "cancelamento_reserva", "retirada", "devolucao", "devolucao_avaria"] as const;
export type LoanMovementType = (typeof LOAN_MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPES = [...MANUAL_MOVEMENT_TYPES, ...LOAN_MOVEMENT_TYPES] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste_entrada: "Ajuste (+)",
  ajuste_saida: "Ajuste (−)",
  reserva: "Reserva",
  cancelamento_reserva: "Reserva cancelada",
  retirada: "Retirada",
  devolucao: "Devolução",
  devolucao_avaria: "Devolução com avaria",
};

export const MOVEMENT_REASONS = [
  "compra",
  "doacao",
  "inventario",
  "aula",
  "manutencao",
  "emprestimo",
  "perda",
  "avaria",
  "correcao",
  "devolucao",
  "outro",
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];
export const MOVEMENT_REASON_LABELS: Record<MovementReason, string> = {
  compra: "Compra / recebimento",
  doacao: "Doação",
  inventario: "Contagem de inventário",
  aula: "Uso em aula",
  manutencao: "Manutenção",
  emprestimo: "Empréstimo",
  perda: "Perda",
  avaria: "Avaria",
  correcao: "Correção de saldo",
  devolucao: "Devolução",
  outro: "Outro",
};

/** Motivos aceitos em cada movimento manual. */
export const REASONS_BY_MANUAL_TYPE: Record<ManualMovementType, readonly MovementReason[]> = {
  entrada: ["compra", "doacao", "inventario", "manutencao", "outro"],
  saida: ["aula", "manutencao", "perda", "avaria", "outro"],
  ajuste_entrada: ["correcao", "inventario"],
  ajuste_saida: ["correcao", "inventario"],
};

export const LOAN_STATUSES = ["reservado", "retirado", "devolvido", "cancelado"] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];
export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  reservado: "Reservado",
  retirado: "Retirado",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};

export const MAX_MOVEMENT_QUANTITY = 100_000;
export const MIN_JUSTIFICATION_LENGTH = 10;

export type InventoryRuleCode =
  | "INVALID_QUANTITY"
  | "ARCHIVED"
  | "INSUFFICIENT_STOCK"
  | "UNAVAILABLE"
  | "NOT_RETURNABLE"
  | "INVALID_STATE"
  | "INVALID_REASON"
  | "JUSTIFICATION_REQUIRED"
  | "LOCKED_FIELD";

export class InventoryRuleError extends Error {
  constructor(public readonly code: InventoryRuleCode, message: string) {
    super(message);
    this.name = "InventoryRuleError";
  }
}

export type StockSnapshot = {
  physical: number;
  reserved: number;
  status: ItemStatus;
  archived: boolean;
  returnable: boolean;
};

export type StockPlan = {
  physicalBefore: number;
  physicalAfter: number;
  reservedBefore: number;
  reservedAfter: number;
};

export function availableQuantity(stock: Pick<StockSnapshot, "physical" | "reserved">) {
  return Math.max(0, stock.physical - stock.reserved);
}

export function assertValidQuantity(quantity: unknown): asserts quantity is number {
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_MOVEMENT_QUANTITY) {
    throw new InventoryRuleError(
      "INVALID_QUANTITY",
      `Informe uma quantidade inteira entre 1 e ${MAX_MOVEMENT_QUANTITY.toLocaleString("pt-BR")}.`,
    );
  }
}

function assertConsistentStock(stock: StockSnapshot) {
  if (!Number.isInteger(stock.physical) || !Number.isInteger(stock.reserved) || stock.physical < 0 || stock.reserved < 0 || stock.reserved > stock.physical) {
    throw new InventoryRuleError("INVALID_STATE", "O saldo registrado deste item está inconsistente. Corrija-o com um ajuste justificado.");
  }
}

/**
 * Calcula o saldo resultante de um movimento ou lança um erro explicando por que
 * ele não pode ser registrado. Nunca produz saldo negativo nem reserva maior que
 * o físico.
 */
export function planStockChange(stock: StockSnapshot, type: MovementType, quantity: number): StockPlan {
  assertValidQuantity(quantity);
  assertConsistentStock(stock);
  if (stock.archived) {
    throw new InventoryRuleError("ARCHIVED", "Item arquivado não recebe movimentações. Restaure o item antes de movimentá-lo.");
  }
  const available = availableQuantity(stock);
  let physicalAfter = stock.physical;
  let reservedAfter = stock.reserved;

  switch (type) {
    case "entrada":
    case "ajuste_entrada":
    case "devolucao":
      physicalAfter = stock.physical + quantity;
      break;
    case "saida":
    case "ajuste_saida":
      if (quantity > available) {
        throw new InventoryRuleError(
          "INSUFFICIENT_STOCK",
          `Saldo disponível insuficiente: há ${available} disponível(is) e ${stock.reserved} reservado(s). A saída pedida é de ${quantity}.`,
        );
      }
      physicalAfter = stock.physical - quantity;
      break;
    case "reserva":
      if (!stock.returnable) {
        throw new InventoryRuleError("NOT_RETURNABLE", "Itens consumíveis não são emprestados. Registre uma saída para uso em aula.");
      }
      if (stock.status !== "disponivel") {
        throw new InventoryRuleError("UNAVAILABLE", "Este item está em manutenção ou indisponível e não pode ser reservado.");
      }
      if (quantity > available) {
        throw new InventoryRuleError("INSUFFICIENT_STOCK", `Saldo disponível insuficiente para reservar: há ${available} disponível(is).`);
      }
      reservedAfter = stock.reserved + quantity;
      break;
    case "cancelamento_reserva":
      if (quantity > stock.reserved) {
        throw new InventoryRuleError("INVALID_STATE", "A reserva a liberar é maior que a quantidade reservada do item.");
      }
      reservedAfter = stock.reserved - quantity;
      break;
    case "retirada":
      if (quantity > stock.reserved || quantity > stock.physical) {
        throw new InventoryRuleError("INVALID_STATE", "A retirada precisa corresponder a uma reserva existente.");
      }
      physicalAfter = stock.physical - quantity;
      reservedAfter = stock.reserved - quantity;
      break;
    case "devolucao_avaria":
      // Itens avariados ficam registrados, mas não voltam ao saldo disponível.
      break;
    default: {
      const exhaustive: never = type;
      throw new InventoryRuleError("INVALID_STATE", `Movimento desconhecido: ${String(exhaustive)}`);
    }
  }

  if (physicalAfter < 0 || reservedAfter < 0 || reservedAfter > physicalAfter) {
    throw new InventoryRuleError("INSUFFICIENT_STOCK", "O movimento deixaria o saldo negativo ou com reserva maior que o físico.");
  }
  return { physicalBefore: stock.physical, physicalAfter, reservedBefore: stock.reserved, reservedAfter };
}

/** Valida o motivo e a justificativa de um movimento manual. */
export function assertManualMovementReason(type: ManualMovementType, reason: MovementReason, note?: string | null) {
  if (!REASONS_BY_MANUAL_TYPE[type].includes(reason)) {
    throw new InventoryRuleError("INVALID_REASON", `O motivo "${MOVEMENT_REASON_LABELS[reason] ?? reason}" não se aplica a ${MOVEMENT_TYPE_LABELS[type].toLowerCase()}.`);
  }
  const needsJustification = type === "ajuste_entrada" || type === "ajuste_saida" || reason === "outro" || reason === "perda" || reason === "avaria";
  if (needsJustification && (note ?? "").trim().length < MIN_JUSTIFICATION_LENGTH) {
    throw new InventoryRuleError("JUSTIFICATION_REQUIRED", `Descreva a justificativa com pelo menos ${MIN_JUSTIFICATION_LENGTH} caracteres.`);
  }
}

export type LoanSnapshot = {
  status: LoanStatus;
  quantity: number;
  returnedQuantity: number;
  damagedQuantity: number;
};

export function outstandingLoanQuantity(loan: LoanSnapshot) {
  return Math.max(0, loan.quantity - loan.returnedQuantity - loan.damagedQuantity);
}

export function assertLoanTransition(loan: LoanSnapshot, action: "deliver" | "cancel" | "return") {
  const allowed: Record<typeof action, LoanStatus[]> = {
    deliver: ["reservado"],
    cancel: ["reservado"],
    return: ["retirado"],
  };
  if (!allowed[action].includes(loan.status)) {
    const verb = action === "deliver" ? "confirmar a retirada" : action === "cancel" ? "cancelar" : "registrar devolução";
    throw new InventoryRuleError("INVALID_STATE", `Não é possível ${verb}: o empréstimo está ${LOAN_STATUS_LABELS[loan.status].toLowerCase()}.`);
  }
}

/** Calcula o estado do empréstimo após uma devolução (parcial ou total). */
export function planLoanReturn(loan: LoanSnapshot, goodQuantity: number, damagedQuantity: number) {
  assertLoanTransition(loan, "return");
  for (const value of [goodQuantity, damagedQuantity]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new InventoryRuleError("INVALID_QUANTITY", "As quantidades devolvidas precisam ser inteiras e não negativas.");
    }
  }
  const total = goodQuantity + damagedQuantity;
  const outstanding = outstandingLoanQuantity(loan);
  if (total < 1) throw new InventoryRuleError("INVALID_QUANTITY", "Informe ao menos uma unidade devolvida.");
  if (total > outstanding) {
    throw new InventoryRuleError("INVALID_QUANTITY", `A devolução excede o pendente: restam ${outstanding} a devolver.`);
  }
  const returnedQuantity = loan.returnedQuantity + goodQuantity;
  const damaged = loan.damagedQuantity + damagedQuantity;
  const closed = returnedQuantity + damaged >= loan.quantity;
  return {
    returnedQuantity,
    damagedQuantity: damaged,
    status: (closed ? "devolvido" : "retirado") as LoanStatus,
    closed,
    outstandingAfter: loan.quantity - returnedQuantity - damaged,
  };
}

export type ItemRuleContext = {
  physical: number;
  reserved: number;
  unit: ItemUnit;
  returnable: boolean;
  status: ItemStatus;
  hasMovements: boolean;
  activeLoans: number;
};

/**
 * Impede edições que reinterpretariam o histórico (ex.: trocar UN por JG com
 * saldo) ou que deixariam empréstimos ativos inconsistentes.
 */
export function assertItemEditAllowed(current: ItemRuleContext, next: { unit: ItemUnit; returnable: boolean; status: ItemStatus }) {
  if (next.unit !== current.unit && (current.hasMovements || current.physical > 0 || current.reserved > 0)) {
    throw new InventoryRuleError("LOCKED_FIELD", "A unidade não pode mudar depois que o item tem saldo ou movimentações. Cadastre outro item para a nova unidade.");
  }
  if (next.returnable !== current.returnable && current.activeLoans > 0) {
    throw new InventoryRuleError("LOCKED_FIELD", "Há empréstimos em andamento: conclua-os antes de mudar o tipo de controle (devolvível/consumível).");
  }
  if (next.status !== "disponivel" && current.reserved > 0) {
    throw new InventoryRuleError("LOCKED_FIELD", "Há quantidades reservadas: cancele ou entregue as reservas antes de marcar o item como indisponível.");
  }
}

export function assertArchiveAllowed(current: Pick<ItemRuleContext, "reserved" | "activeLoans">) {
  if (current.activeLoans > 0 || current.reserved > 0) {
    throw new InventoryRuleError("LOCKED_FIELD", "Há empréstimos ou reservas em andamento. Conclua-os antes de arquivar o item.");
  }
}

export type StockHealth = "arquivado" | "manutencao" | "indisponivel" | "sem_saldo" | "baixo" | "ok";

export const STOCK_HEALTH_LABELS: Record<StockHealth, string> = {
  arquivado: "Arquivado",
  manutencao: "Em manutenção",
  indisponivel: "Indisponível",
  sem_saldo: "Sem saldo",
  baixo: "Estoque baixo",
  ok: "Disponível",
};

export function isLowStock(item: { physical: number; reserved: number; minQuantity: number; archived: boolean }) {
  if (item.archived || item.minQuantity <= 0) return false;
  return availableQuantity(item) <= item.minQuantity;
}

export function stockHealth(item: { physical: number; reserved: number; minQuantity: number; archived: boolean; status: ItemStatus }): StockHealth {
  if (item.archived) return "arquivado";
  if (item.status === "manutencao") return "manutencao";
  if (item.status === "indisponivel") return "indisponivel";
  if (availableQuantity(item) === 0) return "sem_saldo";
  if (isLowStock(item)) return "baixo";
  return "ok";
}

/** Normaliza o código patrimonial/interno para comparação de duplicidade. */
export function normalizeItemCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "-");
}

/** Mapeia a categoria pedagógica de um recurso para o tipo de item do estoque. */
export const RESOURCE_CATEGORY_TO_ITEM_TYPE: Record<"materials" | "machines" | "tools" | "parts", ItemType> = {
  materials: "material",
  machines: "machine",
  tools: "tool",
  parts: "part",
};
