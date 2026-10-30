/**
 * Regras da tela inicial sem React: filtros da biblioteca, recursos do leitor,
 * notificações, cronograma e o pacote enviado ao salvar um módulo.
 * Ficam aqui para que possam ser testadas sem montar componentes.
 */
import {
  findClassPeriodForDate,
  nearestClassPeriod,
  scheduleClock,
  scheduleDateKey,
} from "@shared/class-schedule";
import { quizProblem } from "@shared/quiz";
import type { AppNotification } from "@/components/forge/NotificationCenter";
import type { InventorySummary } from "@/lib/router-types";
import {
  type CatalogData,
  type Category,
  cleanActivitySubtitle,
  type DidacticModule,
  MODULE_KIND_SUGGESTIONS,
  type ModuleKind,
  type Resource,
  sameKind,
  type ScheduleActivity,
  type Step,
} from "./shared";

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ */
/* Biblioteca                                                          */
/* ------------------------------------------------------------------ */

export type KindFilter = ModuleKind | "Todos";

/** Busca sem acento: "modulo 03" encontra "MÓDULO 03", "operacao" encontra "Operação". */
export function foldSearchText(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Exemplos sempre aparecem; tipos escritos pelo docente entram depois deles, sem repetir. */
export function libraryKindOptions(modules: DidacticModule[]): KindFilter[] {
  const options: KindFilter[] = ["Todos"];
  for (const kind of [
    ...MODULE_KIND_SUGGESTIONS,
    ...modules.map(item => item.kind.trim()),
  ]) {
    if (kind && !options.some(option => sameKind(option, kind)))
      options.push(kind);
  }
  return options;
}

export function countModulesByKind(
  modules: DidacticModule[],
  options: KindFilter[]
): Record<KindFilter, number> {
  return Object.fromEntries(
    options.map(kind => [
      kind,
      kind === "Todos"
        ? modules.length
        : modules.filter(item => sameKind(item.kind, kind)).length,
    ])
  );
}

export function filterLibraryModules(
  modules: DidacticModule[],
  kindFilter: KindFilter,
  search: string
) {
  const query = foldSearchText(search.trim());
  return modules.filter(
    item =>
      (kindFilter === "Todos" || sameKind(item.kind, kindFilter)) &&
      foldSearchText(
        `${item.title} ${item.description} ${item.code} ${item.kind}`
      ).includes(query)
  );
}

export function libraryResultText(count: number, filtered: boolean) {
  const noun = filtered
    ? count === 1
      ? "módulo encontrado"
      : "módulos encontrados"
    : count === 1
      ? "módulo no catálogo"
      : "módulos no catálogo";
  return `${count} ${noun}`;
}

export function libraryEmptyDescription(
  totalModules: number,
  search: string,
  kindFilter: KindFilter
) {
  const query = search.trim();
  if (totalModules === 0)
    return "Ainda não há conteúdos disponíveis no catálogo.";
  if (query)
    return `Nenhum módulo corresponde a “${query}”${kindFilter !== "Todos" ? ` no tipo ${kindFilter}` : ""}.`;
  return `Nenhum módulo do tipo ${kindFilter} está disponível.`;
}

/* ------------------------------------------------------------------ */
/* Leitor                                                              */
/* ------------------------------------------------------------------ */

export const RESOURCE_CATEGORY_OPTIONS: { id: Category; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "materials", label: "Materiais" },
  { id: "machines", label: "Máquinas" },
  { id: "tools", label: "Ferramentas" },
  { id: "parts", label: "Mini peças" },
];

const RESOURCE_CATEGORY_ORDER: Record<Exclude<Category, "all">, number> = {
  materials: 0,
  machines: 1,
  tools: 2,
  parts: 3,
};

export function filterResources(resources: Resource[], category: Category) {
  return resources
    .filter(item => category === "all" || item.category === category)
    .sort(
      (a, b) =>
        RESOURCE_CATEGORY_ORDER[a.category] -
        RESOURCE_CATEGORY_ORDER[b.category]
    );
}

export function countResourcesByCategory(
  resources: Resource[]
): Record<Category, number> {
  const counts: Record<Category, number> = {
    all: resources.length,
    materials: 0,
    machines: 0,
    tools: 0,
    parts: 0,
  };
  for (const resource of resources) counts[resource.category] += 1;
  return counts;
}

/** Etapa em que o módulo abre: a etapa atual do aluno, dentro dos limites do módulo. */
export function resumeStepIndex(module: DidacticModule) {
  return Math.max(
    0,
    Math.min(module.currentStepIndex ?? 0, Math.max(module.steps.length - 1, 0))
  );
}

/** Maior etapa que pode ficar selecionada: o docente vê todas; o aluno, até a atual. */
export function maxVisitableStepIndex(
  module: DidacticModule,
  isTeacher: boolean
) {
  const lastIndex = Math.max(module.steps.length - 1, 0);
  return isTeacher
    ? lastIndex
    : Math.min(lastIndex, module.currentStepIndex ?? 0);
}

export function completedStepCountOf(module: DidacticModule) {
  return Math.max(
    0,
    Math.min(module.steps.length, module.currentStepIndex ?? 0)
  );
}

/**
 * O paquímetro lê uma casa decimal: usa a fração exata das etapas quando ela
 * corresponde ao progresso salvo (arredondado), senão o valor salvo.
 */
export function moduleProgressReading(module: DidacticModule) {
  const saved = Math.max(0, Math.min(100, module.progress));
  const exact = module.steps.length
    ? (completedStepCountOf(module) / module.steps.length) * 100
    : 0;
  return Math.round(exact) === saved ? exact : saved;
}

/** Sessão de etapa em aberto mais recente: o leitor é retomado nela ao abrir o app. */
export function latestOpenStepSession(catalogModules: CatalogData["modules"]) {
  return (
    catalogModules
      .flatMap(module =>
        (module.stepSessions ?? [])
          .filter(session => session.completedAt === null)
          .map(session => ({
            moduleId: module.id,
            stepIndex: session.stepIndex,
            startedAt: new Date(session.startedAt),
          }))
      )
      .sort(
        (left, right) => right.startedAt.getTime() - left.startedAt.getTime()
      )[0] ?? null
  );
}

/* ------------------------------------------------------------------ */
/* Editor e cronograma                                                 */
/* ------------------------------------------------------------------ */

/** Primeiro problema de quiz entre as etapas, já com o número da etapa; null se todos são válidos. */
export function firstQuizIssue(steps: Step[]) {
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (!step.quiz) continue;
    const problem = quizProblem({
      question: step.quiz.question,
      options: step.quiz.options,
      correctIndex: step.quiz.correctIndex ?? -1,
      explanation: step.quiz.explanation ?? "",
    });
    if (problem) return `Etapa ${index + 1}: ${problem}`;
  }
  return null;
}

/** O que impede a publicação (mesmas regras do `learning.saveModule`); null se pode publicar ou é rascunho. */
export function firstPublishIssue(module: DidacticModule) {
  if (!module.published) return null;
  if (!module.description.trim()) return "Descreva o módulo antes de publicar.";
  if (!module.objective.trim()) return "Informe o objetivo antes de publicar.";
  if (!module.steps.length)
    return "Adicione pelo menos uma etapa antes de publicar. Para guardar sem etapas, desligue “Publicar para alunos”.";
  return null;
}

/** Pacote do `learning.saveModule`: textos aparados, nulos explícitos e sem ícones de React. */
export function toSaveModulePayload(
  module: DidacticModule,
  changedFromStepIndex: number | null
) {
  return {
    ...module,
    kind: module.kind.trim(),
    confirmStepStructureReset: changedFromStepIndex !== null,
    published: Boolean(module.published),
    coverImage: module.coverImage ?? null,
    steps: module.steps.map(step => ({
      id: step.id,
      title: step.title,
      description: step.description,
      tip: step.tip,
      image: step.image ?? null,
      attachments: step.attachments ?? [],
      quiz: step.quiz
        ? {
            question: step.quiz.question.trim(),
            options: step.quiz.options.map(option => option.trim()),
            correctIndex: step.quiz.correctIndex ?? 0,
            explanation: (step.quiz.explanation ?? "").trim(),
          }
        : null,
    })),
    resources: module.resources.map(({ icon: _icon, ...resource }) => ({
      ...resource,
      attachments: resource.attachments ?? [],
    })),
  };
}

/** Atividades do calendário no formato do `learning.saveSchedule` (data + período de aula). */
export function toScheduleEntries(activities: ScheduleActivity[]) {
  return activities.map(activity => {
    const period =
      findClassPeriodForDate(activity.startsAt) ||
      nearestClassPeriod(scheduleClock(activity.startsAt));
    return {
      id: activity.id,
      moduleId: activity.moduleId,
      title: activity.title,
      subtitle: cleanActivitySubtitle(activity.subtitle),
      activityType: activity.activityType,
      color: activity.color,
      date: scheduleDateKey(activity.startsAt),
      periodId: period.id,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Notificações                                                        */
/* ------------------------------------------------------------------ */

const ACTIVITY_LABEL = {
  aula: "Aula",
  laboratorio: "Laboratório",
  avaliacao: "Avaliação",
} as const;

/** Até 3 atividades da próxima semana que ainda não terminaram; avaliação em menos de 24 h é urgente. */
function classNotifications(
  activities: ScheduleActivity[],
  now: number
): AppNotification[] {
  const weekAhead = now + 7 * DAY_MS;
  return activities
    .map(activity => ({
      activity,
      startsAt: new Date(activity.startsAt),
      endsAt: new Date(activity.endsAt),
    }))
    .filter(
      ({ startsAt, endsAt }) =>
        endsAt.getTime() >= now && startsAt.getTime() <= weekAhead
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 3)
    .map(({ activity, startsAt }) => ({
      id: `class-${activity.id}-${startsAt.getTime()}`,
      kind: "class",
      title: `${ACTIVITY_LABEL[activity.activityType] ?? "Aula"}: ${activity.title}`,
      detail: activity.subtitle || "Agendada no calendário da turma.",
      when: startsAt,
      urgent:
        activity.activityType === "avaliacao" &&
        startsAt.getTime() - now < DAY_MS,
      target: { view: "dashboard" },
    }));
}

function staffNotifications(
  modules: DidacticModule[],
  summary: InventorySummary | null | undefined,
  canSeeModules: boolean
): { before: AppNotification[]; after: AppNotification[] } {
  const overdue = summary?.totals.overdueLoans ?? 0;
  const overdueNotice: AppNotification[] =
    overdue > 0
      ? [
          {
            id: `loans-overdue-${overdue}`,
            kind: "loan",
            title: `${overdue} ${overdue === 1 ? "empréstimo atrasado" : "empréstimos atrasados"}`,
            detail: "Ferramentas com a devolução prevista vencida.",
            urgent: true,
            target: { view: "inventory" },
          },
        ]
      : [];
  const stockAlerts: AppNotification[] = (summary?.alerts ?? [])
    .slice(0, 4)
    .map(item => ({
      id: `stock-${item.id}-${item.available}`,
      kind: "stock",
      title:
        item.available <= 0
          ? `${item.name} sem saldo`
          : `${item.name} com estoque baixo`,
      detail: `${item.available} ${item.unit} disponíveis · mínimo ${item.minQuantity} ${item.unit}`,
      urgent: item.available <= 0,
      target: { view: "inventory" },
    }));
  const drafts: AppNotification[] = (canSeeModules ? modules : [])
    .filter(module => !module.published)
    .slice(0, 3)
    .map(module => ({
      id: `draft-${module.id}`,
      kind: "draft",
      title: `${module.code} está em rascunho`,
      detail: `“${module.title}” ainda não aparece para os alunos.`,
      target: { view: "editor", moduleId: module.id },
    }));
  return { before: [...overdueNotice, ...stockAlerts], after: drafts };
}

function studentNotifications(modules: DidacticModule[]): AppNotification[] {
  const visible = modules.filter(module => module.published);
  const inProgress = visible
    .filter(module => module.progress > 0 && module.progress < 100)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 2);
  const fresh = visible.filter(module => module.progress === 0).slice(0, 2);
  const done = visible.filter(module => module.progress >= 100).slice(0, 2);
  return [
    ...inProgress.map(
      (module): AppNotification => ({
        id: `progress-${module.id}-${module.currentStepIndex ?? 0}`,
        kind: "progress",
        title: `Continue: ${module.title}`,
        detail: `${Math.round(module.progress)}% concluído · etapa ${(module.currentStepIndex ?? 0) + 1} de ${Math.max(module.steps.length, 1)}`,
        target: { view: "reader", moduleId: module.id },
      })
    ),
    ...fresh.map(
      (module): AppNotification => ({
        id: `new-${module.id}`,
        kind: "new",
        title: `Novo módulo: ${module.title}`,
        detail: `${module.code} · ${module.duration || module.kind}`,
        target: { view: "reader", moduleId: module.id },
      })
    ),
    ...done.map(
      (module): AppNotification => ({
        id: `done-${module.id}`,
        kind: "done",
        title: `Módulo concluído: ${module.title}`,
        detail: "Parabéns! Revise quando quiser na Biblioteca.",
        target: { view: "library" },
      })
    ),
  ];
}

/**
 * Sino de notificações. Equipe: atrasos e estoque baixo primeiro, depois aulas
 * e rascunhos. Aluno: aulas, depois módulos em andamento, novos e concluídos.
 */
export function buildNotifications(input: {
  now: number;
  isStaff: boolean;
  canSeeModules: boolean;
  modules: DidacticModule[];
  activities: ScheduleActivity[];
  inventorySummary?: InventorySummary | null;
}): AppNotification[] {
  const classes = classNotifications(input.activities, input.now);
  if (!input.isStaff)
    return [...classes, ...studentNotifications(input.modules)];
  const staff = staffNotifications(
    input.modules,
    input.inventorySummary,
    input.canSeeModules
  );
  return [...staff.before, ...classes, ...staff.after];
}
