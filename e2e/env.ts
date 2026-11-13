/** Ambiente isolado dos testes de navegador: contas, banco e pasta de uploads próprios. */
export const E2E_PORT = 3920;
export const E2E_TMP = "e2e/.tmp";

export const ACCOUNTS = {
  student: { email: "aluno.e2e@forgelab.local", password: "aluno-e2e-123", name: "Aluno Teste" },
  teacher: { email: "docente.e2e@forgelab.local", password: "docente-e2e-123", name: "Docente Teste" },
  admin: { email: "admin.e2e@forgelab.local", password: "admin-e2e-123", name: "Administração Teste" },
} as const;

export type Role = keyof typeof ACCOUNTS;

export const E2E_ENV: Record<string, string> = {
  NODE_ENV: "development",
  PORT: String(E2E_PORT),
  APP_URL: `http://localhost:${E2E_PORT}`,
  DATABASE_PROVIDER: "sqlite",
  DATABASE_FILE: `${E2E_TMP}/e2e.db`,
  UPLOAD_DIR: `${E2E_TMP}/uploads`,
  SESSION_SECRET: "segredo-somente-para-os-testes-de-navegador-0123456789",
  APP_TIMEZONE: "America/Sao_Paulo",
  SEED_STUDENT_EMAIL: ACCOUNTS.student.email,
  SEED_STUDENT_NAME: ACCOUNTS.student.name,
  SEED_STUDENT_PASSWORD: ACCOUNTS.student.password,
  SEED_TEACHER_EMAIL: ACCOUNTS.teacher.email,
  SEED_TEACHER_NAME: ACCOUNTS.teacher.name,
  SEED_TEACHER_PASSWORD: ACCOUNTS.teacher.password,
  SEED_ADMIN_EMAIL: ACCOUNTS.admin.email,
  SEED_ADMIN_NAME: ACCOUNTS.admin.name,
  SEED_ADMIN_PASSWORD: ACCOUNTS.admin.password,
  SEED_RESET_PASSWORDS: "true",
};
