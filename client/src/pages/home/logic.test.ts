import { describe, expect, it } from "vitest";
import { Box } from "lucide-react";
import type { InventorySummary } from "@/lib/router-types";
import {
  buildNotifications,
  completedStepCountOf,
  countModulesByKind,
  countResourcesByCategory,
  filterLibraryModules,
  filterResources,
  firstPublishIssue,
  firstQuizIssue,
  foldSearchText,
  latestOpenStepSession,
  libraryEmptyDescription,
  libraryKindOptions,
  libraryResultText,
  maxVisitableStepIndex,
  moduleProgressReading,
  resumeStepIndex,
  toSaveModulePayload,
} from "./logic";
import {
  type CatalogData,
  type DidacticModule,
  emptyModule,
  type Resource,
  type ScheduleActivity,
  type Step,
  serverMessage,
} from "./shared";

const step = (id: string, extra: Partial<Step> = {}): Step => ({
  id,
  title: `Etapa ${id}`,
  description: "",
  tip: "",
  ...extra,
});

const moduleOf = (extra: Partial<DidacticModule>): DidacticModule => ({
  ...emptyModule,
  id: "m",
  code: "MOD 01",
  title: "Módulo",
  published: true,
  ...extra,
});

const resource = (id: string, category: Resource["category"]): Resource => ({
  id,
  category,
  label: category,
  title: id,
  detail: "",
  status: "",
  progress: 0,
  modelUrl: "",
  icon: Box,
  color: "",
});

const activity = (
  id: string,
  startsAt: Date,
  activityType: ScheduleActivity["activityType"] = "aula"
): ScheduleActivity => ({
  id,
  moduleId: "m",
  title: `Atividade ${id}`,
  subtitle: "",
  activityType,
  startsAt,
  endsAt: new Date(startsAt.getTime() + 50 * 60_000),
  color: "",
});

describe("biblioteca", () => {
  const modules = [
    moduleOf({
      id: "a",
      title: "Operação do torno",
      kind: "Processo",
      code: "MÓDULO 03",
    }),
    moduleOf({ id: "b", title: "Paquímetro", kind: "Ferramenta" }),
    moduleOf({ id: "c", title: "Fresa", kind: " soldagem " }),
  ];

  it("busca ignora acento e caixa", () => {
    expect(foldSearchText("Operação")).toBe("operacao");
    expect(
      filterLibraryModules(modules, "Todos", "operacao").map(m => m.id)
    ).toEqual(["a"]);
    expect(
      filterLibraryModules(modules, "Todos", "modulo 03").map(m => m.id)
    ).toEqual(["a"]);
  });

  it("combina filtro de tipo e busca", () => {
    expect(
      filterLibraryModules(modules, "Ferramenta", "").map(m => m.id)
    ).toEqual(["b"]);
    expect(filterLibraryModules(modules, "Ferramenta", "torno")).toEqual([]);
  });

  it("tipos: exemplos primeiro, tipos do docente depois, sem repetir", () => {
    const options = libraryKindOptions(modules);
    expect(options).toEqual([
      "Todos",
      "Ferramenta",
      "Montagem",
      "Processo",
      "soldagem",
    ]);
    expect(countModulesByKind(modules, options)).toMatchObject({
      Todos: 3,
      Ferramenta: 1,
      Montagem: 0,
    });
  });

  it("textos de resultado e de lista vazia", () => {
    expect(libraryResultText(1, true)).toBe("1 módulo encontrado");
    expect(libraryResultText(2, false)).toBe("2 módulos no catálogo");
    expect(libraryEmptyDescription(0, "x", "Todos")).toBe(
      "Ainda não há conteúdos disponíveis no catálogo."
    );
    expect(libraryEmptyDescription(3, " torno ", "Montagem")).toBe(
      "Nenhum módulo corresponde a “torno” no tipo Montagem."
    );
    expect(libraryEmptyDescription(3, "", "Montagem")).toBe(
      "Nenhum módulo do tipo Montagem está disponível."
    );
  });
});

describe("leitor", () => {
  it("recursos ficam na ordem materiais → máquinas → ferramentas → peças", () => {
    const resources = [
      resource("p", "parts"),
      resource("t", "tools"),
      resource("m", "materials"),
      resource("x", "machines"),
    ];
    expect(filterResources(resources, "all").map(r => r.id)).toEqual([
      "m",
      "x",
      "t",
      "p",
    ]);
    expect(filterResources(resources, "tools").map(r => r.id)).toEqual(["t"]);
    expect(countResourcesByCategory(resources)).toEqual({
      all: 4,
      materials: 1,
      machines: 1,
      tools: 1,
      parts: 1,
    });
  });

  it("a etapa de retomada e a maior etapa visitável ficam dentro do módulo", () => {
    const steps = [step("1"), step("2"), step("3")];
    expect(resumeStepIndex(moduleOf({ steps, currentStepIndex: 1 }))).toBe(1);
    // Módulo concluído (índice = total de etapas) abre na última etapa.
    expect(resumeStepIndex(moduleOf({ steps, currentStepIndex: 3 }))).toBe(2);
    expect(resumeStepIndex(moduleOf({ steps: [], currentStepIndex: 4 }))).toBe(
      0
    );
    expect(
      maxVisitableStepIndex(moduleOf({ steps, currentStepIndex: 1 }), false)
    ).toBe(1);
    expect(
      maxVisitableStepIndex(moduleOf({ steps, currentStepIndex: 1 }), true)
    ).toBe(2);
  });

  it("o paquímetro usa a fração exata só quando ela confere com o progresso salvo", () => {
    const steps = [step("1"), step("2"), step("3")];
    const oneOfThree = moduleOf({ steps, currentStepIndex: 1, progress: 33 });
    expect(completedStepCountOf(oneOfThree)).toBe(1);
    expect(moduleProgressReading(oneOfThree)).toBeCloseTo(33.333, 2);
    expect(
      moduleProgressReading(
        moduleOf({ steps, currentStepIndex: 1, progress: 50 })
      )
    ).toBe(50);
    expect(moduleProgressReading(moduleOf({ steps: [], progress: 140 }))).toBe(
      100
    );
  });

  it("retoma a sessão em aberto mais recente, ignorando as concluídas", () => {
    const session = (
      stepIndex: number,
      startedAt: string,
      completedAt: string | null = null
    ) => ({
      stepIndex,
      startedAt,
      elapsedSeconds: 0,
      completedAt,
    });
    const modules = [
      {
        id: "a",
        stepSessions: [
          session(0, "2026-10-01T10:00:00Z"),
          session(1, "2026-10-03T10:00:00Z", "2026-10-03T11:00:00Z"),
        ],
      },
      { id: "b", stepSessions: [session(2, "2026-10-02T10:00:00Z")] },
    ] as unknown as CatalogData["modules"];
    expect(latestOpenStepSession(modules)).toMatchObject({
      moduleId: "b",
      stepIndex: 2,
    });
    expect(latestOpenStepSession([])).toBeNull();
  });
});

describe("editor", () => {
  const quiz = {
    question: "Qual?",
    options: ["A", "B"],
    correctIndex: 0,
    explanation: "",
  };

  it("aponta o primeiro quiz inválido com o número da etapa", () => {
    expect(firstQuizIssue([step("1", { quiz }), step("2")])).toBeNull();
    expect(
      firstQuizIssue([
        step("1"),
        step("2", { quiz: { ...quiz, options: ["A", "a"] } }),
      ])
    ).toBe("Etapa 2: As alternativas precisam ser diferentes entre si.");
    // Sem gabarito marcado não é aceito (o editor manda -1).
    expect(
      firstQuizIssue([
        step("1", { quiz: { question: "Qual?", options: ["A", "B"] } }),
      ])
    ).toMatch(/^Etapa 1: Marque/);
  });

  it("só bloqueia a publicação, nunca o rascunho, e diz o que falta", () => {
    const ready = moduleOf({ description: "D", objective: "O", steps: [step("1")] });
    expect(firstPublishIssue({ ...ready, published: true })).toBeNull();
    expect(firstPublishIssue({ ...ready, steps: [], published: false })).toBeNull();
    expect(firstPublishIssue({ ...ready, steps: [], published: true })).toMatch(/pelo menos uma etapa/);
    expect(firstPublishIssue({ ...ready, description: " ", published: true })).toBe("Descreva o módulo antes de publicar.");
    expect(firstPublishIssue({ ...ready, objective: "", published: true })).toBe("Informe o objetivo antes de publicar.");
  });

  it("erro de validação do servidor vira o texto do primeiro problema, não JSON", () => {
    const zodError = Object.assign(
      new Error(JSON.stringify([{ code: "custom", path: ["steps"], message: "Um módulo publicado precisa ter pelo menos uma etapa." }])),
      { data: { code: "BAD_REQUEST" } }
    );
    expect(serverMessage(zodError, "falhou")).toBe("Um módulo publicado precisa ter pelo menos uma etapa.");
    const plain = Object.assign(new Error("Sem permissão."), { data: { code: "FORBIDDEN" } });
    expect(serverMessage(plain, "falhou")).toBe("Sem permissão.");
  });

  it("o pacote salvo apara textos, explicita nulos e não leva o ícone do recurso", () => {
    const payload = toSaveModulePayload(
      moduleOf({
        kind: "  Ferramenta ",
        steps: [
          step("1", {
            quiz: { ...quiz, question: " Qual? ", options: [" A ", "B"] },
          }),
        ],
        resources: [resource("r", "tools")],
      }),
      0
    );
    expect(payload.kind).toBe("Ferramenta");
    expect(payload.confirmStepStructureReset).toBe(true);
    expect(payload.coverImage).toBeNull();
    expect(payload.steps[0]).toMatchObject({
      image: null,
      attachments: [],
      quiz: { question: "Qual?", options: ["A", "B"] },
    });
    expect(payload.resources[0]).not.toHaveProperty("icon");
    expect(
      toSaveModulePayload(moduleOf({}), null).confirmStepStructureReset
    ).toBe(false);
  });
});

describe("notificações", () => {
  const now = new Date("2026-10-30T12:00:00Z").getTime();
  const hours = (h: number) => new Date(now + h * 3_600_000);

  it("aluno: aulas da semana, depois andamento, novos e concluídos", () => {
    const items = buildNotifications({
      now,
      isStaff: false,
      canSeeModules: true,
      activities: [
        activity("prova", hours(5), "avaliacao"),
        activity("longe", hours(24 * 9)),
        activity("passou", hours(-3)),
      ],
      modules: [
        moduleOf({
          id: "andamento",
          progress: 40,
          steps: [step("1"), step("2")],
          currentStepIndex: 1,
        }),
        moduleOf({ id: "novo", progress: 0 }),
        moduleOf({ id: "feito", progress: 100 }),
        moduleOf({ id: "rascunho", progress: 0, published: false }),
      ],
    });
    expect(items.map(item => item.kind)).toEqual([
      "class",
      "progress",
      "new",
      "done",
    ]);
    expect(items[0]).toMatchObject({
      title: "Avaliação: Atividade prova",
      urgent: true,
    });
    expect(items[1].detail).toBe("40% concluído · etapa 2 de 2");
  });

  it("equipe: atrasos e estoque primeiro, rascunhos só para quem vê módulos", () => {
    const summary = {
      totals: { overdueLoans: 1 },
      alerts: [
        { id: 9, name: "Broca", available: 0, minQuantity: 2, unit: "un" },
      ],
    } as unknown as InventorySummary;
    const modules = [moduleOf({ id: "r", published: false })];
    const teacher = buildNotifications({
      now,
      isStaff: true,
      canSeeModules: true,
      modules,
      activities: [],
      inventorySummary: summary,
    });
    expect(teacher.map(item => item.kind)).toEqual(["loan", "stock", "draft"]);
    expect(teacher[0].title).toBe("1 empréstimo atrasado");
    expect(teacher[1]).toMatchObject({
      title: "Broca sem saldo",
      urgent: true,
    });
    const admin = buildNotifications({
      now,
      isStaff: true,
      canSeeModules: false,
      modules,
      activities: [],
      inventorySummary: summary,
    });
    expect(admin.map(item => item.kind)).toEqual(["loan", "stock"]);
  });
});
