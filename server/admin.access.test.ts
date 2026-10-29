/**
 * Gestão de contas: TODO endpoint `admin.*` recusa visitantes, alunos e
 * docentes. O serviço é substituído por dublês para que o teste não dependa de banco.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => {
  class UserAdminError extends Error {
    constructor(public readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST", message: string) {
      super(message);
    }
  }
  return {
    UserAdminError,
    listUsers: vi.fn(async () => []),
    createUser: vi.fn(async (..._args: unknown[]) => ({ id: 10 })),
    updateUser: vi.fn(async (..._args: unknown[]) => ({ success: true })),
    resetUserPassword: vi.fn(async (..._args: unknown[]) => ({ success: true })),
    listClassrooms: vi.fn(async () => []),
    createClassroom: vi.fn(async (..._args: unknown[]) => ({ id: 3 })),
    updateClassroom: vi.fn(async (..._args: unknown[]) => ({ success: true })),
    setClassroomArchived: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  };
});
const oversight = vi.hoisted(() => ({ getInventoryOversight: vi.fn(async (..._args: unknown[]) => ({ ok: true })) }));

vi.mock("./userAdmin", () => service);
vi.mock("./inventoryOversight", () => oversight);

import { appRouter } from "./routers";
import { makeContext, makeUser } from "./test-utils";
import type { TrpcContext } from "./_core/context";

type AnyCaller = Record<string, unknown>;

function adminPaths(): string[] {
  const procedures = (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures;
  return Object.keys(procedures).filter(path => path.startsWith("admin."));
}

function call(user: TrpcContext["user"], path: string, input: unknown) {
  const caller = appRouter.createCaller(makeContext(user).ctx) as unknown as AnyCaller;
  const procedure = path.split(".").reduce<unknown>((node, key) => (node as AnyCaller)[key], caller) as (input: unknown) => Promise<unknown>;
  return procedure(input);
}

const newUser = { name: "Maria Silva", email: "Maria@Escola.br", role: "teacher", password: "senha-forte-1" };

describe("administração · gestão de contas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expõe contas, turmas e supervisão do estoque", () => {
    expect(adminPaths().sort()).toEqual([
      "admin.classrooms.create",
      "admin.classrooms.list",
      "admin.classrooms.setArchived",
      "admin.classrooms.update",
      "admin.inventory.oversight",
      "admin.users.create",
      "admin.users.list",
      "admin.users.resetPassword",
      "admin.users.update",
    ]);
  });

  it("docente não acessa a supervisão do estoque; admin acessa com período padrão de 30 dias", async () => {
    await expect(call(makeUser("teacher"), "admin.inventory.oversight", { days: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(makeUser("admin"), "admin.inventory.oversight", {})).resolves.toEqual({ ok: true });
    expect(oversight.getInventoryOversight).toHaveBeenCalledWith(30);
    await expect(call(makeUser("admin"), "admin.inventory.oversight", { days: 12 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("recusa visitantes (UNAUTHORIZED) e alunos/docentes (FORBIDDEN) antes de tocar no serviço", async () => {
    for (const path of adminPaths()) {
      await expect(call(null, path, {}), path).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(call(makeUser("student"), path, {}), path).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(call(makeUser("teacher"), path, {}), path).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    for (const fn of [...Object.values(service), oversight.getInventoryOversight]) {
      if (typeof fn === "function" && "mock" in fn) expect(fn).not.toHaveBeenCalled();
    }
  });

  it("admin cria login com e-mail normalizado", async () => {
    await expect(call(makeUser("admin"), "admin.users.create", newUser)).resolves.toEqual({ id: 10 });
    expect(service.createUser).toHaveBeenCalledWith({ ...newUser, email: "maria@escola.br" });
  });

  it("valida senha curta e papel inexistente sem chamar o serviço", async () => {
    await expect(call(makeUser("admin"), "admin.users.create", { ...newUser, password: "123" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(call(makeUser("admin"), "admin.users.create", { ...newUser, role: "root" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.createUser).not.toHaveBeenCalled();
  });

  it("o responsável pela edição vem da sessão", async () => {
    await call(makeUser("admin"), "admin.users.update", { id: 7, name: "Aluno", email: "aluno@x.br", role: "student", active: false });
    expect(service.updateUser.mock.calls[0]?.[1]).toBe(1);
  });

  it("converte erros de domínio em respostas legíveis", async () => {
    service.createUser.mockRejectedValueOnce(new service.UserAdminError("CONFLICT", "Já existe uma conta com este e-mail."));
    await expect(call(makeUser("admin"), "admin.users.create", newUser)).rejects.toMatchObject({ code: "CONFLICT", message: "Já existe uma conta com este e-mail." });
  });
});
