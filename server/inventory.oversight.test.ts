/** Supervisão do estoque: agregação por turma/docente e alertas (regras puras, sem banco). */
import { describe, expect, it } from "vitest";
import { buildInventoryOversight, NO_CLASSROOM_LABEL, type OversightLoan, type OversightMovement } from "@shared/inventory-oversight";

const NOW = new Date("2026-10-20T12:00:00Z").getTime();
const ana = { id: 2, name: "Ana Docente", email: "ana@escola.br" };
const bruno = { id: 3, name: "Bruno Docente", email: "bruno@escola.br" };
const classrooms = [
  { id: 10, name: "2º Mecânica A", teacher: ana, students: 20 },
  { id: 11, name: "2º Mecânica B", teacher: bruno, students: 18 },
  { id: 12, name: "3º Eletro", teacher: null, students: 15 },
];

let nextId = 1;
function movement(overrides: Partial<OversightMovement>): OversightMovement {
  return {
    id: nextId++,
    itemId: 1,
    itemCode: "PIN-10",
    itemName: "Pino-guia",
    unit: "UN",
    type: "saida",
    quantity: 1,
    reason: "aula",
    reference: null,
    note: null,
    classroomId: 10,
    createdAt: new Date(NOW - 86_400_000),
    user: ana,
    ...overrides,
  };
}

function loan(overrides: Partial<OversightLoan>): OversightLoan {
  return {
    id: nextId++,
    itemCode: "PAQ-150",
    itemName: "Paquímetro",
    unit: "UN",
    classroomId: 10,
    quantity: 1,
    returnedQuantity: 0,
    damagedQuantity: 0,
    status: "retirado",
    dueAt: null,
    createdAt: new Date(NOW - 86_400_000),
    inPeriod: true,
    createdBy: ana,
    ...overrides,
  };
}

describe("supervisão do estoque", () => {
  it("soma saídas por turma, lista todas as turmas ativas e não expõe alunos", () => {
    const result = buildInventoryOversight(
      classrooms,
      [movement({ quantity: 4 }), movement({ type: "retirada", quantity: 2, reason: "emprestimo", classroomId: 11, user: bruno }), movement({ type: "entrada", quantity: 50, reason: "compra" })],
      [],
      NOW,
    );
    const byId = new Map(result.classrooms.map(row => [row.id, row]));
    expect(byId.get(10)).toMatchObject({ outQuantity: 4, teacher: ana });
    expect(byId.get(11)).toMatchObject({ outQuantity: 2, teacher: bruno });
    expect(byId.get(12)).toMatchObject({ outQuantity: 0 });
    expect(result.totals).toMatchObject({ outQuantity: 6, inQuantity: 50 });
    expect(JSON.stringify(result)).not.toMatch(/borrower/i);
  });

  it("movimento sem turma aparece em 'Sem turma' e o alerta vai para quem registrou", () => {
    const result = buildInventoryOversight(classrooms, [movement({ type: "ajuste_saida", reason: "perda", quantity: 3, classroomId: null, user: bruno, note: "Sumiu da bancada" })], [], NOW);
    expect(result.classrooms.find(row => row.id === null)).toMatchObject({ name: NO_CLASSROOM_LABEL, outQuantity: 3, lostQuantity: 3 });
    expect(result.alerts[0]).toMatchObject({ kind: "baixa_manual", severity: "alta", teacher: bruno, registeredBy: null });
  });

  it("alerta de turma aponta o docente responsável e informa quem registrou", () => {
    const result = buildInventoryOversight(classrooms, [movement({ type: "devolucao_avaria", reason: "avaria", classroomId: 10, user: bruno })], [], NOW);
    expect(result.alerts[0]).toMatchObject({ kind: "avaria", classroom: "2º Mecânica A", teacher: ana, registeredBy: bruno });
  });

  it("empréstimo atrasado gera alerta alto para o responsável da turma", () => {
    const result = buildInventoryOversight(classrooms, [], [loan({ classroomId: 11, createdBy: ana, dueAt: new Date(NOW - 3 * 86_400_000), quantity: 2 })], NOW);
    expect(result.totals.overdueLoans).toBe(1);
    expect(result.classrooms.find(row => row.id === 11)).toMatchObject({ overdue: 1, outstanding: 2 });
    expect(result.alerts[0]).toMatchObject({ kind: "atraso", severity: "alta", teacher: bruno, registeredBy: ana });
    expect(result.alerts[0]?.detail).toContain("3 dia(s)");
  });

  it("empréstimo antigo ainda aberto conta como em aberto, mas não como empréstimo do período", () => {
    const result = buildInventoryOversight(classrooms, [], [loan({ inPeriod: false })], NOW);
    expect(result.classrooms.find(row => row.id === 10)).toMatchObject({ loans: 0, outstanding: 1 });
    expect(result.totals.loansCreated).toBe(0);
  });

  it("turma que retira muito acima das demais gera alerta de consumo", () => {
    const result = buildInventoryOversight(
      classrooms,
      [movement({ quantity: 30, classroomId: 10 }), movement({ quantity: 4, classroomId: 11, user: bruno }), movement({ quantity: 5, classroomId: 12 })],
      [],
      NOW,
    );
    const consumption = result.alerts.filter(alert => alert.kind === "consumo_alto");
    expect(consumption).toHaveLength(1);
    expect(consumption[0]).toMatchObject({ classroom: "2º Mecânica A", teacher: ana });
  });

  it("consumo parecido entre turmas não gera alerta", () => {
    const result = buildInventoryOversight(classrooms, [movement({ quantity: 6, classroomId: 10 }), movement({ quantity: 5, classroomId: 11 })], [], NOW);
    expect(result.alerts.filter(alert => alert.kind === "consumo_alto")).toHaveLength(0);
  });

  it("registros por docente somam saídas, baixas manuais e empréstimos e mostram as turmas dele", () => {
    const result = buildInventoryOversight(
      classrooms,
      [movement({ quantity: 2 }), movement({ type: "ajuste_saida", reason: "correcao", quantity: 1, note: "contagem" }), movement({ type: "cancelamento_reserva", reason: "emprestimo" })],
      [loan({}), loan({ status: "cancelado" })],
      NOW,
    );
    expect(result.teachers.find(row => row.id === ana.id)).toMatchObject({ outQuantity: 3, manualOut: 1, loansCreated: 1, loansCancelled: 1, classrooms: ["2º Mecânica A"] });
  });

  it("alertas altos vêm primeiro", () => {
    const result = buildInventoryOversight(
      classrooms,
      [movement({ type: "saida", reason: "outro" }), movement({ type: "ajuste_saida", reason: "perda" })],
      [],
      NOW,
    );
    expect(result.alerts.map(alert => alert.severity)).toEqual(["alta", "media"]);
  });
});
