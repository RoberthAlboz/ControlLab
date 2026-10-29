import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getNotesOfStudent: vi.fn(),
  getStudentNotes: vi.fn(),
}));

vi.mock("./db", async (importOriginal) => ({ ...(await importOriginal<typeof import("./db")>()), ...db }));

import { appRouter } from "./routers";
import { makeContext, makeUser } from "./test-utils";

const saved = {
  content: JSON.stringify([{ id: "n1", date: "2026-10-08", periodId: 2, subject: "CNC", title: "Torno", body: "Avanço", updatedAt: "2026-10-08T10:00:00.000Z" }]),
  updatedAt: new Date("2026-10-08T10:00:00.000Z"),
};

describe("diário de aula: consulta do docente", () => {
  beforeEach(() => vi.clearAllMocks());

  it("docente lê as anotações de um aluno", async () => {
    db.getNotesOfStudent.mockResolvedValue({ student: { id: 7, name: "Ana" }, saved });
    const result = await appRouter.createCaller(makeContext(makeUser("teacher")).ctx).notes.ofStudent({ studentId: 7 });
    expect(db.getNotesOfStudent).toHaveBeenCalledWith(7, expect.objectContaining({ id: 2, role: "teacher" }));
    expect(result.student).toEqual({ id: 7, name: "Ana" });
    expect(result.notes).toEqual([expect.objectContaining({ id: "n1", title: "Torno", body: "Avanço" })]);
  });

  it("aluno sem diário salvo devolve lista nula", async () => {
    db.getNotesOfStudent.mockResolvedValue({ student: { id: 7, name: "Ana" }, saved: null });
    const result = await appRouter.createCaller(makeContext(makeUser("admin")).ctx).notes.ofStudent({ studentId: 7 });
    expect(result).toEqual({ student: { id: 7, name: "Ana" }, notes: null, updatedAt: null });
  });

  it("id que não é de aluno responde NOT_FOUND", async () => {
    db.getNotesOfStudent.mockResolvedValue(null);
    await expect(appRouter.createCaller(makeContext(makeUser("teacher")).ctx).notes.ofStudent({ studentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("aluno não lê o diário de outro aluno, e visitante não lê nenhum", async () => {
    await expect(appRouter.createCaller(makeContext(makeUser("student")).ctx).notes.ofStudent({ studentId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(makeContext(null).ctx).notes.ofStudent({ studentId: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.getNotesOfStudent).not.toHaveBeenCalled();
  });
});
