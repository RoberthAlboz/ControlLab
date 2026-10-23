export type StudentBadge = {
  id: number;
  label: string;
  detail: string;
  awardedAt: Date | string;
};

export type BadgeStudent = {
  id: number;
  name: string | null;
};

export type AssignedStudentBadge = StudentBadge & {
  userId: number;
  studentName: string | null;
};

export type AwardStudentBadgeInput = {
  studentId: number;
  label: string;
  detail: string;
};

/** Normaliza somente o conteúdo escrito pelo docente; badge alguma deriva de módulos ou progresso. */
export function normalizeBadgeContent(label: string, detail: string) {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) throw new Error("Informe o nome da badge.");
  return { label: normalizedLabel, detail: detail.trim() };
}
