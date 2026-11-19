import { useEffect, useState, type ReactNode } from "react";
import { type StockHealth } from "@shared/inventory";
import { findClassPeriodForDate, nearestClassPeriod, scheduleClock } from "@shared/class-schedule";
import { getElapsedStudySeconds, sanitizeStoredElapsedSeconds } from "@shared/progress";
import type { ContentAttachment } from "@shared/attachments";
import type { PublicStepQuiz, StepQuiz } from "@shared/quiz";
import DialIndicator from "@/components/forge/DialIndicator";
import {
  ArrowRight,
  BookOpen,
  Box,
  Clock,
  Edit3,
  Grid2X2,
  Layers3,
  Play,
  Search,
  Settings2,
  Trash2,
  Wrench,
  X,
} from "lucide-react";

export type Category = "all" | "materials" | "machines" | "tools" | "parts";
// Tipo do módulo é texto livre do docente; estes são só os exemplos sugeridos.
export type ModuleKind = string;
export const MODULE_KIND_SUGGESTIONS = ["Ferramenta", "Montagem", "Processo"];
export const sameKind = (a: string, b: string) =>
  a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
export type StudentModuleTab = "progress" | "upcoming" | "completed";
export type ScheduleActivity = CatalogData["activities"][number];
export type ResourceInventory = {
  id: number;
  code: string;
  name: string;
  unit: string;
  location: string;
  available: number;
  physical: number;
  reserved: number;
  status: string;
  archived: boolean;
  lowStock: boolean;
  health: StockHealth;
};
export type Resource = {
  id: string;
  category: Exclude<Category, "all">;
  label: string;
  title: string;
  detail: string;
  status: string;
  progress: number;
  modelUrl: string;
  attachments?: ContentAttachment[];
  icon: typeof Box;
  color: string;
  /** Somente docentes recebem o vínculo e a disponibilidade do estoque. */
  inventoryItemId?: number | null;
  inventory?: ResourceInventory | null;
};
export type Step = {
  id: string;
  title: string;
  description: string;
  tip: string;
  image?: string;
  attachments?: ContentAttachment[];
  quiz?: StepQuizData | null;
  /** Aluno: já acertou o quiz nesta sessão da etapa. */
  quizPassed?: boolean;
};
/** Quiz da etapa: completo (com gabarito) para o docente; só pergunta e alternativas para o aluno. */
export type StepQuizData = PublicStepQuiz & Partial<Pick<StepQuiz, "correctIndex" | "explanation">>;
export type ActivityType = "aula" | "laboratorio" | "avaliacao";
export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  aula: "Aula",
  laboratorio: "Laboratório",
  avaliacao: "Avaliação",
};

export function activityPeriod(activity: ScheduleActivity) {
  return (
    findClassPeriodForDate(activity.startsAt) ||
    nearestClassPeriod(scheduleClock(activity.startsAt))
  );
}

export function activityTimeRange(activity: ScheduleActivity) {
  const period = activityPeriod(activity);
  return `${period.start}–${period.end}`;
}

export function cleanActivitySubtitle(subtitle: string) {
  return subtitle
    .replace(/\s*[·|]\s*\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}.*$/, "")
    .trim();
}

export type DidacticModule = {
  id: string;
  code: string;
  title: string;
  kind: ModuleKind;
  description: string;
  objective: string;
  cover: string;
  coverImage?: string;
  progress: number;
  duration: string;
  published: boolean;
  currentStepIndex?: number;
  steps: Step[];
  resources: Resource[];
};

export const emptyModule: DidacticModule = {
  id: "",
  code: "",
  title: "",
  kind: "Processo",
  description: "",
  objective: "",
  cover: "#f1e8e8",
  progress: 0,
  duration: "",
  published: false,
  steps: [],
  resources: [],
};

/**
 * Id aleatório para módulo, etapa, recurso ou atividade. `getRandomValues`
 * (e não `randomUUID`) porque também funciona em http://IP-da-escola, fora de
 * um contexto seguro. Ids de etapa e recurso são únicos no banco inteiro.
 */
export function newContentId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Próximo "MÓDULO NN" a partir do maior número em uso (não da quantidade, que repete após exclusões). */
export function nextModuleCode(modules: DidacticModule[]) {
  const highest = modules.reduce((max, module) => {
    const match = /(\d+)\s*$/.exec(module.code);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `MÓDULO ${String(highest + 1).padStart(2, "0")}`;
}

export function createDraftModule(modules: DidacticModule[]): DidacticModule {
  return {
    id: newContentId("module"),
    code: nextModuleCode(modules),
    title: "Novo módulo",
    kind: "Processo",
    description: "Descreva o que o aluno aprenderá neste conteúdo.",
    objective: "Defina o objetivo pedagógico.",
    cover: "#f1e8e8",
    progress: 0,
    duration: "20 min",
    published: false,
    steps: [],
    resources: [],
  };
}

/** Mensagem do servidor (já escrita para o usuário) ou o texto padrão da tela. */
export function serverMessage(error: unknown, fallback: string) {
  const data = (error as { data?: { code?: string } } | null)?.data;
  const message = error instanceof Error ? error.message : "";
  return data?.code && data.code !== "INTERNAL_SERVER_ERROR" && message
    ? firstValidationMessage(message) ?? message
    : fallback;
}

/** Erro de validação (zod) chega como JSON da lista de problemas: mostra só o primeiro texto. */
function firstValidationMessage(message: string): string | null {
  if (!message.startsWith("[")) return null;
  try {
    const issues = JSON.parse(message) as Array<{ message?: unknown }>;
    const first = Array.isArray(issues) ? issues[0]?.message : null;
    return typeof first === "string" && first ? first : null;
  } catch {
    return null;
  }
}

export function StudentModuleProgress({ module }: { module: DidacticModule }) {
  const percent = Math.max(0, Math.min(100, Math.round(module.progress)));
  if (
    module.steps.length === 0 ||
    typeof module.currentStepIndex !== "number" ||
    !Number.isInteger(module.currentStepIndex)
  ) {
    return (
      <div className="student-card-progress">
        <div
          className="student-card-progress-meter"
          role="progressbar"
          aria-label={`Progresso do módulo ${module.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}% concluído`}
        >
          <span
            className="student-card-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
        <small>{percent}% concluído</small>
      </div>
    );
  }

  const totalSteps = module.steps.length;
  const completedSteps = Math.max(
    0,
    Math.min(totalSteps, module.currentStepIndex)
  );
  const stepPercent = Math.round((completedSteps / totalSteps) * 100);
  return (
    <div className="student-card-progress">
      <div
        className="student-card-progress-meter is-segmented"
        role="progressbar"
        aria-label={`Progresso do módulo ${module.title}`}
        aria-valuemin={0}
        aria-valuemax={totalSteps}
        aria-valuenow={completedSteps}
        aria-valuetext={`${completedSteps} de ${totalSteps} etapas concluídas (${stepPercent}%)`}
        style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
      >
        {module.steps.map((step, index) => {
          const completed = index < completedSteps;
          const current =
            index === completedSteps && completedSteps < totalSteps;
          const status = completed
            ? "concluída"
            : current
              ? "atual"
              : "pendente";
          return (
            <span
              key={step.id}
              aria-hidden="true"
              title={`Etapa ${index + 1}: ${step.title} — ${status}`}
              className={`student-card-progress-segment ${completed ? "is-complete" : current ? "is-current" : ""}`}
            />
          );
        })}
      </div>
      <small>
        {completedSteps} de {totalSteps} etapas · {stepPercent}% concluído
      </small>
    </div>
  );
}

/**
 * Progresso geral ponderado por etapa — o mesmo critério dos cartões ("1 de 3
 * etapas"). A média simples por módulo dava 67% para 5 de 7 etapas e não batia
 * com a contagem exibida logo abaixo.
 */
export function overallStepProgress(modules: DidacticModule[]) {
  let done = 0;
  let total = 0;
  for (const module of modules) {
    const steps = module.steps.length;
    if (!steps) continue;
    total += steps;
    done +=
      typeof module.currentStepIndex === "number" &&
      Number.isInteger(module.currentStepIndex)
        ? Math.max(0, Math.min(steps, module.currentStepIndex))
        : Math.round(
            (Math.max(0, Math.min(100, module.progress)) / 100) * steps
          );
  }
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

/** Duração legível ("23 s", "4 min 05 s", "1 h 12 min") — "00:23" não diz se são minutos ou segundos. */
export function formatStudyDuration(seconds: number) {
  const safeSeconds = sanitizeStoredElapsedSeconds(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  if (hours) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  if (minutes) return `${minutes} min ${String(remainder).padStart(2, "0")} s`;
  return `${remainder} s`;
}

export function StudentModuleEmptyState({
  query,
  tab,
  hasModules,
  onClearSearch,
  onShowTab,
  nextModule,
  upcomingCount,
  onStart,
}: {
  query: string;
  tab: StudentModuleTab;
  hasModules: boolean;
  onClearSearch: () => void;
  onShowTab: (tab: StudentModuleTab) => void;
  nextModule?: DidacticModule;
  upcomingCount: number;
  onStart: (module: DidacticModule) => void;
}) {
  const hasQuery = query.trim().length > 0;
  // Nada em andamento, mas há o que começar: a bancada sugere o próximo módulo
  // e começa com um clique, em vez de só mandar para outra aba.
  if (!hasQuery && tab === "progress" && nextModule) {
    const steps = nextModule.steps.length;
    return (
      <div className="student-empty-bench" aria-live="polite" aria-atomic="true">
        <svg className="student-empty-bench-art" viewBox="0 0 132 64" aria-hidden="true" focusable="false">
          {/* Placa do torno, peça bruta e o perfil que ela vai ganhar (tracejado) */}
          <path className="bench-axis" d="M4 32H128" />
          <rect className="bench-chuck" x={6} y={12} width={18} height={40} rx={2} />
          <path className="bench-jaw" d="M24 20h7v8h-7zM24 36h7v8h-7z" />
          <rect className="bench-stock" x={31} y={22} width={84} height={20} rx={1.5} />
          <path className="bench-profile" d="M31 25H58V28H82V31H104V33H115" />
          <path className="bench-profile" d="M31 39H58V36H82V33H104V31H115" />
          <g className="bench-tool">
            <path className="bench-tool-shank" d="M98 2h10v14h-10z" />
            <path className="bench-tool-insert" d="M99 16h8l-4 5z" />
          </g>
        </svg>
        <div className="student-empty-bench-text">
          <b>Nenhum módulo em andamento</b>
          <small>A peça está presa na placa, esperando o primeiro corte. Sugestão para começar:</small>
          <div className="student-empty-bench-next">
            <span className="eyebrow">{nextModule.code}</span>
            <strong>{nextModule.title}</strong>
            <span>
              {steps} {steps === 1 ? "etapa" : "etapas"}
              {nextModule.duration ? ` · ${nextModule.duration}` : ""}
            </span>
          </div>
        </div>
        <div className="student-empty-bench-actions">
          <button type="button" className="student-empty-start" onClick={() => onStart(nextModule)}>
            <Play size={12} fill="currentColor" aria-hidden="true" /> Começar módulo
          </button>
          {upcomingCount > 1 && (
            <button type="button" className="student-empty-action" onClick={() => onShowTab("upcoming")}>
              Ver os {upcomingCount} próximos
            </button>
          )}
        </div>
      </div>
    );
  }
  const title = hasQuery
    ? "Nenhum módulo encontrado"
    : tab === "upcoming"
      ? "Nenhum próximo módulo"
      : tab === "completed"
        ? "Nenhum módulo concluído"
        : hasModules
          ? "Nenhum módulo em andamento"
          : "Nenhum módulo disponível";
  const description = hasQuery
    ? "Tente outro termo ou limpe a busca para ver os módulos disponíveis."
    : tab === "upcoming"
      ? "Os módulos ainda não iniciados aparecerão aqui."
      : tab === "completed"
        ? "Quando concluir etapas, seu progresso aparecerá nesta lista."
        : hasModules
          ? "Comece um dos próximos módulos para acompanhá-lo aqui."
          : "Os módulos publicados aparecerão aqui quando estiverem disponíveis.";
  return (
    <div className="student-empty-state" aria-live="polite" aria-atomic="true">
      <BookOpen size={19} aria-hidden="true" />
      <b>{title}</b>
      <small>{description}</small>
      {hasQuery ? (
        <button
          className="student-empty-action"
          type="button"
          onClick={onClearSearch}
        >
          Limpar busca
        </button>
      ) : tab !== "progress" ? (
        <button
          className="student-empty-action"
          type="button"
          onClick={() => onShowTab("progress")}
        >
          Ver módulos em andamento
        </button>
      ) : hasModules ? (
        <button
          className="student-empty-action"
          type="button"
          onClick={() => onShowTab("upcoming")}
        >
          Ver próximos módulos
        </button>
      ) : null}
    </div>
  );
}

export const iconByCategory: Record<string, typeof Box> = {
  materials: Box,
  machines: Grid2X2,
  tools: Wrench,
  parts: Layers3,
};
export function normalizeModules(value: unknown): DidacticModule[] {
  if (!Array.isArray(value)) return [];
  return value.map(module => ({
    ...module,
    steps: Array.isArray(module.steps) ? module.steps : [],
    resources: Array.isArray(module.resources)
      ? module.resources.map((resource: Resource) => ({
          ...resource,
          icon: iconByCategory[resource.category] || Box,
        }))
      : [],
  })) as DidacticModule[];
}

export type CatalogData = {
  modules: Array<{
    id: string;
    code: string;
    title: string;
    kind: ModuleKind;
    description: string;
    objective: string;
    cover: string;
    coverImage?: string | null;
    progress: number;
    duration: string;
    published: boolean;
    currentStepIndex: number;
    stepSessions?: Array<{
      stepIndex: number;
      startedAt: string | Date;
      elapsedSeconds: number;
      completedAt: string | Date | null;
    }>;
    steps: Array<{
      id: string;
      title: string;
      description: string;
      tip: string;
      image?: string;
      attachments?: ContentAttachment[];
      quiz?: StepQuizData | null;
      quizPassed?: boolean;
    }>;
    resources: Array<{
      id: string;
      category: Exclude<Category, "all">;
      label: string;
      title: string;
      detail: string;
      status: string;
      progress: number;
      modelUrl: string;
      attachments?: ContentAttachment[];
      color: string;
      inventoryItemId?: number | null;
      inventory?: ResourceInventory | null;
    }>;
  }>;
  instructors: Array<{
    id: number;
    name: string;
    role: string;
    badge: string;
    initials: string;
    avatarUrl: string | null;
  }>;
  activities: Array<{
    id: string;
    moduleId: string;
    title: string;
    subtitle: string;
    activityType: "aula" | "laboratorio" | "avaliacao";
    startsAt: string | Date;
    endsAt: string | Date;
    color: string;
  }>;
  stats: {
    averageProgress: number;
    studiedMinutes: number;
    studiedSeconds: number;
    streakDays: number;
    completedSteps: number;
    level: number;
    levelProgress: number;
    xp: number;
  };
};
export type TeacherStudentSummary = {
  id: number;
  name: string | null;
  averageProgress: number;
  studiedSeconds: number;
  studiedMinutes: number;
  modulesStarted: number;
  modulesCompleted: number;
  lastActivityAt: string | Date | null;
  /** Etapas com quiz respondidas e quantas o aluno acertou de primeira. */
  quiz?: { answered: number; firstTry: number };
  modules: Array<{
    moduleId: string;
    title: string;
    progress: number;
    studiedSeconds: number;
    studiedMinutes: number;
    stepTimes: Array<{
      stepIndex: number;
      title: string;
      elapsedSeconds: number;
      completedAt: string | Date;
    }>;
  }>;
};
export function normalizeRemoteModules(catalog: CatalogData): DidacticModule[] {
  return catalog.modules.map(module => ({
    ...module,
    coverImage: module.coverImage ?? undefined,
    published: Boolean(module.published),
    steps: module.steps.map(step => ({
      ...step,
      image: step.image || undefined,
      attachments: step.attachments ?? [],
    })),
    resources: module.resources.map(resource => ({
      ...resource,
      attachments: resource.attachments ?? [],
      icon: iconByCategory[resource.category] || Box,
    })),
  }));
}

export function moduleStatus(module: DidacticModule, canEdit: boolean) {
  if (canEdit)
    return module.published
      ? { label: "Publicado", tone: "is-published" }
      : { label: "Rascunho", tone: "is-draft" };
  if (module.progress >= 100)
    return { label: "Concluído", tone: "is-complete" };
  if (module.progress > 0)
    return { label: "Em andamento", tone: "is-progress" };
  return { label: "Não iniciado", tone: "is-not-started" };
}

export function ModuleCard({
  module,
  onOpen,
  onEdit,
  onDelete,
  canEdit,
}: {
  module: DidacticModule;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
}) {
  const CoverIcon =
    module.kind === "Ferramenta"
      ? Wrench
      : module.kind === "Montagem"
        ? Layers3
        : Settings2;
  const status = moduleStatus(module, canEdit);
  const progress = Math.max(0, Math.min(100, Math.round(module.progress || 0)));
  return (
    <article className="module-card">
      {/* A capa é um atalho de mouse; no teclado o foco vai só para "Abrir módulo". */}
      <button
        type="button"
        className="module-cover"
        tabIndex={-1}
        style={{
          background: module.cover,
          ...(module.coverImage
            ? {
                backgroundImage: `linear-gradient(120deg, rgba(255,255,255,.84), rgba(255,255,255,.2)), url(${JSON.stringify(module.coverImage)})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {}),
        }}
        onClick={onOpen}
      >
        <div className="module-cover-kicker">
          {module.code} · {module.kind}
        </div>
        <b className="module-cover-icon" aria-hidden="true">
          <CoverIcon size={24} strokeWidth={1.6} />
        </b>
        <span className={`module-status ${status.tone}`}>{status.label}</span>
      </button>
      <div className="module-card-body">
        <div className="module-card-top">
          <div>
            <p className="module-meta">
              <Clock size={13} aria-hidden="true" /> {module.duration}
              <i aria-hidden="true">·</i>
              <Layers3 size={13} aria-hidden="true" /> {module.steps.length}{" "}
              {module.steps.length === 1 ? "etapa" : "etapas"}
            </p>
            <h3>{module.title}</h3>
          </div>
          <div className="module-card-actions">
            {canEdit && (
              <>
                <button
                  className="small-icon-button"
                  onClick={onEdit}
                  aria-label={`Editar ${module.title}`}
                >
                  <Edit3 size={15} />
                </button>
                <button
                  className="small-icon-button danger"
                  onClick={onDelete}
                  aria-label={`Excluir ${module.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        </div>
        <p>{module.description}</p>
        <div className="module-progress">
          <span id={`module-progress-${module.id}`}>Progresso do módulo</span>
          <b>{progress}%</b>
          <i
            role="progressbar"
            aria-labelledby={`module-progress-${module.id}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <em style={{ width: `${progress}%` }} />
          </i>
        </div>
        <button
          type="button"
          className="open-module"
          onClick={onOpen}
          aria-label={`Abrir módulo ${module.title}`}
        >
          Abrir módulo <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function toDataUrl(file: File, onLoad: (value: string) => void) {
  if (!file.type.startsWith("image/")) return;
  const source = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const max = 1600;
    const ratio = Math.min(
      1,
      max / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      onLoad(
        canvas.toDataURL(
          file.type === "image/png" ? "image/png" : "image/jpeg",
          0.82
        )
      );
    }
    URL.revokeObjectURL(source);
  };
  image.src = source;
}

export function Clock3Icon() {
  return <Clock size={17} />;
}

export function formatStepElapsed(seconds: number) {
  const safeSeconds = sanitizeStoredElapsedSeconds(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

/**
 * Mostrador e tempo da etapa. O tique de 1 s mora aqui, e não no Home: só
 * este pedaço re-renderiza enquanto o cronômetro corre.
 */
export function StepTimerReadout({
  session,
  timerKey,
  running,
  completed,
  label,
}: {
  session: { startedAt: Date; elapsedSeconds: number; completedAt: Date | null } | null;
  timerKey: string;
  running: boolean;
  completed: boolean;
  label: ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [running, timerKey, session?.startedAt.getTime()]);
  const seconds = session
    ? session.completedAt
      ? session.elapsedSeconds
      : Math.max(
          session.elapsedSeconds,
          getElapsedStudySeconds(session.startedAt.getTime(), now)
        )
    : 0;
  return (
    <>
      <span className="step-timer-icon" aria-hidden="true">
        <DialIndicator
          key={timerKey}
          seconds={seconds}
          state={running ? "running" : completed ? "complete" : "pending"}
        />
      </span>
      {label}
      <time
        className="step-timer-display"
        role="timer"
        aria-label={`Tempo da etapa: ${formatStepElapsed(seconds)}`}
        aria-live="off"
      >
        {formatStepElapsed(seconds)}
      </time>
    </>
  );
}

export type HomeView =
  | "dashboard"
  | "library"
  | "reader"
  | "editor"
  | "notes"
  | "inventory"
  | "oversight"
  | "classrooms"
  | "users"
  | "not-found";

export const VIEW_PATHS: Record<Exclude<HomeView, "not-found">, string> = {
  dashboard: "/",
  library: "/biblioteca",
  reader: "/leitor",
  editor: "/editor",
  notes: "/anotacoes",
  inventory: "/estoque",
  oversight: "/admin/estoque",
  classrooms: "/admin/turmas",
  users: "/admin/usuarios",
};

export const MODULE_VIEWS: HomeView[] = ["library", "reader", "editor"];

/** Converte a URL atual na tela do aplicativo (permite recarregar e usar o histórico). */
export function viewFromPath(path: string): HomeView {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return "dashboard";
  if (clean === "/estoque" || clean.startsWith("/estoque/")) return "inventory";
  const match = (
    Object.entries(VIEW_PATHS) as Array<
      [Exclude<HomeView, "not-found">, string]
    >
  ).find(([, viewPath]) => viewPath === clean);
  return match ? match[0] : "not-found";
}

export function initialsOf(name: string | null | undefined, fallback: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return `${parts[0][0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

