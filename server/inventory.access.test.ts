/**
 * Isolamento por papel: TODO endpoint do estoque recusa visitantes e alunos,
 * mesmo quando a requisição é montada manualmente. O serviço é substituído por
 * dublês para que o teste não dependa de banco.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => {
  class InventoryServiceError extends Error {
    constructor(public readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST", message: string) {
      super(message);
    }
  }
  const ok = () => vi.fn(async (..._args: unknown[]) => ({ ok: true }));
  return {
    InventoryServiceError,
    getInventorySummary: ok(),
    listCategories: vi.fn(async (..._args: unknown[]) => []),
    listBorrowers: vi.fn(async (..._args: unknown[]) => []),
    listModuleOptions: vi.fn(async (..._args: unknown[]) => []),
    listClassroomOptions: vi.fn(async (..._args: unknown[]) => []),
    createCategory: ok(),
    updateCategory: ok(),
    setCategoryArchived: ok(),
    listItems: ok(),
    listLinkableItems: vi.fn(async (..._args: unknown[]) => []),
    getItemDetail: ok(),
    createItem: vi.fn(async (..._args: unknown[]) => ({ id: 10 })),
    updateItem: ok(),
    archiveItem: ok(),
    restoreItem: ok(),
    registerMovement: ok(),
    listMovements: ok(),
    createLoan: ok(),
    deliverLoan: ok(),
    cancelLoan: ok(),
    returnLoan: ok(),
    listLoans: ok(),
    listBorrowerLoans: vi.fn(async (..._args: unknown[]) => []),
    countOpenLoansOf: vi.fn(async (..._args: unknown[]) => 0),
  };
});

vi.mock("./inventory", () => service);

import { appRouter } from "./routers";
import { makeContext, makeUser } from "./test-utils";
import type { TrpcContext } from "./_core/context";

type AnyCaller = Record<string, unknown>;

function inventoryPaths(): string[] {
  const procedures = (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures;
  return Object.keys(procedures).filter(path => path.startsWith("inventory."));
}

function call(user: TrpcContext["user"], path: string, input: unknown) {
  const caller = appRouter.createCaller(makeContext(user).ctx) as unknown as AnyCaller;
  const procedure = path.split(".").reduce<unknown>((node, key) => (node as AnyCaller)[key], caller) as (input: unknown) => Promise<unknown>;
  return procedure(input);
}

const validItem = {
  code: "TST-001",
  sapCode: null,
  name: "Item de teste",
  description: null,
  itemType: "tool" as const,
  categoryId: null,
  unit: "UN" as const,
  returnable: true,
  minQuantity: 0,
  sector: "Ferramentaria",
  location: "Armário teste",
  conservation: "bom" as const,
  status: "disponivel" as const,
  initialQuantity: 0,
  initialReason: "inventario" as const,
  requestKey: "teste-chave-0001",
};

describe("estoque · isolamento por papel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expõe o conjunto esperado de endpoints de estoque", () => {
    const paths = inventoryPaths();
    expect(paths.length).toBeGreaterThanOrEqual(20);
    expect(paths).toContain("inventory.items.create");
    expect(paths).toContain("inventory.loans.return");
  });

  it("recusa visitantes sem sessão em todos os endpoints (UNAUTHORIZED)", async () => {
    for (const path of inventoryPaths()) {
      await expect(call(null, path, {}), path).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("recusa alunos em todos os endpoints (FORBIDDEN), antes de tocar no serviço", async () => {
    for (const path of inventoryPaths()) {
      await expect(call(makeUser("student"), path, {}), path).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    for (const fn of Object.values(service)) {
      if (typeof fn === "function" && "mock" in fn) expect(fn).not.toHaveBeenCalled();
    }
  });

  it("aluno não consegue se passar por docente enviando o papel no corpo", async () => {
    await expect(call(makeUser("student"), "inventory.items.create", { ...validItem, role: "teacher", userId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(service.createItem).not.toHaveBeenCalled();
  });

  it("docente acessa o estoque e o responsável vem da sessão, não do corpo", async () => {
    await expect(call(makeUser("teacher"), "inventory.summary", undefined)).resolves.toEqual({ ok: true });
    await expect(call(makeUser("teacher"), "inventory.items.create", { ...validItem, userId: 999 })).resolves.toEqual({ id: 10 });
    expect(service.createItem).toHaveBeenCalledTimes(1);
    expect(service.createItem.mock.calls[0]?.[1]).toBe(2);
    expect(service.createItem.mock.calls[0]?.[0]).not.toHaveProperty("userId");
  });

  it("administração também acessa o estoque", async () => {
    await expect(call(makeUser("admin"), "inventory.summary", undefined)).resolves.toEqual({ ok: true });
  });

  it("docente recebe erro de validação para quantidades inválidas, sem chamar o serviço", async () => {
    await expect(
      call(makeUser("teacher"), "inventory.movements.create", { itemId: 1, type: "saida", quantity: -3, reason: "aula", requestKey: "teste-chave-0002" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(makeUser("teacher"), "inventory.movements.create", { itemId: 1, type: "saida", quantity: 1.5, reason: "aula", requestKey: "teste-chave-0003" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.registerMovement).not.toHaveBeenCalled();
  });

  it("converte regras de domínio em mensagens claras", async () => {
    const { InventoryRuleError } = await import("@shared/inventory");
    service.registerMovement.mockRejectedValueOnce(new InventoryRuleError("INSUFFICIENT_STOCK", "Saldo disponível insuficiente"));
    await expect(
      call(makeUser("teacher"), "inventory.movements.create", { itemId: 1, type: "saida", quantity: 50, reason: "aula", requestKey: "teste-chave-0004" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "Saldo disponível insuficiente" });
  });
});

describe("catálogo educacional · dados do estoque não vazam para alunos", () => {
  const resource = {
    id: "material",
    moduleId: "matriz",
    category: "materials" as const,
    label: "Material bruto",
    title: "Barra de aço SAE 1045",
    detail: "Bloco base",
    status: "Etapa 01",
    progress: 100,
    modelUrl: "",
    color: "#b21e2b",
    inventoryItemId: 5,
  };
  const item = {
    id: 5,
    code: "ACO-1045-50",
    name: "Barra de aço",
    unit: "PC" as const,
    location: "Almoxarifado",
    quantityPhysical: 12,
    quantityReserved: 0,
    minQuantity: 5,
    archivedAt: null,
    status: "disponivel" as const,
  };

  it("para alunos o recurso não traz vínculo, quantidade nem localização do estoque", async () => {
    const { presentCatalogResource } = await import("./db");
    const presented = presentCatalogResource(resource as never, null);
    expect(presented.inventoryItemId).toBeNull();
    expect(presented.inventory).toBeNull();
    expect(presented.title).toBe("Barra de aço SAE 1045");
  });

  it("para docentes inclui a disponibilidade atual do item vinculado", async () => {
    const { presentCatalogResource } = await import("./db");
    const presented = presentCatalogResource(resource as never, new Map([[5, item as never]]));
    expect(presented.inventory).toMatchObject({ code: "ACO-1045-50", available: 12, lowStock: false, health: "ok" });
  });

  it("item arquivado continua exibindo o título original do recurso", async () => {
    const { presentCatalogResource } = await import("./db");
    const presented = presentCatalogResource(resource as never, new Map([[5, { ...item, archivedAt: new Date() } as never]]));
    expect(presented.title).toBe("Barra de aço SAE 1045");
    expect(presented.inventory).toMatchObject({ archived: true, health: "arquivado" });
  });
});
