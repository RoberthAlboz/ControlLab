/**
 * Supervisão do estoque pela administração: agrega movimentações e
 * empréstimos de um período por TURMA (com o docente responsável) e por
 * docente que registrou, mais os itens que mais saem e alertas de uso
 * indevido. Cada alerta aponta o docente a acionar: o responsável pela turma
 * envolvida ou, sem turma, quem registrou a operação.
 *
 * A administração não acompanha alunos individualmente: nada aqui expõe o
 * nome de quem retirou.
 *
 * Funções puras (sem banco nem relógio): o servidor lê as linhas e passa `now`.
 */
import { isLoanOverdue, type MovementReason, type MovementType } from "./inventory";

export const OVERSIGHT_PERIODS = [7, 30, 90, 365] as const;
export type OversightPeriod = (typeof OVERSIGHT_PERIODS)[number];

/** Turma que retira este múltiplo da média das demais vira alerta. */
export const ABOVE_AVERAGE_FACTOR = 2;
/** Abaixo desta quantidade não há alerta de consumo (evita ruído com poucas peças). */
export const ABOVE_AVERAGE_MIN_QUANTITY = 5;

export type OversightPerson = { id: number; name: string; email: string | null };

export type OversightClassroom = { id: number; name: string; teacher: OversightPerson | null; students: number };

export type OversightMovement = {
  id: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  type: MovementType;
  quantity: number;
  reason: MovementReason;
  reference: string | null;
  note: string | null;
  classroomId: number | null;
  createdAt: Date;
  user: OversightPerson;
};

export type OversightLoan = {
  id: number;
  itemCode: string;
  itemName: string;
  unit: string;
  classroomId: number | null;
  quantity: number;
  returnedQuantity: number;
  damagedQuantity: number;
  status: string;
  dueAt: Date | null;
  createdAt: Date;
  /** Criado dentro do período analisado (os ativos entram mesmo se forem antigos). */
  inPeriod: boolean;
  createdBy: OversightPerson;
};

export type OversightAlert = {
  id: string;
  severity: "alta" | "media";
  kind: "atraso" | "avaria" | "baixa_manual" | "consumo_alto" | "motivo_vago";
  title: string;
  detail: string;
  at: Date;
  classroom: string | null;
  /** Docente a acionar (responsável pela turma; sem turma, quem registrou). */
  teacher: OversightPerson | null;
  /** Quem registrou a operação, quando for diferente do docente a acionar. */
  registeredBy: OversightPerson | null;
};

/** Saem fisicamente do estoque. */
const OUT_TYPES: MovementType[] = ["saida", "ajuste_saida", "retirada"];
const IN_TYPES: MovementType[] = ["entrada", "ajuste_entrada"];

export const NO_CLASSROOM_LABEL = "Sem turma / uso geral";

function outstandingOf(loan: OversightLoan) {
  return Math.max(0, loan.quantity - loan.returnedQuantity - loan.damagedQuantity);
}

function isLoss(movement: OversightMovement) {
  return movement.type === "devolucao_avaria" || (movement.type === "ajuste_saida" && (movement.reason === "perda" || movement.reason === "avaria"));
}

export function buildInventoryOversight(classrooms: OversightClassroom[], movements: OversightMovement[], loans: OversightLoan[], now: number) {
  const classroomById = new Map(classrooms.map(classroom => [classroom.id, classroom] as const));

  /** Docente a acionar e, se for outra pessoa, quem registrou. */
  const contactFor = (classroomId: number | null, registeredBy: OversightPerson) => {
    const responsible = classroomId ? (classroomById.get(classroomId)?.teacher ?? null) : null;
    const teacher = responsible ?? registeredBy;
    return { teacher, registeredBy: teacher.id === registeredBy.id ? null : registeredBy };
  };
  const classroomName = (classroomId: number | null) => (classroomId ? (classroomById.get(classroomId)?.name ?? "Turma removida") : null);

  // Por turma --------------------------------------------------------------
  type ClassroomRow = {
    id: number | null;
    name: string;
    teacher: OversightPerson | null;
    students: number;
    outQuantity: number;
    loans: number;
    outstanding: number;
    overdue: number;
    lostQuantity: number;
    manualOut: number;
  };
  const rows = new Map<number | null, ClassroomRow>();
  for (const classroom of classrooms) {
    rows.set(classroom.id, { id: classroom.id, name: classroom.name, teacher: classroom.teacher, students: classroom.students, outQuantity: 0, loans: 0, outstanding: 0, overdue: 0, lostQuantity: 0, manualOut: 0 });
  }
  const classroomRow = (classroomId: number | null) => {
    let row = rows.get(classroomId);
    if (!row) {
      row = { id: classroomId, name: classroomName(classroomId) ?? NO_CLASSROOM_LABEL, teacher: null, students: 0, outQuantity: 0, loans: 0, outstanding: 0, overdue: 0, lostQuantity: 0, manualOut: 0 };
      rows.set(classroomId, row);
    }
    return row;
  };

  // Por docente que registrou ----------------------------------------------
  type TeacherRow = OversightPerson & {
    classrooms: string[];
    movements: number;
    outQuantity: number;
    inQuantity: number;
    manualOut: number;
    lostQuantity: number;
    loansCreated: number;
    loansCancelled: number;
  };
  const teachers = new Map<number, TeacherRow>();
  const teacherRow = (person: OversightPerson) => {
    let row = teachers.get(person.id);
    if (!row) {
      row = { ...person, classrooms: [], movements: 0, outQuantity: 0, inQuantity: 0, manualOut: 0, lostQuantity: 0, loansCreated: 0, loansCancelled: 0 };
      teachers.set(person.id, row);
    }
    return row;
  };
  for (const classroom of classrooms) {
    if (classroom.teacher) teacherRow(classroom.teacher).classrooms.push(classroom.name);
  }

  // Por item ---------------------------------------------------------------
  type ItemRow = { itemId: number; code: string; name: string; unit: string; outQuantity: number; events: number };
  const items = new Map<number, ItemRow>();

  const totals = { movements: movements.length, outQuantity: 0, inQuantity: 0, lostQuantity: 0, loansCreated: 0, activeLoans: 0, overdueLoans: 0 };
  const alerts: OversightAlert[] = [];

  for (const movement of movements) {
    const teacher = teacherRow(movement.user);
    teacher.movements += 1;
    if (OUT_TYPES.includes(movement.type)) {
      teacher.outQuantity += movement.quantity;
      totals.outQuantity += movement.quantity;
      classroomRow(movement.classroomId).outQuantity += movement.quantity;
      const item = items.get(movement.itemId) ?? { itemId: movement.itemId, code: movement.itemCode, name: movement.itemName, unit: movement.unit, outQuantity: 0, events: 0 };
      item.outQuantity += movement.quantity;
      item.events += 1;
      items.set(movement.itemId, item);
    }
    if (IN_TYPES.includes(movement.type)) {
      teacher.inQuantity += movement.quantity;
      totals.inQuantity += movement.quantity;
    }
    if (movement.type === "ajuste_saida") {
      teacher.manualOut += 1;
      classroomRow(movement.classroomId).manualOut += 1;
    }
    if (movement.type === "cancelamento_reserva") teacher.loansCancelled += 1;
    if (isLoss(movement)) {
      teacher.lostQuantity += movement.quantity;
      totals.lostQuantity += movement.quantity;
      classroomRow(movement.classroomId).lostQuantity += movement.quantity;
    }

    const what = `${movement.quantity} ${movement.unit} de ${movement.itemCode} · ${movement.itemName}`;
    const base = { at: movement.createdAt, classroom: classroomName(movement.classroomId), ...contactFor(movement.classroomId, movement.user) };
    if (movement.type === "devolucao_avaria") {
      alerts.push({ id: `mov-${movement.id}`, severity: "media", kind: "avaria", title: "Devolução com avaria", detail: `${what} voltou danificado${movement.reference ? ` (${movement.reference})` : ""}.`, ...base });
    } else if (movement.type === "ajuste_saida") {
      alerts.push({
        id: `mov-${movement.id}`,
        severity: movement.reason === "perda" ? "alta" : "media",
        kind: "baixa_manual",
        title: movement.reason === "perda" ? "Baixa por perda" : "Baixa manual de saldo",
        detail: `${what} saiu do saldo sem empréstimo${movement.note ? ` — justificativa: “${movement.note}”` : ""}.`,
        ...base,
      });
    } else if (movement.type === "saida" && movement.reason === "outro") {
      alerts.push({
        id: `mov-${movement.id}`,
        severity: "media",
        kind: "motivo_vago",
        title: "Saída sem motivo definido",
        detail: `${what} saiu com motivo “Outro”${movement.note ? `: “${movement.note}”` : " e sem observação"}.`,
        ...base,
      });
    }
  }

  for (const loan of loans) {
    const row = classroomRow(loan.classroomId);
    if (loan.inPeriod && loan.status !== "cancelado") {
      row.loans += 1;
      totals.loansCreated += 1;
      teacherRow(loan.createdBy).loansCreated += 1;
    }
    if (loan.status === "reservado" || loan.status === "retirado") {
      row.outstanding += outstandingOf(loan);
      totals.activeLoans += 1;
    }
    if (isLoanOverdue(loan, now)) {
      row.overdue += 1;
      totals.overdueLoans += 1;
      const days = loan.dueAt ? Math.max(1, Math.floor((now - loan.dueAt.getTime()) / 86_400_000)) : 0;
      alerts.push({
        id: `loan-${loan.id}`,
        severity: "alta",
        kind: "atraso",
        title: `Empréstimo #${loan.id} atrasado`,
        detail: `${outstandingOf(loan)} ${loan.unit} de ${loan.itemCode} · ${loan.itemName} ainda não voltaram — ${days} dia(s) além do prazo.`,
        at: loan.dueAt ?? loan.createdAt,
        classroom: classroomName(loan.classroomId),
        ...contactFor(loan.classroomId, loan.createdBy),
      });
    }
  }

  // Turma que retira muito acima das demais --------------------------------
  const classroomRows = Array.from(rows.values());
  const consuming = classroomRows.filter(row => row.id !== null && row.outQuantity > 0);
  if (consuming.length >= 2) {
    const sum = consuming.reduce((total, row) => total + row.outQuantity, 0);
    for (const row of consuming) {
      const othersAverage = (sum - row.outQuantity) / (consuming.length - 1);
      if (row.outQuantity >= ABOVE_AVERAGE_MIN_QUANTITY && row.outQuantity >= othersAverage * ABOVE_AVERAGE_FACTOR) {
        alerts.push({
          id: `consumo-${row.id}`,
          severity: "media",
          kind: "consumo_alto",
          title: "Turma retirando acima da média",
          detail: `${row.name} retirou ${row.outQuantity} unidade(s) no período — ${(row.outQuantity / Math.max(othersAverage, 1)).toFixed(1)}× a média das demais turmas (${othersAverage.toFixed(1)}).`,
          at: new Date(now),
          classroom: row.name,
          teacher: row.teacher,
          registeredBy: null,
        });
      }
    }
  }

  const severityRank = { alta: 0, media: 1 } as const;
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.at.getTime() - a.at.getTime());

  return {
    totals,
    alerts,
    classrooms: classroomRows
      // "Sem turma" só aparece quando houve movimento sem turma.
      .filter(row => row.id !== null || row.outQuantity > 0 || row.loans > 0 || row.outstanding > 0)
      .sort((a, b) => b.outQuantity - a.outQuantity || b.loans - a.loans || a.name.localeCompare(b.name)),
    teachers: Array.from(teachers.values()).sort((a, b) => b.outQuantity - a.outQuantity || b.movements - a.movements || a.name.localeCompare(b.name)),
    topItems: Array.from(items.values())
      .sort((a, b) => b.outQuantity - a.outQuantity)
      .slice(0, 8),
    recentOut: movements
      .filter(movement => OUT_TYPES.includes(movement.type) || movement.type === "devolucao_avaria")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 30)
      .map(({ note: _note, ...movement }) => ({ ...movement, classroom: classroomName(movement.classroomId) ?? NO_CLASSROOM_LABEL })),
  };
}

export type InventoryOversight = ReturnType<typeof buildInventoryOversight>;
