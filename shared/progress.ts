export type ProgressUpdate = { stepIndex: number; progress: number };

/** Upper bound accepted for one client-reported study session. */
export const MAX_ELAPSED_SECONDS = 86_400;

export type ProgressSnapshot = {
  id?: number;
  userId: number;
  moduleId: string | null;
  stepIndex: number | null;
  updatedAt: Date | null;
};

/** Select one deterministic, most-advanced progress row per user/module. */
export function selectCanonicalProgressRows<T extends ProgressSnapshot>(rows: T[]): T[] {
  const canonical = new Map<string, T>();
  for (const candidate of rows) {
    if (!Number.isInteger(candidate.userId) || candidate.userId < 1
      || !candidate.moduleId || !Number.isInteger(candidate.stepIndex) || candidate.stepIndex! < 0) continue;
    const key = `${candidate.userId}:${candidate.moduleId}`;
    const current = canonical.get(key);
    if (!current) {
      canonical.set(key, candidate);
      continue;
    }
    const candidateIndex = candidate.stepIndex!;
    const currentIndex = current.stepIndex!;
    const candidateUpdatedAt = candidate.updatedAt?.getTime() ?? 0;
    const currentUpdatedAt = current.updatedAt?.getTime() ?? 0;
    const candidateId = candidate.id ?? 0;
    const currentId = current.id ?? 0;
    if (candidateIndex > currentIndex
      || (candidateIndex === currentIndex && candidateUpdatedAt > currentUpdatedAt)
      || (candidateIndex === currentIndex && candidateUpdatedAt === currentUpdatedAt && candidateId > currentId)) {
      canonical.set(key, candidate);
    }
  }
  return Array.from(canonical.values());
}

export function normalizeProgressRowsWithStepCounts<
  T extends ProgressSnapshot & { progress: number | null },
>(rows: T[], stepCounts: ReadonlyMap<string, number>): Array<T & { moduleId: string; stepIndex: number; progress: number; totalSteps: number }> {
  const normalized: Array<T & { moduleId: string; stepIndex: number; progress: number; totalSteps: number }> = [];
  for (const row of selectCanonicalProgressRows(rows)) {
    if (!row.moduleId || row.stepIndex === null) continue;
    const totalSteps = stepCounts.get(row.moduleId) ?? 0;
    if (!Number.isInteger(totalSteps) || totalSteps <= 0) continue;
    const stepIndex = Math.min(row.stepIndex, totalSteps);
    normalized.push({
      ...row,
      moduleId: row.moduleId,
      stepIndex,
      progress: Math.round((stepIndex / totalSteps) * 100),
      totalSteps,
    } as T & { moduleId: string; stepIndex: number; progress: number; totalSteps: number });
  }
  return normalized;
}

/** Return the first zero-based index whose stable step identity or position changed. */
export function getFirstChangedStepIndex(previousIds: string[], nextIds: string[]): number | null {
  const sharedLength = Math.min(previousIds.length, nextIds.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (previousIds[index] !== nextIds[index]) return index;
  }
  return previousIds.length === nextIds.length ? null : sharedLength;
}

/** Confirma que as etapas materializadas ocupam exatamente as posições 0..N-1. */
export function hasSequentialStepPositions(positions: number[]): boolean {
  if (positions.length === 0) return false;
  const sorted = positions.slice().sort((left, right) => left - right);
  return sorted.every((position, index) => Number.isInteger(position) && position === index);
}

export function normalizeElapsedSeconds(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_ELAPSED_SECONDS) {
    throw new Error("O tempo da sessão precisa estar entre 0 e 24 horas.");
  }
  return value;
}

/** Registros históricos inválidos não entram em totais nem são exibidos acima do limite. */
export function isValidStoredElapsedSeconds(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_ELAPSED_SECONDS;
}

export function sanitizeStoredElapsedSeconds(value: number): number {
  return isValidStoredElapsedSeconds(value) ? value : 0;
}

/** Quantiza o mesmo intervalo de relógio para exibição e persistência, em segundos inteiros. */
export function getElapsedStudySeconds(startedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.min(MAX_ELAPSED_SECONDS, Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)));
}

/** Tempo mínimo numa etapa antes de concluí-la: impede "passar direto" clicando. */
export const MIN_STEP_SECONDS = 20;
/** Teto de tempo creditado por etapa quando o módulo não informa a duração. */
export const DEFAULT_STEP_CAP_SECONDS = 30 * 60;
const MIN_STEP_CAP_SECONDS = 10 * 60;
const MAX_STEP_CAP_SECONDS = 2 * 60 * 60;

/** Minutos de um texto livre de duração ("45 min", "1h 30min", "2 h"); null se não houver número. */
export function parseDurationMinutes(duration: string | null | undefined): number | null {
  const text = (duration ?? "").toLowerCase();
  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*h/);
  const minutes = text.match(/(\d+)\s*m/);
  let total = 0;
  if (hours) total += Number(hours[1].replace(",", ".")) * 60;
  if (minutes) total += Number(minutes[1]);
  if (!hours && !minutes) {
    const bare = text.match(/\d+/);
    if (bare) total = Number(bare[0]);
  }
  return total > 0 ? Math.round(total) : null;
}

/**
 * Tempo máximo que uma etapa credita: 3× o tempo previsto por etapa (duração do
 * módulo ÷ etapas), entre 10 min e 2 h. Uma aba esquecida aberta não vira horas de estudo.
 */
export function stepTimeCapSeconds(moduleDuration: string | null | undefined, stepCount: number): number {
  const minutes = parseDurationMinutes(moduleDuration);
  if (!minutes || !Number.isInteger(stepCount) || stepCount <= 0) return DEFAULT_STEP_CAP_SECONDS;
  const perStepSeconds = (minutes * 60) / stepCount;
  return Math.round(Math.min(MAX_STEP_CAP_SECONDS, Math.max(MIN_STEP_CAP_SECONDS, perStepSeconds * 3)));
}

export function creditedStepSeconds(measuredSeconds: number, capSeconds: number): number {
  return Math.max(0, Math.min(Math.floor(measuredSeconds), capSeconds));
}

export type CompletedStudySession = { elapsedSeconds: number; completedAt: Date | null };

export function summarizeCompletedStudyTime(sessions: CompletedStudySession[], periodStart?: Date) {
  const elapsedSeconds = sessions.reduce((total, session) => {
    if (!session.completedAt || (periodStart && session.completedAt < periodStart)) return total;
    return total + sanitizeStoredElapsedSeconds(session.elapsedSeconds);
  }, 0);
  return { elapsedSeconds, studiedMinutes: elapsedSeconds > 0 ? Math.ceil(elapsedSeconds / 60) : 0 };
}

/** Mantém somente sessões de módulos que o viewer pode consultar. */
export function filterStudySessionsByVisibleModules<T extends { moduleId: string }>(
  sessions: T[],
  visibleModuleIds: ReadonlySet<string>,
): T[] {
  return sessions.filter((session) => visibleModuleIds.has(session.moduleId));
}

export function isStepCompleted(stepIndex: number, completedStepCount: number): boolean {
  return Number.isInteger(stepIndex) && Number.isInteger(completedStepCount) && stepIndex >= 0 && stepIndex < completedStepCount;
}

export function resolveProgressUpdate(
  totalSteps: number,
  previousStepIndex: number,
  requestedStepIndex: number,
): ProgressUpdate {
  if (!Number.isInteger(totalSteps) || totalSteps <= 0) {
    throw new Error("O módulo precisa ter pelo menos uma etapa.");
  }
  if (!Number.isInteger(requestedStepIndex) || requestedStepIndex < 0 || requestedStepIndex > totalSteps) {
    throw new Error("A etapa informada não pertence a este módulo.");
  }

  const current = Math.max(0, Math.min(totalSteps, Math.trunc(previousStepIndex)));
  if (requestedStepIndex > current + 1) {
    throw new Error("Conclua as etapas em sequência.");
  }

  const stepIndex = Math.max(current, requestedStepIndex);
  return { stepIndex, progress: Math.round((stepIndex / totalSteps) * 100) };
}
