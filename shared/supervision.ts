import { isValidStoredElapsedSeconds, sanitizeStoredElapsedSeconds, selectCanonicalProgressRows } from "./progress";

export type StudentModuleProgressInput = {
  id?: number;
  userId: number;
  moduleId: string | null;
  moduleTitle: string | null;
  progress: number | null;
  stepIndex: number | null;
  updatedAt: Date | null;
};

export type StudentStepTimeInput = {
  userId: number;
  moduleId: string | null;
  stepIndex: number | null;
  elapsedSeconds: number | null;
  completedAt: Date | null;
  stepTitle: string | null;
};

export type StudentModuleSummary = {
  moduleId: string;
  title: string;
  progress: number;
  studiedSeconds: number;
  studiedMinutes: number;
  stepTimes: Array<{ stepIndex: number; title: string; elapsedSeconds: number; completedAt: Date }>;
};

/** Build the per-student module view without mixing identities, duplicate rows or missing steps. */
export function getStudentModulesByUser(
  progressRows: StudentModuleProgressInput[],
  stepTimeRows: StudentStepTimeInput[],
): Map<number, StudentModuleSummary[]> {
  const canonicalProgressRows = selectCanonicalProgressRows(
    progressRows.filter((row) => row.moduleTitle !== null),
  );
  const completedCounts = new Map<string, number>();
  for (const row of canonicalProgressRows) {
    if (!row.moduleId || row.stepIndex === null) continue;
    completedCounts.set(`${row.userId}:${row.moduleId}`, row.stepIndex);
  }

  const stepTimesByModule = new Map<string, StudentModuleSummary["stepTimes"]>();
  for (const row of stepTimeRows) {
    if (!row.moduleId || row.stepIndex === null || row.elapsedSeconds === null
      || !row.completedAt || row.stepTitle === null) continue;
    const key = `${row.userId}:${row.moduleId}`;
    const completedStepCount = completedCounts.get(key);
    if (completedStepCount === undefined || row.stepIndex >= completedStepCount || !isValidStoredElapsedSeconds(row.elapsedSeconds)) continue;
    const current = stepTimesByModule.get(key) ?? [];
    current.push({
      stepIndex: row.stepIndex,
      title: row.stepTitle,
      elapsedSeconds: sanitizeStoredElapsedSeconds(row.elapsedSeconds),
      completedAt: row.completedAt,
    });
    stepTimesByModule.set(key, current);
  }

  const modulesByUser = new Map<number, StudentModuleSummary[]>();
  for (const row of canonicalProgressRows) {
    if (!row.moduleId || row.moduleTitle === null || row.stepIndex === null) continue;
    const key = `${row.userId}:${row.moduleId}`;
    const stepTimes = (stepTimesByModule.get(key) ?? []).sort((a, b) => a.stepIndex - b.stepIndex);
    const studiedSeconds = stepTimes.reduce((total, step) => total + step.elapsedSeconds, 0);
    const modules = modulesByUser.get(row.userId) ?? [];
    modules.push({
      moduleId: row.moduleId,
      title: row.moduleTitle,
      progress: row.progress ?? 0,
      studiedSeconds,
      studiedMinutes: studiedSeconds > 0 ? Math.ceil(studiedSeconds / 60) : 0,
      stepTimes,
    });
    modulesByUser.set(row.userId, modules);
  }
  return modulesByUser;
}

export function summarizeStudentStudyTime(modules: StudentModuleSummary[]) {
  const studiedSeconds = modules.reduce((total, module) => total + module.studiedSeconds, 0);
  return { studiedSeconds, studiedMinutes: studiedSeconds > 0 ? Math.ceil(studiedSeconds / 60) : 0 };
}
