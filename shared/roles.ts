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

/** Quem pode receber empréstimo vinculado à própria conta (a administração só registra). */
export const BORROWER_ROLES = ["student", "teacher"] as const;

export function canBorrowTools(role: unknown): role is (typeof BORROWER_ROLES)[number] {
  return (BORROWER_ROLES as readonly unknown[]).includes(role);
}

export function canAccessInventory(role: unknown) {
  return isStaffRole(role);
}

/** Biblioteca, leitor e editor de módulos: alunos e docentes; a administração não. */
export function canAccessModules(role: unknown) {
  return !isAdminRole(role);
}

/**
 * Rota inicial depois do login. Todos os papéis começam no Início ("/"): a
 * própria tela escolhe o painel de aluno, docente ou administração.
 */
export const HOME_PATH = "/";

/**
 * Valida um caminho de retorno após o login. Só aceita caminhos internos e
 * nunca devolve o aluno para uma rota exclusiva do docente.
 */
export function safeRedirectPath(next: unknown, role: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return HOME_PATH;
  }
  if (next.startsWith("/login")) return HOME_PATH;
  if (isStaffOnlyPath(next) && !isStaffRole(role)) return HOME_PATH;
  if (isAdminOnlyPath(next) && !isAdminRole(role)) return HOME_PATH;
  if (isModulePath(next) && !canAccessModules(role)) return HOME_PATH;
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
