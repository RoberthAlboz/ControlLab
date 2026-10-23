import { describe, expect, it } from "vitest";
import {
  CLASS_PERIOD_MINUTES,
  classSchedule,
  createPeriodDate,
  findClassPeriodForDate,
  isSchoolDate,
  nearestClassPeriod,
} from "@shared/class-schedule";
import { makeStudentNote, parseStoredNotes, removeStudentNote, searchStudentNotes, updateStudentNote } from "@shared/notes";

describe("grade comum de aulas e anotações", () => {
  it("mantém 12 períodos consecutivos de 45 minutos entre 07:45 e 16:45", () => {
    expect(classSchedule).toHaveLength(12);
    expect(classSchedule[0]).toMatchObject({ id: 1, label: "Aula 1", start: "07:45", end: "08:30" });
    expect(classSchedule[11]).toMatchObject({ id: 12, start: "16:00", end: "16:45" });
    for (let index = 0; index < classSchedule.length; index += 1) {
      const period = classSchedule[index];
      const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
      expect(minutes(period.end) - minutes(period.start)).toBe(CLASS_PERIOD_MINUTES);
      if (index > 0) expect(period.start).toBe(classSchedule[index - 1].end);
    }
  });

  it("usa slots iguais para horário salvo e horário de anotação", () => {
    const slot = createPeriodDate("2026-10-09", 3);
    expect(slot.toISOString()).toBe("2026-10-09T09:15:00.000Z");
    expect(findClassPeriodForDate(slot)).toMatchObject({ id: 3, start: "09:15", end: "10:00" });
    expect(nearestClassPeriod("09:00").id).toBe(3);
  });

  it("aceita somente datas letivas de segunda a sexta", () => {
    expect(isSchoolDate("2026-10-09")).toBe(true);
    expect(isSchoolDate("2026-10-10")).toBe(false);
    expect(isSchoolDate("2026-02-30")).toBe(false);
  });
});

describe("student notes by class period", () => {
  it("creates a note linked to a period and subject", () => {
    const note = makeStudentNote(3, "Metrologia", 0);
    expect(note).toEqual({
      id: "note-0", date: "1970-01-01", periodId: 3, subject: "Metrologia", title: "",
      body: "", updatedAt: "1970-01-01T00:00:00.000Z",
    });
  });

  it("updates only the selected note and refreshes its timestamp", () => {
    const first = makeStudentNote(1, "CNC", 1);
    const second = makeStudentNote(2, "Montagem", 2);
    const updated = updateStudentNote([first, second], first.id, { date: "2026-10-08", periodId: 4, title: "Medição" }, 3);
    expect(updated[0]).toMatchObject({ id: first.id, date: "2026-10-08", periodId: 4, subject: "CNC", title: "Medição", updatedAt: "1970-01-01T00:00:00.003Z" });
    expect(updated[1]).toEqual(second);
  });

  it("removes only the selected note", () => {
    const first = makeStudentNote(1, "CNC", 1);
    const second = makeStudentNote(2, "Montagem", 2);
    expect(removeStudentNote([first, second], first.id)).toEqual([second]);
  });
});

describe("anotações salvas no navegador", () => {
  it("mantém os dados salvos e só completa campos ausentes ou vazios", () => {
    const parsed = parseStoredNotes(
      [
        { id: "a", date: "2026-10-08", periodId: 4, subject: "CNC", title: "Torno", body: "Avanço", updatedAt: "2026-10-08T10:00:00.000Z" },
        { id: "b", date: undefined, periodId: undefined, subject: "", title: "Sem data", body: "x", updatedAt: "2026-10-09T10:00:00.000Z" },
      ],
      "2026-10-20",
    );
    expect(parsed[0]).toMatchObject({ id: "a", date: "2026-10-08", periodId: 4, subject: "CNC" });
    expect(parsed[1]).toMatchObject({ id: "b", date: "2026-10-20", periodId: 1, subject: "Ferramentaria", title: "Sem data" });
  });

  it("descarta entradas inválidas", () => {
    expect(parseStoredNotes("não é lista", "2026-10-20")).toEqual([]);
    expect(parseStoredNotes([null, 3, { title: "sem id" }], "2026-10-20")).toEqual([]);
  });

  it("busca sem diferenciar acentos e maiúsculas, mais recentes primeiro", () => {
    const notes = parseStoredNotes(
      [
        { id: "1", title: "Medição", body: "paquímetro", subject: "Metrologia", updatedAt: "2026-10-01T10:00:00.000Z" },
        { id: "2", title: "Torno", body: "medicao do diametro", subject: "CNC", updatedAt: "2026-10-05T10:00:00.000Z" },
        { id: "3", title: "Segurança", body: "EPI", subject: "Segurança", updatedAt: "2026-10-06T10:00:00.000Z" },
      ],
      "2026-10-20",
    );
    expect(searchStudentNotes(notes, "MEDICAO").map((note) => note.id)).toEqual(["2", "1"]);
    expect(searchStudentNotes(notes, "   ")).toEqual([]);
  });
});
