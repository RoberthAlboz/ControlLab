export const FOCUS_SESSION_TARGET_MS = 45 * 60 * 1000;

export type FocusTimerState = {
  elapsedMs: number;
  startedAt: number | null;
};

export const initialFocusTimerState: FocusTimerState = {
  elapsedMs: 0,
  startedAt: null,
};

export function normalizeFocusTimerState(value: unknown): FocusTimerState {
  if (!value || typeof value !== "object") return initialFocusTimerState;
  const candidate = value as Partial<FocusTimerState>;
  const elapsedMs = Number.isFinite(candidate.elapsedMs)
    ? Math.max(0, Math.min(FOCUS_SESSION_TARGET_MS, Number(candidate.elapsedMs)))
    : 0;
  const startedAt = Number.isFinite(candidate.startedAt)
    ? Math.max(0, Number(candidate.startedAt))
    : null;
  return { elapsedMs, startedAt };
}

export function getElapsedFocusMs(state: FocusTimerState, now = Date.now()): number {
  const runningMs = state.startedAt === null ? 0 : Math.max(0, now - state.startedAt);
  return Math.min(FOCUS_SESSION_TARGET_MS, state.elapsedMs + runningMs);
}

export function toggleFocusTimer(state: FocusTimerState, now = Date.now()): FocusTimerState {
  const elapsedMs = getElapsedFocusMs(state, now);
  if (state.startedAt !== null || elapsedMs >= FOCUS_SESSION_TARGET_MS) {
    return { elapsedMs, startedAt: null };
  }
  return { elapsedMs, startedAt: now };
}

export function resetFocusTimer(): FocusTimerState {
  return initialFocusTimerState;
}

export function getFocusProgressPercent(state: FocusTimerState, now = Date.now()): number {
  return Math.round((getElapsedFocusMs(state, now) / FOCUS_SESSION_TARGET_MS) * 100);
}

export function formatFocusTime(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
