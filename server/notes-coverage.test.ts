import { describe, expect, it } from "vitest";
import { getRecordedPeriodIds, type StudentNote } from "../shared/notes";

function note(id: string, date: string, periodId: number): StudentNote {
  return {
    id,
    date,
    periodId,
    subject: "Ferramentaria",
    title: `Nota ${id}`,
    body: "Conteúdo de teste",
    updatedAt: "2026-10-15T10:00:00.000Z",
  };
}

describe("getRecordedPeriodIds", () => {
  it("returns unique, valid periods in canonical schedule order", () => {
    const result = getRecordedPeriodIds([
      note("a", "2026-10-15", 3),
      note("b", "2026-10-15", 1),
      note("c", "2026-10-15", 3),
      note("d", "2026-10-15", 13),
      note("e", "2026-10-16", 2),
    ], "2026-10-15");

    expect(result).toEqual([1, 3]);
  });

  it("returns an empty list when the selected date has no notes", () => {
    expect(getRecordedPeriodIds([note("a", "2026-10-15", 1)], "2026-10-16")).toEqual([]);
  });
});
