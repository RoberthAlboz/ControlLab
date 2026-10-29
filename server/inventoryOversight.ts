/**
 * Leitura para a supervisão do estoque (admin.inventory.oversight): busca as
 * linhas do período e delega a agregação às regras puras de
 * `shared/inventory-oversight.ts`.
 */
import { and, count, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { classrooms, inventoryLoans, inventoryItems, inventoryMovements, users } from "../drizzle/schema";
import { buildInventoryOversight, type OversightPerson, type OversightPeriod } from "@shared/inventory-oversight";
import { requireDb } from "./db";

function person(id: number, name: string | null, email: string | null): OversightPerson {
  return { id, name: name || email || `Conta #${id}`, email };
}

export async function getInventoryOversight(periodDays: OversightPeriod, now = Date.now()) {
  const db = await requireDb();
  const from = new Date(now - periodDays * 86_400_000);
  const teacher = alias(users, "teacher");

  const [classroomRows, studentCounts, movementRows, loanRows] = await Promise.all([
    db
      .select({ id: classrooms.id, name: classrooms.name, teacherId: teacher.id, teacherName: teacher.name, teacherEmail: teacher.email })
      .from(classrooms)
      .leftJoin(teacher, eq(teacher.id, classrooms.teacherId))
      .where(isNull(classrooms.archivedAt)),
    db
      .select({ classroomId: users.classroomId, total: count() })
      .from(users)
      .where(and(eq(users.role, "student"), eq(users.active, 1)))
      .groupBy(users.classroomId),
    db
      .select({ movement: inventoryMovements, userName: users.name, userEmail: users.email })
      .from(inventoryMovements)
      .innerJoin(users, eq(users.id, inventoryMovements.userId))
      .where(gte(inventoryMovements.createdAt, from)),
    db
      .select({
        loan: inventoryLoans,
        itemCode: inventoryItems.code,
        itemName: inventoryItems.name,
        itemUnit: inventoryItems.unit,
        createdByName: users.name,
        createdByEmail: users.email,
      })
      .from(inventoryLoans)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryLoans.itemId))
      .innerJoin(users, eq(users.id, inventoryLoans.createdBy))
      .where(or(gte(inventoryLoans.createdAt, from), inArray(inventoryLoans.status, ["reservado", "retirado"]))),
  ]);

  const students = new Map(studentCounts.map(row => [row.classroomId, Number(row.total)] as const));
  const fromMs = from.getTime();

  const oversight = buildInventoryOversight(
    classroomRows.map(row => ({
      id: row.id,
      name: row.name,
      teacher: row.teacherId ? person(row.teacherId, row.teacherName, row.teacherEmail) : null,
      students: students.get(row.id) ?? 0,
    })),
    movementRows.map(({ movement, userName, userEmail }) => ({
      id: movement.id,
      itemId: movement.itemId,
      itemCode: movement.itemCodeSnapshot,
      itemName: movement.itemNameSnapshot,
      unit: movement.unitSnapshot,
      type: movement.movementType,
      quantity: movement.quantity,
      reason: movement.reason,
      reference: movement.reference,
      note: movement.note,
      classroomId: movement.classroomId,
      createdAt: movement.createdAt,
      user: person(movement.userId, userName, userEmail),
    })),
    loanRows.map(row => ({
      id: row.loan.id,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unit: row.itemUnit,
      classroomId: row.loan.classroomId,
      quantity: row.loan.quantity,
      returnedQuantity: row.loan.returnedQuantity,
      damagedQuantity: row.loan.damagedQuantity,
      status: row.loan.status,
      dueAt: row.loan.dueAt,
      createdAt: row.loan.createdAt,
      inPeriod: row.loan.createdAt.getTime() >= fromMs,
      createdBy: person(row.loan.createdBy, row.createdByName, row.createdByEmail),
    })),
    now,
  );
  return { periodDays, from, ...oversight };
}
