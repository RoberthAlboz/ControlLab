/**
 * Modelo de papéis do ForgeLab.
 *
 * - student: área educacional do aluno (progresso, cronômetro, anotações).
 * - teacher: área educacional docente (editor, supervisão, agenda) + estoque.
 * - admin:   visão geral (Início), estoque e gestão de contas (cria logins de
 *            alunos, docentes e outros admins; ativa/desativa; redefine senhas).
 *            Não acessa módulos (biblioteca, leitor e editor).
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

/** Somente a administração gerencia contas (cria logins de alunos e docentes). */
export function isAdminRole(role: unknown): role is "admin" {
  return role === "admin";
}

export function canAccessInventory(role: unknown) {
  return isStaffRole(role);
}

/** Biblioteca, leitor e editor de módulos: alunos e docentes; a administração não. */
export function canAccessModules(role: unknown) {
  return !isAdminRole(role);
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
  if (isAdminOnlyPath(next) && !isAdminRole(role)) return homePathForRole(role);
  if (isModulePath(next) && !canAccessModules(role)) return homePathForRole(role);
  return next;
}

const STAFF_ONLY_PREFIXES = ["/estoque", "/editor"];
const ADMIN_ONLY_PREFIXES = ["/admin"];
const MODULE_PREFIXES = ["/biblioteca", "/leitor", "/editor"];

function matchesPrefix(path: string, prefixes: string[]) {
  const clean = path.split(/[?#]/)[0] ?? "";
  return prefixes.some(prefix => clean === prefix || clean.startsWith(`${prefix}/`));
}

export function isStaffOnlyPath(path: string) {
  return matchesPrefix(path, STAFF_ONLY_PREFIXES);
}

export function isAdminOnlyPath(path: string) {
  return matchesPrefix(path, ADMIN_ONLY_PREFIXES);
}

export function isModulePath(path: string) {
  return matchesPrefix(path, MODULE_PREFIXES);
}
