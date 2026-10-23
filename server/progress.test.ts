import { describe, expect, it } from "vitest";
import {
  filterStudySessionsByVisibleModules,
  getElapsedStudySeconds,
  getFirstChangedStepIndex,
  hasSequentialStepPositions,
  isStepCompleted,
  MAX_ELAPSED_SECONDS,
  normalizeElapsedSeconds,
  normalizeProgressRowsWithStepCounts,
  resolveProgressUpdate,
  sanitizeStoredElapsedSeconds,
  selectCanonicalProgressRows,
  summarizeCompletedStudyTime,
} from "@shared/progress";

describe("progresso sequencial do módulo", () => {
  it("deriva percentual do número de etapas concluídas", () => {
    expect(resolveProgressUpdate(4, 0, 1)).toEqual({ stepIndex: 1, progress: 25 });
    expect(resolveProgressUpdate(4, 3, 4)).toEqual({ stepIndex: 4, progress: 100 });
  });

  it("não permite pular etapas nem regredir o progresso salvo", () => {
    expect(() => resolveProgressUpdate(4, 0, 2)).toThrow("Conclua as etapas em sequência");
    expect(resolveProgressUpdate(4, 2, 1)).toEqual({ stepIndex: 2, progress: 50 });
  });

  it("recusa módulos vazios e índices fora dos limites", () => {
    expect(() => resolveProgressUpdate(0, 0, 0)).toThrow("pelo menos uma etapa");
    expect(() => resolveProgressUpdate(4, 0, 5)).toThrow("não pertence");
  });

  it("usa a linha mais avançada e resolve empates pelo registro mais recente", () => {
    const oldDate = new Date("2026-10-16T10:00:00Z");
    const newDate = new Date("2026-10-17T10:00:00Z");
    const rows = selectCanonicalProgressRows([
      { id: 1, userId: 1, moduleId: "m", stepIndex: 2, progress: 50, updatedAt: oldDate },
      { id: 2, userId: 1, moduleId: "m", stepIndex: 1, progress: 25, updatedAt: newDate },
      { id: 3, userId: 2, moduleId: "n", stepIndex: 2, progress: 50, updatedAt: oldDate },
      { id: 4, userId: 2, moduleId: "n", stepIndex: 2, progress: 75, updatedAt: newDate },
      { id: 5, userId: 3, moduleId: null, stepIndex: 1, progress: 50, updatedAt: newDate },
      { id: 6, userId: 4, moduleId: "invalid", stepIndex: -1, progress: 50, updatedAt: newDate },
    ]);

    expect(rows.map(({ id }) => id)).toEqual([1, 4]);
  });

  it("limita progresso legado ao número de etapas atuais e ignora módulos vazios", () => {
    const rows = normalizeProgressRowsWithStepCounts([
      { id: 1, userId: 1, moduleId: "m", stepIndex: 9, progress: 99, updatedAt: new Date() },
      { id: 2, userId: 2, moduleId: "empty", stepIndex: 1, progress: 100, updatedAt: new Date() },
    ], new Map([["m", 3], ["empty", 0]]));

    expect(rows).toEqual([expect.objectContaining({ moduleId: "m", stepIndex: 3, totalSteps: 3, progress: 100 })]);
  });

  it("identifica a primeira etapa estruturalmente alterada", () => {
    expect(getFirstChangedStepIndex(["a", "b"], ["a", "b"])).toBeNull();
    expect(getFirstChangedStepIndex(["a", "b", "c"], ["a", "c", "b"])).toBe(1);
    expect(getFirstChangedStepIndex(["a", "b"], ["a", "b", "c"])).toBe(2);
    expect(getFirstChangedStepIndex(["a", "b"], ["a"])).toBe(1);
  });

  it("exige posições de etapa reais, únicas e sequenciais", () => {
    expect(hasSequentialStepPositions([2, 0, 1])).toBe(true);
    expect(hasSequentialStepPositions([0, 2])).toBe(false);
    expect(hasSequentialStepPositions([0, 0])).toBe(false);
    expect(hasSequentialStepPositions([])).toBe(false);
  });

  it("filtra horas de módulos que não estão visíveis para o viewer", () => {
    const sessions = [{ moduleId: "publicado", elapsedSeconds: 45 }, { moduleId: "rascunho", elapsedSeconds: 120 }];
    expect(filterStudySessionsByVisibleModules(sessions, new Set(["publicado"])) ).toEqual([sessions[0]]);
    expect(filterStudySessionsByVisibleModules(sessions, new Set(["publicado", "rascunho"]))).toEqual(sessions);
  });

  it("sanitiza uma duração histórica inválida antes de responder a retries", () => {
    expect(sanitizeStoredElapsedSeconds(-1)).toBe(0);
    expect(sanitizeStoredElapsedSeconds(MAX_ELAPSED_SECONDS + 1)).toBe(0);
    expect(sanitizeStoredElapsedSeconds(73)).toBe(73);
  });

  it("recusa tempos negativos, fracionários ou acima do limite da sessão", () => {
    expect(normalizeElapsedSeconds(MAX_ELAPSED_SECONDS)).toBe(MAX_ELAPSED_SECONDS);
    expect(() => normalizeElapsedSeconds(-1)).toThrow("entre 0 e 24 horas");
    expect(() => normalizeElapsedSeconds(MAX_ELAPSED_SECONDS + 1)).toThrow("entre 0 e 24 horas");
    expect(() => normalizeElapsedSeconds(1.5)).toThrow("entre 0 e 24 horas");
  });

  it("soma somente os segundos de etapas concluídas e respeita o período", () => {
    const periodStart = new Date("2026-10-17T00:00:00.000Z");
    expect(summarizeCompletedStudyTime([
      { elapsedSeconds: 38, completedAt: new Date("2026-10-17T12:00:00.000Z") },
      { elapsedSeconds: 37, completedAt: new Date("2026-10-17T12:01:00.000Z") },
      { elapsedSeconds: 120, completedAt: null },
      { elapsedSeconds: 55, completedAt: new Date("2026-10-16T23:59:59.000Z") },
    ], periodStart)).toEqual({ elapsedSeconds: 75, studiedMinutes: 2 });
  });

  it("ignora duração persistida inválida para que uma linha histórica não derrube o agregado", () => {
    const completedAt = new Date("2026-10-17T12:00:00.000Z");
    expect(summarizeCompletedStudyTime([
      { elapsedSeconds: MAX_ELAPSED_SECONDS + 1, completedAt },
      { elapsedSeconds: -1, completedAt },
      { elapsedSeconds: 45, completedAt },
    ])).toEqual({ elapsedSeconds: 45, studiedMinutes: 1 });
  });

  it("mantém o total em zero quando ainda não há timer concluído", () => {
    expect(summarizeCompletedStudyTime([])).toEqual({ elapsedSeconds: 0, studiedMinutes: 0 });
  });

  it("mantém concluídas as etapas abaixo do progresso confirmado", () => {
    expect(isStepCompleted(0, 1)).toBe(true);
    expect(isStepCompleted(1, 1)).toBe(false);
    expect(isStepCompleted(0, 0)).toBe(false);
  });
});

describe("segundos inteiros do timer por etapa", () => {
  it("usa piso igual para o display, o payload e o cálculo server-side", () => {
    const startedAt = 1_000;
    expect(getElapsedStudySeconds(startedAt, 2_499)).toBe(1);
    expect(getElapsedStudySeconds(startedAt, 2_500)).toBe(1);
    expect(getElapsedStudySeconds(startedAt, 2_999)).toBe(1);
    expect(getElapsedStudySeconds(startedAt, 3_000)).toBe(2);
  });

  it("não produz tempo negativo e limita sessões ao máximo aceito", () => {
    expect(getElapsedStudySeconds(2_000, 1_000)).toBe(0);
    expect(getElapsedStudySeconds(0, (MAX_ELAPSED_SECONDS + 30) * 1000)).toBe(MAX_ELAPSED_SECONDS);
    expect(getElapsedStudySeconds(Number.NaN, 1000)).toBe(0);
  });
});
