/**
 * Modelo de papéis do ForgeLab.
 *
 * - student: área educacional do aluno (progresso, cronômetro, anotações).
 * - teacher: área educacional docente (editor, supervisão, agenda) + estoque.
 * - admin:   tudo o que o docente faz; reservado para manutenção do sistema.
 *
 * O papel nunca é aceito a partir do frontend: o servidor sempre o lê da
 * sessão autenticada (tabela `users`). Estas funções apenas centralizam a regra
 * para que backend e frontend usem a mesma definição.
 */
export const USER_ROLES = ["student", "teacher", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  student: "Aluno",
  teacher: "Docente",
  admin: "Administração",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** Docentes e administradores acessam a área docente e o estoque. */
export function isStaffRole(role: unknown): role is "teacher" | "admin" {
  return role === "teacher" || role === "admin";
}

export function isStudentRole(role: unknown): role is "student" {
  return role === "student";
}

export function canAccessInventory(role: unknown) {
  return isStaffRole(role);
}

/** Rota inicial depois do login, conforme o papel autenticado. */
export function homePathForRole(role: unknown) {
  return isStaffRole(role) ? "/" : "/";
}

/**
 * Valida um caminho de retorno após o login. Só aceita caminhos internos e
 * nunca devolve o aluno para uma rota exclusiva do docente.
 */
export function safeRedirectPath(next: unknown, role: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return homePathForRole(role);
  }
  if (next.startsWith("/login")) return homePathForRole(role);
  if (isStaffOnlyPath(next) && !isStaffRole(role)) return homePathForRole(role);
  return next;
}

const STAFF_ONLY_PREFIXES = ["/estoque", "/editor"];

export function isStaffOnlyPath(path: string) {
  const clean = path.split(/[?#]/)[0] ?? "";
  return STAFF_ONLY_PREFIXES.some(prefix => clean === prefix || clean.startsWith(`${prefix}/`));
}
