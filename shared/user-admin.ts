/**
 * Gestão de contas pela administração: validação compartilhada entre a API
 * (`admin.users.*`) e o formulário da tela de usuários.
 */
import { z } from "zod";
import { USER_ROLES } from "./roles";

/** Mesmo mínimo de server/_core/password.ts (o hash recusa senhas menores). */
export const ADMIN_MIN_PASSWORD_LENGTH = 8;

const name = z.string().trim().min(2, "Informe o nome completo.").max(120, "Nome muito longo.");
const email = z.string().trim().toLowerCase().min(3, "Informe o e-mail.").max(320).email("Informe um e-mail válido.");
const role = z.enum(USER_ROLES, { message: "Escolha o tipo de acesso." });
const password = z
  .string()
  .min(ADMIN_MIN_PASSWORD_LENGTH, `A senha precisa ter pelo menos ${ADMIN_MIN_PASSWORD_LENGTH} caracteres.`)
  .max(200, "Senha muito longa.");

/** Turma do aluno; ignorada (gravada como null) para docentes e admins. */
const classroomId = z.number().int().positive().nullable().optional();

export const userCreateSchema = z.object({ name, email, role, password, classroomId });
export const userUpdateSchema = z.object({
  id: z.number().int().positive(),
  name,
  email,
  role,
  active: z.boolean(),
  classroomId,
});
export const userPasswordSchema = z.object({ id: z.number().int().positive(), password });

export const classroomInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da turma.").max(80, "Nome muito longo."),
  teacherId: z.number().int().positive().nullable(),
});
export const classroomUpdateSchema = classroomInputSchema.extend({ id: z.number().int().positive() });

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type ClassroomInput = z.infer<typeof classroomInputSchema>;
