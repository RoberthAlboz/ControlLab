import { describe, expect, it } from "vitest";
import {
  FOCUS_SESSION_TARGET_MS,
  formatFocusTime,
  getElapsedFocusMs,
  getFocusProgressPercent,
  normalizeFocusTimerState,
  resetFocusTimer,
  toggleFocusTimer,
} from "@shared/focus-timer";

describe("cronômetro de foco da aula", () => {
  it("inicia e pausa usando horários absolutos", () => {
    const started = toggleFocusTimer(resetFocusTimer(), 1_000);
    expect(started).toEqual({ elapsedMs: 0, startedAt: 1_000 });
    const paused = toggleFocusTimer(started, 31_000);
    expect(paused).toEqual({ elapsedMs: 30_000, startedAt: null });
  });

  it("retoma do tempo acumulado sem perder a sessão", () => {
    const resumed = toggleFocusTimer({ elapsedMs: 90_000, startedAt: null }, 5_000);
    expect(resumed).toEqual({ elapsedMs: 90_000, startedAt: 5_000 });
    expect(getElapsedFocusMs(resumed, 15_000)).toBe(100_000);
  });

  it("limita o tempo e o progresso à meta de 45 minutos", () => {
    const state = { elapsedMs: 0, startedAt: 10_000 };
    expect(getElapsedFocusMs(state, 10_000 + FOCUS_SESSION_TARGET_MS + 60_000)).toBe(FOCUS_SESSION_TARGET_MS);
    expect(getFocusProgressPercent(state, 10_000 + FOCUS_SESSION_TARGET_MS)).toBe(100);
    expect(toggleFocusTimer(state, 10_000 + FOCUS_SESSION_TARGET_MS)).toEqual({ elapsedMs: FOCUS_SESSION_TARGET_MS, startedAt: null });
  });

  it("normaliza dados inválidos ou fora do intervalo", () => {
    expect(normalizeFocusTimerState(null)).toEqual({ elapsedMs: 0, startedAt: null });
    expect(normalizeFocusTimerState({ elapsedMs: -5, startedAt: "agora" })).toEqual({ elapsedMs: 0, startedAt: null });
    expect(normalizeFocusTimerState({ elapsedMs: FOCUS_SESSION_TARGET_MS + 100, startedAt: null })).toEqual({ elapsedMs: FOCUS_SESSION_TARGET_MS, startedAt: null });
  });

  it("formata a duração em minutos e segundos", () => {
    expect(formatFocusTime(0)).toBe("00:00");
    expect(formatFocusTime(125_999)).toBe("02:05");
    expect(formatFocusTime(45 * 60 * 1000)).toBe("45:00");
  });
});
