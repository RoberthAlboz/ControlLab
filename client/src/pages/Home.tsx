import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocation } from "wouter";
import {
  canAccessModules,
  isAdminRole,
  isStaffRole,
  ROLE_LABELS,
} from "@shared/roles";
import type { PublicUser } from "../../../server/auth";
import GearLoader from "@/components/forge/GearLoader";
import AccessDenied from "@/components/forge/AccessDenied";
import BootScreen from "@/components/forge/BootScreen";
import type { InventorySummary } from "@/lib/router-types";
import { STOCK_HEALTH_LABELS, type StockHealth } from "@shared/inventory";
import {
  CLASS_PERIOD_MS,
  addCalendarDays,
  classSchedule,
  createPeriodDate,
  findClassPeriodForDate,
  getClassPeriod,
  isSchoolDate,
  localDateKey,
  nearestClassPeriod,
  nextSchoolDateKey,
  scheduleClock,
  scheduleDateKey,
} from "@shared/class-schedule";
import {
  getElapsedStudySeconds,
  getFirstChangedStepIndex,
  isStepCompleted,
  sanitizeStoredElapsedSeconds,
} from "@shared/progress";
import type {
  AssignedStudentBadge,
  BadgeStudent,
  AwardStudentBadgeInput,
  StudentBadge,
} from "@shared/competencies";
import TeacherBadgeManager from "@/components/TeacherBadgeManager";
import {
  AttachmentEditor,
  AttachmentList,
} from "@/components/ModuleAttachments";
import type { ContentAttachment } from "@shared/attachments";
import ReaderTimeline from "@/components/forge/ReaderTimeline";
import NumberTicker from "@/components/forge/NumberTicker";
import StudyProgressRing from "@/components/forge/StudyProgressRing";
import CaliperGauge from "@/components/forge/CaliperGauge";
import DialIndicator from "@/components/forge/DialIndicator";
import StampMark from "@/components/forge/StampMark";
import ThemeSunMoon from "@/components/forge/ThemeSunMoon";
import BrandLogo from "@/components/forge/BrandLogo";
import NotesPage from "@/components/notes/NotesPage";
import ReaderKeyboard from "@/components/forge/ReaderKeyboard";
import TeacherProfileModal from "@/components/forge/TeacherProfileModal";
import AuthGearTrain from "@/components/forge/AuthGearTrain";
import AppSidebar from "@/components/forge/AppSidebar";
import NotificationCenter, {
  type AppNotification,
} from "@/components/forge/NotificationCenter";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  Edit3,
  CalendarClock,
  Target,
  Lightbulb,
  ExternalLink,
  FileText,
  Filter,
  Grid2X2,
  ImagePlus,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Trophy,
  TrendingUp,
  UsersRound,
  Warehouse,
  Wrench,
  X,
} from "lucide-react";

const TeacherAnalyticsCharts = lazy(
  () => import("@/components/TeacherAnalyticsCharts")
);
// Telas só de docente/administração: o aluno nunca baixa esse código.
const InventoryPage = lazy(() => import("@/pages/Inventory"));
const AdminUsersPage = lazy(() => import("@/pages/AdminUsers"));
const AdminClassroomsPage = lazy(() => import("@/pages/AdminClassrooms"));
const AdminOversightPage = lazy(() => import("@/pages/AdminOversight"));
const AdminHome = lazy(() => import("@/pages/AdminHome"));

type Category = "all" | "materials" | "machines" | "tools" | "parts";
// Tipo do módulo é texto livre do docente; estes são só os exemplos sugeridos.
type ModuleKind = string;
const MODULE_KIND_SUGGESTIONS = ["Ferramenta", "Montagem", "Processo"];
const sameKind = (a: string, b: string) =>
  a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
type StudentModuleTab = "progress" | "upcoming" | "completed";
type ScheduleActivity = CatalogData["activities"][number];
type ResourceInventory = {
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
type Resource = {
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
type Step = {
  id: string;
  title: string;
  description: string;
  tip: string;
  image?: string;
  attachments?: ContentAttachment[];
};
type ActivityType = "aula" | "laboratorio" | "avaliacao";
const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  aula: "Aula",
  laboratorio: "Laboratório",
  avaliacao: "Avaliação",
};

function activityPeriod(activity: ScheduleActivity) {
  return (
    findClassPeriodForDate(activity.startsAt) ||
    nearestClassPeriod(scheduleClock(activity.startsAt))
  );
}

function activityTimeRange(activity: ScheduleActivity) {
  const period = activityPeriod(activity);
  return `${period.start}–${period.end}`;
}

function cleanActivitySubtitle(subtitle: string) {
  return subtitle
    .replace(/\s*[·|]\s*\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}.*$/, "")
    .trim();
}

type DidacticModule = {
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

const emptyModule: DidacticModule = {
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
function newContentId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Próximo "MÓDULO NN" a partir do maior número em uso (não da quantidade, que repete após exclusões). */
function nextModuleCode(modules: DidacticModule[]) {
  const highest = modules.reduce((max, module) => {
    const match = /(\d+)\s*$/.exec(module.code);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `MÓDULO ${String(highest + 1).padStart(2, "0")}`;
}

function createDraftModule(modules: DidacticModule[]): DidacticModule {
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
function serverMessage(error: unknown, fallback: string) {
  const data = (error as { data?: { code?: string } } | null)?.data;
  const message = error instanceof Error ? error.message : "";
  return data?.code && data.code !== "INTERNAL_SERVER_ERROR" && message
    ? message
    : fallback;
}

function StudentModuleProgress({ module }: { module: DidacticModule }) {
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
function overallStepProgress(modules: DidacticModule[]) {
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
function formatStudyDuration(seconds: number) {
  const safeSeconds = sanitizeStoredElapsedSeconds(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  if (hours) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  if (minutes) return `${minutes} min ${String(remainder).padStart(2, "0")} s`;
  return `${remainder} s`;
}

function StudentModuleEmptyState({
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

const iconByCategory: Record<string, typeof Box> = {
  materials: Box,
  machines: Grid2X2,
  tools: Wrench,
  parts: Layers3,
};
function normalizeModules(value: unknown): DidacticModule[] {
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

type CatalogData = {
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
type TeacherStudentSummary = {
  id: number;
  name: string | null;
  averageProgress: number;
  studiedSeconds: number;
  studiedMinutes: number;
  modulesStarted: number;
  modulesCompleted: number;
  lastActivityAt: string | Date | null;
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
function normalizeRemoteModules(catalog: CatalogData): DidacticModule[] {
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

function moduleStatus(module: DidacticModule, canEdit: boolean) {
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

function ModuleCard({
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

function toDataUrl(file: File, onLoad: (value: string) => void) {
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
function Editor({
  module,
  onChange,
  onClose,
  onSave,
  onDelete,
  canDelete,
  saving,
}: {
  module: DidacticModule;
  onChange: (module: DidacticModule) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  canDelete: boolean;
  saving: boolean;
}) {
  const update = (patch: Partial<DidacticModule>) =>
    onChange({ ...module, ...patch });
  // Itens ativos do estoque para vincular aos recursos (consulta exclusiva de docentes).
  const linkableQuery = trpc.inventory.items.linkable.useQuery(undefined, {
    staleTime: 30_000,
  });
  const updateResource = (index: number, patch: Partial<Resource>) => {
    const resources = [...module.resources];
    resources[index] = { ...resources[index], ...patch };
    update({ resources });
  };
  const updateStep = (index: number, patch: Partial<Step>) => {
    const steps = [...module.steps];
    steps[index] = { ...steps[index], ...patch };
    update({ steps });
  };
  const addStep = () =>
    update({
      steps: [
        ...module.steps,
        {
          id: newContentId("step"),
          title: "Nova etapa",
          description: "Descreva o procedimento desta etapa.",
          tip: "Adicione uma dica do instrutor.",
        },
      ],
    });
  const addResource = () =>
    update({
      resources: [
        ...module.resources,
        {
          id: newContentId("resource"),
          category: "tools",
          label: "Novo recurso",
          title: "Novo recurso técnico",
          detail: "Adicione uma descrição",
          status: "Novo",
          progress: 0,
          modelUrl: "",
          icon: Wrench,
          color: "#991b1b",
          inventoryItemId: null,
        },
      ],
    });
  const coverPresets = [
    "#e4e8f0",
    "#fde6e6",
    "#f3e8d8",
    "#e2efe6",
    "#2b2323",
    "#8e0707",
  ];
  return (
    <div className="me-shell">
      <header className="me-topbar">
        <button
          className="me-back"
          onClick={onClose}
          aria-label="Fechar editor"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="me-topbar-title">
          <span>Área docente · Editor de conteúdo</span>
          <h1>
            {module.title || "Módulo sem nome"}
            <em className={module.published ? "is-live" : ""}>
              {module.published ? "Publicado" : "Rascunho"}
            </em>
          </h1>
        </div>
        <div className="me-topbar-actions">
          {canDelete && (
            <button className="me-btn me-btn-danger" onClick={onDelete}>
              <Trash2 size={15} />
              <span>Excluir</span>
            </button>
          )}
          <button
            className="me-btn me-btn-primary"
            onClick={onSave}
            disabled={saving || !module.kind.trim()}
            title={module.kind.trim() ? undefined : "Informe o tipo do módulo"}
          >
            {saving ? (
              <>
                <LoaderCircle size={15} className="me-spin" /> Salvando…
              </>
            ) : (
              <>
                <Save size={15} /> Salvar alterações
              </>
            )}
          </button>
        </div>
      </header>

      <div className="me-body">
        <main className="me-main">
          <section className="me-card">
            <div className="me-card-head">
              <div>
                <h2>Informações gerais</h2>
                <p>O que o aluno vê no card e na abertura do módulo.</p>
              </div>
            </div>
            <div className="me-fields">
              <label className="me-field me-span-2">
                <span>Nome do módulo</span>
                <input
                  className="me-input"
                  value={module.title}
                  placeholder="Ex.: Ajuste e acabamento"
                  onChange={e => update({ title: e.target.value })}
                />
              </label>
              <div className="me-field me-span-2">
                <label htmlFor="module-kind-input">Tipo</label>
                <input
                  id="module-kind-input"
                  className="me-input"
                  value={module.kind}
                  maxLength={40}
                  placeholder="Ex.: Ferramenta, Montagem, Processo, Segurança…"
                  aria-invalid={!module.kind.trim()}
                  aria-describedby="module-kind-hint"
                  onChange={e => update({ kind: e.target.value })}
                />
                <div
                  className="me-kind-suggestions"
                  role="group"
                  aria-label="Exemplos de tipo"
                >
                  {MODULE_KIND_SUGGESTIONS.map(kind => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={sameKind(module.kind, kind)}
                      className={sameKind(module.kind, kind) ? "is-active" : ""}
                      onClick={() => update({ kind })}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
                <small id="module-kind-hint" className="me-kind-hint">
                  {module.kind.trim()
                    ? "Escreva o tipo que fizer sentido para a turma ou use um exemplo."
                    : "Informe o tipo do módulo para poder salvar."}
                </small>
              </div>
              <label className="me-field">
                <span>Descrição</span>
                <textarea
                  className="me-input"
                  value={module.description}
                  placeholder="Resumo do que será trabalhado."
                  onChange={e => update({ description: e.target.value })}
                />
              </label>
              <label className="me-field">
                <span>
                  <Target size={13} /> Objetivo pedagógico
                </span>
                <textarea
                  className="me-input"
                  value={module.objective}
                  placeholder="Ao final, o aluno será capaz de…"
                  onChange={e => update({ objective: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="me-card">
            <div className="me-card-head">
              <div>
                <h2>
                  Etapas do tutorial <b>{module.steps.length}</b>
                </h2>
                <p>A sequência que o aluno segue durante a aula.</p>
              </div>
              {module.steps.length > 0 && (
                <button className="me-btn me-btn-soft" onClick={addStep}>
                  <Plus size={15} /> Etapa
                </button>
              )}
            </div>
            {module.steps.length === 0 ? (
              <div className="me-empty">
                <div className="me-empty-icon">
                  <Layers3 size={22} />
                </div>
                <strong>Nenhuma etapa ainda</strong>
                <p>
                  Divida o tutorial em passos curtos, com descrição, dica do
                  instrutor e uma imagem de apoio.
                </p>
                <button className="me-btn me-btn-primary" onClick={addStep}>
                  <Plus size={15} /> Adicionar primeira etapa
                </button>
              </div>
            ) : (
              <ol className="me-steps">
                {module.steps.map((step, index) => (
                  <li className="me-step" key={step.id}>
                    <div className="me-step-num">{index + 1}</div>
                    <div className="me-step-body">
                      <div className="me-step-top">
                        <input
                          className="me-input me-step-title"
                          aria-label={`Título da etapa ${index + 1}`}
                          value={step.title}
                          onChange={e =>
                            updateStep(index, { title: e.target.value })
                          }
                        />
                        <button
                          className="me-icon-btn"
                          onClick={() =>
                            update({
                              steps: module.steps.filter(
                                item => item.id !== step.id
                              ),
                            })
                          }
                          aria-label={`Excluir etapa ${index + 1}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <textarea
                        className="me-input"
                        aria-label={`Descrição da etapa ${index + 1}`}
                        value={step.description}
                        onChange={e =>
                          updateStep(index, { description: e.target.value })
                        }
                      />
                      <label className="me-tip">
                        <Lightbulb size={15} />
                        <input
                          aria-label={`Dica da etapa ${index + 1}`}
                          value={step.tip}
                          placeholder="Dica do instrutor"
                          onChange={e =>
                            updateStep(index, { tip: e.target.value })
                          }
                        />
                      </label>
                      <div className="me-step-media">
                        {step.image && (
                          <img
                            src={step.image}
                            alt={`Imagem da etapa ${index + 1}`}
                          />
                        )}
                        <label className="me-btn me-btn-ghost">
                          <ImagePlus size={15} />
                          {step.image ? "Trocar imagem" : "Adicionar imagem"}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file)
                                toDataUrl(file, image =>
                                  updateStep(index, { image })
                                );
                            }}
                          />
                        </label>
                        {step.image && (
                          <button
                            className="me-link"
                            onClick={() =>
                              updateStep(index, { image: undefined })
                            }
                          >
                            Remover
                          </button>
                        )}
                      </div>
                      <AttachmentEditor
                        label="Arquivos da etapa"
                        attachments={step.attachments ?? []}
                        onChange={attachments =>
                          updateStep(index, { attachments })
                        }
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {module.steps.length > 0 && (
              <button className="me-add-row" onClick={addStep}>
                <Plus size={15} /> Adicionar etapa
              </button>
            )}
          </section>

          <section className="me-card">
            <div className="me-card-head">
              <div>
                <h2>
                  Recursos técnicos <b>{module.resources.length}</b>
                </h2>
                <p>Ferramentas, máquinas e materiais usados no capítulo.</p>
              </div>
              {module.resources.length > 0 && (
                <button className="me-btn me-btn-soft" onClick={addResource}>
                  <Plus size={15} /> Recurso
                </button>
              )}
            </div>
            {module.resources.length === 0 ? (
              <div className="me-empty">
                <div className="me-empty-icon">
                  <Wrench size={22} />
                </div>
                <strong>Nenhum recurso técnico</strong>
                <p>
                  Vincule itens do estoque para conferir a disponibilidade ao
                  preparar a aula.
                </p>
                <button className="me-btn me-btn-soft" onClick={addResource}>
                  <Plus size={15} /> Adicionar recurso
                </button>
              </div>
            ) : (
              <div className="me-resources">
                {module.resources.map((resource, index) => (
                  <div className="me-resource" key={resource.id}>
                    <div className="me-resource-head">
                      <span className="me-resource-icon">
                        <resource.icon size={16} />
                      </span>
                      <strong>{resource.title || "Recurso sem nome"}</strong>
                      <button
                        className="me-icon-btn"
                        onClick={() =>
                          update({
                            resources: module.resources.filter(
                              item => item.id !== resource.id
                            ),
                          })
                        }
                        aria-label={`Excluir ${resource.title}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="me-fields">
                      <label className="me-field">
                        <span>Nome do recurso</span>
                        <input
                          className="me-input"
                          value={resource.title}
                          onChange={e =>
                            updateResource(index, { title: e.target.value })
                          }
                        />
                      </label>
                      <label className="me-field">
                        <span>Categoria</span>
                        <select
                          className="me-input"
                          value={resource.category}
                          onChange={e =>
                            updateResource(index, {
                              category: e.target.value as Exclude<
                                Category,
                                "all"
                              >,
                              icon: iconByCategory[e.target.value] || Box,
                            })
                          }
                        >
                          <option value="materials">Material</option>
                          <option value="machines">Máquina</option>
                          <option value="tools">Ferramenta</option>
                          <option value="parts">Mini peça</option>
                        </select>
                      </label>
                      <label className="me-field me-span-2">
                        <span>Descrição</span>
                        <input
                          className="me-input"
                          value={resource.detail}
                          onChange={e =>
                            updateResource(index, { detail: e.target.value })
                          }
                        />
                      </label>
                      <label className="me-field">
                        <span>Item do estoque vinculado</span>
                        <select
                          className="me-input"
                          value={resource.inventoryItemId ?? ""}
                          disabled={linkableQuery.isLoading}
                          onChange={e => {
                            const id = e.target.value
                              ? Number(e.target.value)
                              : null;
                            updateResource(index, {
                              inventoryItemId: id,
                              inventory: null,
                            });
                          }}
                        >
                          <option value="">
                            {linkableQuery.isLoading
                              ? "Carregando itens do estoque…"
                              : "Sem vínculo com o estoque"}
                          </option>
                          {resource.inventory?.archived &&
                            resource.inventoryItemId != null && (
                              <option value={resource.inventoryItemId}>
                                {resource.inventory.code} ·{" "}
                                {resource.inventory.name} (arquivado)
                              </option>
                            )}
                          {(linkableQuery.data ?? []).map(item => (
                            <option key={item.id} value={item.id}>
                              {item.code} · {item.name} — {item.available}{" "}
                              {item.unit} disp.
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="me-field">
                        <span>Link do modelo 3D (.glb ou .gltf)</span>
                        <input
                          className="me-input"
                          value={resource.modelUrl}
                          onChange={e =>
                            updateResource(index, { modelUrl: e.target.value })
                          }
                          placeholder="https://.../modelo.glb"
                        />
                      </label>
                    </div>
                    <AttachmentEditor
                      label="Arquivos do recurso"
                      hint="Fichas técnicas em PDF, manuais, desenhos CAD (STEP, DWG…), modelos 3D (STL, GLB…), vídeos ou uma pasta inteira — até 50 MB por arquivo."
                      attachments={resource.attachments ?? []}
                      onChange={attachments =>
                        updateResource(index, { attachments })
                      }
                    />
                    <small className="me-help">
                      {linkableQuery.isError
                        ? "Não foi possível carregar o estoque agora; o vínculo atual é mantido ao salvar."
                        : resource.inventory
                          ? `Estoque: ${resource.inventory.available} ${resource.inventory.unit} disponíveis · ${STOCK_HEALTH_LABELS[resource.inventory.health]}. O título do recurso continua visível mesmo se o item for arquivado.`
                          : "Vincule a um item para ver a disponibilidade ao preparar a aula. Alunos não veem dados do estoque."}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="me-aside">
          <section className="me-card">
            <div className="me-card-head">
              <div>
                <h2>Capa</h2>
                <p>Prévia do card na biblioteca.</p>
              </div>
            </div>
            <div
              className="me-cover"
              style={{
                backgroundColor: module.cover,
                backgroundImage: module.coverImage
                  ? `url(${module.coverImage})`
                  : undefined,
              }}
            >
              <span>{module.kind}</span>
              <strong>{module.title || "Módulo sem nome"}</strong>
            </div>
            <div className="me-field">
              <span>Cor de fundo</span>
              <div className="me-swatches">
                {coverPresets.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={
                      module.cover.toLowerCase() === color ? "is-active" : ""
                    }
                    style={{ background: color }}
                    onClick={() => update({ cover: color })}
                    aria-label={`Usar cor ${color}`}
                  >
                    {module.cover.toLowerCase() === color && (
                      <Check size={13} />
                    )}
                  </button>
                ))}
                <label className="me-swatch-custom" title="Cor personalizada">
                  <Plus size={14} />
                  <input
                    type="color"
                    value={module.cover}
                    onChange={e => update({ cover: e.target.value })}
                    aria-label="Cor personalizada"
                  />
                </label>
              </div>
            </div>
            <div className="me-cover-actions">
              <label className="me-btn me-btn-ghost">
                <ImagePlus size={15} />
                {module.coverImage ? "Trocar imagem" : "Enviar imagem"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file)
                      toDataUrl(file, coverImage => update({ coverImage }));
                  }}
                />
              </label>
              {module.coverImage && (
                <button
                  className="me-link"
                  onClick={() => update({ coverImage: undefined })}
                >
                  Remover
                </button>
              )}
            </div>
          </section>

          <section className="me-card">
            <label className="me-switch">
              <span>
                <strong>Publicar para alunos</strong>
                <small>
                  {module.published
                    ? "Visível na biblioteca dos alunos."
                    : "Rascunho — só docentes veem este módulo."}
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={module.published}
                onChange={e => update({ published: e.target.checked })}
              />
              <i aria-hidden="true" />
            </label>
          </section>

          <dl className="me-summary">
            <div>
              <dt>Etapas</dt>
              <dd>{module.steps.length}</dd>
            </div>
            <div>
              <dt>Recursos</dt>
              <dd>{module.resources.length}</dd>
            </div>
            <div>
              <dt>Imagens</dt>
              <dd>
                {module.steps.filter(step => step.image).length +
                  (module.coverImage ? 1 : 0)}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function StudentDashboard({
  modules,
  badges,
  onOpen,
  onNotify,
  onOpenNotes,
  onOpenLibrary,
  activities,
  catalog,
  studentName,
  avatarUrl,
  onAvatarChange,
  period,
  onPeriodChange,
}: {
  modules: DidacticModule[];
  badges: StudentBadge[];
  onOpen: (module: DidacticModule) => void;
  onNotify: (message: string) => void;
  onOpenNotes: () => void;
  onOpenLibrary: () => void;
  activities: ScheduleActivity[];
  catalog?: CatalogData;
  studentName?: string | null;
  avatarUrl?: string | null;
  onAvatarChange: (dataUrl: string, mimeType: string) => void;
  period: "all" | "today" | "week" | "month";
  onPeriodChange: (period: "all" | "today" | "week" | "month") => void;
}) {
  const overall = overallStepProgress(modules);
  const average = overall.percent;
  const studiedSeconds = catalog?.stats.studiedSeconds ?? 0;
  // Abaixo de 1 h o card mostra minutos: "0h" para quem já estudou parecia erro.
  const studiedInHours = studiedSeconds >= 3600;
  const studiedValue = studiedInHours
    ? Math.floor(studiedSeconds / 3600)
    : Math.floor(studiedSeconds / 60);
  const streakDays = catalog?.stats.streakDays ?? 0;
  const level = catalog?.stats.level ?? 1;
  const levelProgress = catalog?.stats.levelProgress ?? 0;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const calendarRef = useRef<HTMLElement>(null);
  // Mesmo contrato do perfil do docente: foco entra no diálogo, Esc fecha e o foco volta ao botão.
  useEffect(() => {
    if (!calendarOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    calendarRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [calendarOpen]);
  const [selectedTeacher, setSelectedTeacher] = useState<{
    initials: string;
    name: string;
    role: string;
    level: string;
    avatarUrl?: string | null;
  } | null>(null);
  const [teachersExpanded, setTeachersExpanded] = useState(false);
  const closeTeacher = useCallback(() => setSelectedTeacher(null), []);
  const [tab, setTab] = useState<StudentModuleTab>("progress");
  const [query, setQuery] = useState("");
  const inProgress = modules.filter(
    module => module.progress > 0 && module.progress < 100
  );
  const upcoming = modules.filter(module => module.progress === 0);
  const completed = modules.filter(module => module.progress >= 100);
  const moduleActivities = activities.filter(activity =>
    modules.some(module => module.id === activity.moduleId)
  );
  const visibleActivities = moduleActivities
    .filter(activity => new Date(activity.endsAt).getTime() >= Date.now())
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  const tabModules =
    tab === "progress" ? inProgress : tab === "upcoming" ? upcoming : completed;
  const visibleStudentModules = tabModules.filter(module =>
    `${module.title} ${module.kind} ${module.description}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const catalogTeacher = catalog?.instructors?.[0];
  const teachers = [
    {
      initials: catalogTeacher?.initials?.trim() || "DO",
      name: catalogTeacher?.name?.trim() || "Docente",
      role: catalogTeacher?.role?.trim() || "Docente responsável pela turma",
      level: catalogTeacher?.badge?.trim() || "Docente",
      avatarUrl: catalogTeacher?.avatarUrl ?? null,
    },
  ];
  const publishedModuleCount =
    catalog?.modules.filter(module => module.published).length ??
    modules.filter(module => module.published).length;
  const calendarDateKey = (date: Date) => localDateKey(date);
  const todayKey = calendarDateKey(new Date());
  const monthStart = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1,
    12
  );
  const monthOffset = (monthStart.getDay() + 6) % 7;
  const monthCells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(monthStart);
    date.setDate(1 - monthOffset + index);
    return date;
  });
  const monthLabel = monthStart.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const shiftCalendarMonth = (delta: number) =>
    setCalendarMonth(
      current =>
        new Date(current.getFullYear(), current.getMonth() + delta, 1, 12)
    );
  return (
    <main className="student-dashboard">
      <aside className="student-profile-panel sp-panel">
        <AuthGearTrain
          className="sp-gears"
          activity={levelProgress + completed.length}
          busy={false}
          jolt={0}
        />
        <div className="sp-identity">
          <div
            className="sp-avatar-ring"
            style={{ "--level-progress": levelProgress } as React.CSSProperties}
            title={`Nível ${level} · ${levelProgress}% para o próximo`}
          >
            <div className="sp-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Foto de perfil" />
              ) : (
                initialsOf(studentName, "AL")
              )}
            </div>
            <label
              className="sp-avatar-upload"
              title="Adicionar ou trocar foto de perfil"
            >
              <ImagePlus size={14} aria-hidden="true" />
              <input
                aria-label="Adicionar ou trocar foto de perfil"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={event => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  input.value = "";
                  if (!file) return;
                  if (
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      file.type
                    )
                  ) {
                    onNotify("Use uma imagem JPEG, PNG ou WebP.");
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    onNotify("A foto deve ter no máximo 5 MB.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string")
                      onAvatarChange(reader.result, file.type);
                  };
                  reader.onerror = () =>
                    onNotify("Não foi possível ler a imagem selecionada.");
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            <b className="sp-level-chip">
              <Trophy size={12} aria-hidden="true" /> Nível {level}
            </b>
          </div>
          <h2 className="sp-hello">
            Olá, <strong>{studentName?.split(" ")[0] || "estudante"}</strong>
          </h2>
          <p className="sp-role">Aluno de ferramentaria</p>
        </div>

        <div className="sp-level">
          <div className="sp-level-head">
            <b>Rumo ao nível {level + 1}</b>
            <strong>{levelProgress}%</strong>
          </div>
          <div
            className="sp-level-bar"
            role="progressbar"
            aria-label={`Progresso para o nível ${level + 1}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={levelProgress}
          >
            <i style={{ width: `${levelProgress}%` }} />
          </div>
        </div>

        <section
          className={`sp-badges ${badges.length === 0 ? "is-empty" : ""}`}
          aria-labelledby="student-competency-title"
        >
          <div className="sp-badges-head">
            <b id="student-competency-title">
              <Trophy size={13} aria-hidden="true" /> Pontos fortes
            </b>
            <strong
              aria-label={
                badges.length === 1
                  ? "1 ponto forte registrado"
                  : `${badges.length} pontos fortes registrados`
              }
            >
              {badges.length}
            </strong>
          </div>
          {badges.length ? (
            <ul aria-label="Pontos fortes registrados pelo docente">
              {badges.map(badge => (
                <li
                  key={badge.id}
                  aria-label={`Ponto forte: bom em ${badge.label}, reconhecido pelo docente`}
                  title={`Reconhecido pelo docente${badge.detail ? `: ${badge.detail}` : ""}`}
                >
                  <div className="sp-badge-icon" aria-hidden="true">
                    <Trophy size={14} />
                  </div>
                  <div>
                    <b>Bom em {badge.label}</b>
                    <p>{badge.detail || "Atribuída pelo docente"}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sp-badges-empty">
              Seu docente ainda não registrou um ponto forte. Continue avançando
              nos módulos!
            </p>
          )}
        </section>
      </aside>
      <section className="student-main-column">
        <div className="student-topbar">
          <div>
            <span className="eyebrow">PAINEL DO ALUNO</span>
            <h1>Retome sua formação.</h1>
            <p>Acesse seus módulos, próximas aulas e anotações da turma.</p>
          </div>
          <div className="student-top-actions">
            <label className="student-search">
              <Search size={15} />
              <input
                type="search"
                aria-label="Buscar módulos"
                value={query}
                placeholder="Buscar módulos"
                onChange={event => setQuery(event.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="student-tabs">
          <div
            className="student-tab-filters"
            role="group"
            aria-label="Filtrar módulos por andamento"
          >
            <button
              type="button"
              className={tab === "progress" ? "active" : ""}
              aria-label={`Em andamento, ${inProgress.length} ${inProgress.length === 1 ? "módulo" : "módulos"}`}
              aria-pressed={tab === "progress"}
              onClick={() => setTab("progress")}
            >
              Em andamento{" "}
              <span className="student-tab-count" aria-hidden="true">
                {inProgress.length}
              </span>
            </button>
            <button
              type="button"
              className={tab === "upcoming" ? "active" : ""}
              aria-label={`Próximos, ${upcoming.length} ${upcoming.length === 1 ? "módulo" : "módulos"}`}
              aria-pressed={tab === "upcoming"}
              onClick={() => setTab("upcoming")}
            >
              Próximos{" "}
              <span className="student-tab-count" aria-hidden="true">
                {upcoming.length}
              </span>
            </button>
            <button
              type="button"
              className={tab === "completed" ? "active" : ""}
              aria-label={`Concluídos, ${completed.length} ${completed.length === 1 ? "módulo" : "módulos"}`}
              aria-pressed={tab === "completed"}
              onClick={() => setTab("completed")}
            >
              Concluídos{" "}
              <span className="student-tab-count" aria-hidden="true">
                {completed.length}
              </span>
            </button>
          </div>
          <button type="button" className="view-all" onClick={onOpenLibrary}>
            Ver todos <ArrowRight size={13} />
          </button>
        </div>
        <div className="student-module-cards">
          {visibleStudentModules.slice(0, 3).map((module, index) => (
            <button
              className={`student-module-card card-tone-${index + 1}`}
              key={module.id}
              onClick={() => onOpen(module)}
            >
              <div className="student-card-icon">
                {module.kind === "Ferramenta" ? (
                  <Wrench size={19} />
                ) : module.kind === "Montagem" ? (
                  <Layers3 size={19} />
                ) : (
                  <Settings2 size={19} />
                )}
              </div>
              <MoreHorizontal
                size={16}
                className="student-card-menu"
                aria-hidden="true"
              />
              <span className="student-card-kind">{module.kind}</span>
              <strong>{module.title}</strong>
              <StudentModuleProgress module={module} />
              <span className="student-card-action">
                <Play size={11} fill="currentColor" aria-hidden="true" />{" "}
                {module.progress ? "Continuar módulo" : "Começar módulo"}
              </span>
            </button>
          ))}
          {visibleStudentModules.length === 0 && (
            <StudentModuleEmptyState
              query={query}
              tab={tab}
              hasModules={modules.length > 0}
              onClearSearch={() => setQuery("")}
              onShowTab={setTab}
              nextModule={upcoming[0]}
              upcomingCount={upcoming.length}
              onStart={onOpen}
            />
          )}
        </div>
        <div className="student-section-heading">
          <div>
            <span className="eyebrow">VISÃO GERAL</span>
            <h2>Suas estatísticas</h2>
          </div>
          <label className="period-select">
            <span>Por período</span>
            <select
              value={period}
              onChange={event =>
                onPeriodChange(event.target.value as typeof period)
              }
            >
              <option value="all">Todo o período</option>
              <option value="today">Hoje</option>
              <option value="week">Últimos 7 dias</option>
              <option value="month">Este mês</option>
            </select>
            <ChevronDown size={13} />
          </label>
        </div>
        <div className="student-stat-grid">
          <div className="student-stat-card">
            <StudyProgressRing
              value={average}
              ready={Boolean(catalog?.stats)}
              label="Progresso total"
            />
            <span aria-hidden="true">Progresso total</span>
            <strong aria-hidden="true">{average}%</strong>
            <small>
              {overall.done} de {overall.total}{" "}
              {overall.total === 1 ? "etapa concluída" : "etapas concluídas"}
              {period !== "all" &&
                ` · ${catalog?.stats.completedSteps ?? 0} no período`}
            </small>
          </div>
          <div className="student-stat-card">
            <div className="stat-icon dark">
              <Clock3Icon />
            </div>
            <span>Tempo estudado</span>
            <strong>
              <NumberTicker
                value={studiedValue}
                unit={studiedInHours ? "h" : "min"}
                ready={Boolean(catalog?.stats)}
              />
            </strong>
            <small>{formatStudyDuration(studiedSeconds)} cronometrados</small>
          </div>
          <div className="student-stat-card stat-highlight">
            <div className="stat-ring">
              <strong>{streakDays}</strong>
              <span>{streakDays === 1 ? "dia" : "dias"}</span>
            </div>
            <div>
              <span>Sequência atual</span>
              <strong>
                {streakDays > 0 ? "Continue assim!" : "Comece hoje"}
              </strong>
              <small>Atualizada ao concluir etapas</small>
            </div>
          </div>
        </div>
        <div className="student-schedule">
          <div className="student-section-heading">
            <div>
              <span className="eyebrow">PRÓXIMAS ATIVIDADES</span>
              <h2>Seu cronograma</h2>
            </div>
            <button onClick={() => setCalendarOpen(true)}>
              Abrir calendário <ArrowRight size={13} />
            </button>
          </div>
          {visibleActivities.length ? (
            visibleActivities.map((activity, index) => {
              const dateKey = scheduleDateKey(activity.startsAt);
              const date = new Date(`${dateKey}T12:00:00`);
              const period = activityPeriod(activity);
              return (
                <div className="schedule-row" key={activity.id}>
                  <span className="schedule-day">
                    {date
                      .toLocaleDateString("pt-BR", { weekday: "short" })
                      .replace(".", "")
                      .toUpperCase()}
                    <strong>{String(date.getDate()).padStart(2, "0")}</strong>
                  </span>
                  <div className="schedule-line">
                    <button
                      className={`schedule-block ${index % 2 ? "yellow-block" : "red-block"}`}
                      onClick={() => {
                        // A lista só traz atividades de módulos visíveis; nunca cai em outro módulo.
                        const module = modules.find(
                          item => item.id === activity.moduleId
                        );
                        if (module) onOpen(module);
                      }}
                    >
                      <BookOpen size={13} />
                      <b>{activity.title}</b>
                      <small>
                        {cleanActivitySubtitle(activity.subtitle)} ·{" "}
                        {period.label} · {period.start}–{period.end}
                      </small>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="schedule-empty">Nenhuma atividade agendada.</div>
          )}
        </div>
      </section>
      <aside className="student-right-column rc-column">
        <section
          className="rc-card rc-teachers"
          aria-labelledby="student-teachers-title"
        >
          <div className="rc-head">
            <h2 id="student-teachers-title">
              {teachers.length === 1
                ? "Seu docente"
                : `Seus docentes (${teachers.length})`}
            </h2>
          </div>
          {teachers.length === 0 ? (
            <p className="rc-empty" role="status">
              Nenhum docente cadastrado no catálogo.
            </p>
          ) : (
            <ul id="student-teacher-list" className="rc-teacher-list">
              {(teachersExpanded ? teachers : teachers.slice(0, 2)).map(
                teacher => (
                  <li key={teacher.name}>
                    <button
                      type="button"
                      className="rc-teacher"
                      onClick={() => setSelectedTeacher(teacher)}
                      aria-label={`Ver perfil de ${teacher.name}`}
                    >
                      <b className="rc-teacher-avatar" aria-hidden="true">
                        {teacher.avatarUrl ? (
                          <img src={teacher.avatarUrl} alt="" />
                        ) : (
                          teacher.initials
                        )}
                      </b>
                      <div className="rc-teacher-copy">
                        <strong>{teacher.name}</strong>
                        <p>{teacher.role}</p>
                      </div>
                      <ChevronRight
                        size={16}
                        className="rc-chevron"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                )
              )}
            </ul>
          )}
          {teachers.length > 2 && (
            <button
              type="button"
              className="rc-more"
              aria-expanded={teachersExpanded}
              aria-controls="student-teacher-list"
              onClick={() => setTeachersExpanded(expanded => !expanded)}
            >
              {teachersExpanded
                ? "Mostrar menos"
                : `Ver todos os ${teachers.length} docentes`}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          )}
        </section>

        <button
          type="button"
          className="rc-card rc-notes"
          onClick={onOpenNotes}
        >
          <b className="rc-notes-icon" aria-hidden="true">
            <FileText size={20} />
          </b>
          <div className="rc-notes-copy">
            <strong>Anotações</strong>
            <p>Registre dúvidas, medidas e observações das aulas.</p>
          </div>
          <b className="rc-notes-go" aria-hidden="true">
            <ArrowRight size={16} />
          </b>
        </button>
      </aside>
      {calendarOpen && (
        <div
          className="calendar-modal-backdrop"
          role="presentation"
          onClick={() => setCalendarOpen(false)}
        >
          <section
            ref={calendarRef}
            className="calendar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-title"
            tabIndex={-1}
            onClick={event => event.stopPropagation()}
          >
            <div className="calendar-modal-head">
              <div>
                <span className="eyebrow">AGENDA DO ALUNO</span>
                <h2 id="calendar-title">Calendário mensal</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setCalendarOpen(false)}
                aria-label="Fechar calendário"
              >
                <X size={17} />
              </button>
            </div>
            <div className="calendar-month-toolbar">
              <button
                className="icon-button"
                onClick={() => shiftCalendarMonth(-1)}
                aria-label="Mês anterior"
              >
                <ArrowLeft size={15} />
              </button>
              <strong>{monthLabel}</strong>
              <button
                className="icon-button"
                onClick={() => shiftCalendarMonth(1)}
                aria-label="Próximo mês"
              >
                <ArrowRight size={15} />
              </button>
            </div>
            <div className="calendar-month-weekdays">
              {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(day => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-month-grid">
              {monthCells.map(date => {
                const inMonth = date.getMonth() === monthStart.getMonth();
                const isToday = calendarDateKey(date) === todayKey;
                const dayActivities = moduleActivities.filter(
                  activity =>
                    scheduleDateKey(activity.startsAt) === calendarDateKey(date)
                );
                return (
                  <div
                    className={`calendar-month-day ${inMonth ? "" : "outside"}${isToday ? " is-today" : ""}`}
                    key={calendarDateKey(date)}
                    aria-current={isToday ? "date" : undefined}
                  >
                    <div className="calendar-month-day-number">
                      {date.getDate()}
                    </div>
                    {dayActivities.map(activity => (
                      <button
                        className="calendar-month-event"
                        key={activity.id}
                        onClick={() => {
                          const module = modules.find(
                            item => item.id === activity.moduleId
                          );
                          if (module) onOpen(module);
                          setCalendarOpen(false);
                        }}
                      >
                        <small>{activityTimeRange(activity)}</small>
                        <b>{activity.title}</b>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
      <TeacherProfileModal
        teacher={selectedTeacher}
        publishedModules={publishedModuleCount}
        progress={average}
        studiedTime={formatStudyDuration(studiedSeconds)}
        nextClass={
          visibleActivities[0]
            ? {
                title: visibleActivities[0].title,
                when: `${new Date(
                  visibleActivities[0].startsAt
                ).toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "short",
                })} · ${activityTimeRange(visibleActivities[0])}`,
              }
            : null
        }
        onClose={closeTeacher}
        onOpenLibrary={onOpenLibrary}
        onOpenNotes={onOpenNotes}
      />
    </main>
  );
}
function ScheduleManager({
  activities,
  onChange,
  onNotify,
  saving,
  modules,
  readOnly = false,
}: {
  activities: ScheduleActivity[];
  onChange: (activities: ScheduleActivity[]) => void;
  onNotify: (message: string) => void;
  saving: boolean;
  modules: DidacticModule[];
  /** Administração: vê o calendário, mas não agenda nem remove. */
  readOnly?: boolean;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const occupiedPeriods = (date: string, exceptId: string | null = null) =>
    new Set(
      activities
        .filter(
          activity =>
            activity.id !== exceptId &&
            scheduleDateKey(activity.startsAt) === date
        )
        .map(activity => activityPeriod(activity).id)
    );
  const firstFreePeriod = (date: string) => {
    const taken = occupiedPeriods(date);
    return classSchedule.find(item => !taken.has(item.id))?.id ?? 1;
  };
  const freshDraft = (date = nextSchoolDateKey(new Date())) => ({
    title: "",
    subtitle: "",
    date,
    periodId: firstFreePeriod(date),
    moduleId: modules[0]?.id ?? "",
    activityType: "aula" as ActivityType,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => freshDraft());
  const period = getClassPeriod(draft.periodId) || classSchedule[0];
  const takenInDraftDate = occupiedPeriods(draft.date, editingId);
  const focusForm = () =>
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      titleRef.current?.focus({ preventScroll: true });
    });
  const longDateLabel = (dateKey: string) =>
    new Date(`${dateKey}T12:00:00`)
      .toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      })
      .replace(".", "");
  const week: string[] = [];
  let cursor = nextSchoolDateKey(new Date());
  while (week.length < 5) {
    if (isSchoolDate(cursor)) week.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  const dateLabel = (dateKey: string) =>
    new Date(`${dateKey}T12:00:00`)
      .toLocaleDateString("pt-BR", { weekday: "short" })
      .replace(".", "");
  const startNew = (date?: string) => {
    setEditingId(null);
    setDraft(freshDraft(date));
  };
  const scheduleOn = (date?: string) => {
    startNew(date);
    focusForm();
  };
  const save = () => {
    if (!draft.title.trim()) {
      onNotify("Informe o título da atividade.");
      return;
    }
    if (!draft.moduleId) {
      onNotify("Selecione o módulo da atividade.");
      return;
    }
    if (!isSchoolDate(draft.date)) {
      onNotify("As aulas acontecem de segunda a sexta-feira.");
      return;
    }
    const occupied = activities.some(
      activity =>
        activity.id !== editingId &&
        scheduleDateKey(activity.startsAt) === draft.date &&
        activityPeriod(activity).id === draft.periodId
    );
    if (occupied) {
      onNotify(
        "Este horário já está ocupado. Escolha outra aula ou edite a atividade existente."
      );
      return;
    }
    const startsAt = createPeriodDate(draft.date, draft.periodId);
    const item: ScheduleActivity = {
      id: editingId || newContentId("activity"),
      moduleId: draft.moduleId,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      activityType: draft.activityType,
      startsAt,
      endsAt: new Date(startsAt.getTime() + CLASS_PERIOD_MS),
      color: "#b21e2b",
    };
    onChange(
      editingId
        ? activities.map(activity =>
            activity.id === editingId ? item : activity
          )
        : [...activities, item]
    );
    setEditingId(null);
    setDraft(freshDraft(draft.date));
    onNotify("Salvando atividade no cronograma da turma...");
  };
  const edit = (activity: ScheduleActivity) => {
    setEditingId(activity.id);
    setDraft({
      title: activity.title,
      subtitle: cleanActivitySubtitle(activity.subtitle),
      date: scheduleDateKey(activity.startsAt),
      periodId: activityPeriod(activity).id,
      moduleId: activity.moduleId,
      activityType: activity.activityType,
    });
    focusForm();
  };
  const remove = (activity: ScheduleActivity) => {
    if (!window.confirm(`Remover “${activity.title}” do calendário?`)) return;
    onChange(activities.filter(item => item.id !== activity.id));
    if (editingId === activity.id) startNew();
  };
  return (
    <section className="schedule-manager">
      <div className="teacher-section-head">
        <div>
          <span className="eyebrow">AGENDA DA TURMA</span>
          <h2>Calendário escolar</h2>
          <p>
            Segunda a sexta · 12 aulas de 45 min por dia.
            {readOnly
              ? " Somente visualização: quem agenda são os docentes."
              : " Clique em um dia para agendar."}
          </p>
        </div>
        {!readOnly && (
          <button
            className="new-module-button"
            onClick={() => scheduleOn()}
            disabled={saving}
          >
            <Plus size={14} /> Nova atividade
          </button>
        )}
      </div>
      <div className="week-calendar">
        {week.map(date => {
          const day = new Date(`${date}T12:00:00`);
          const dayActivities = activities
            .filter(activity => scheduleDateKey(activity.startsAt) === date)
            .sort((a, b) => activityPeriod(a).id - activityPeriod(b).id);
          const isToday = date === localDateKey(new Date());
          return (
            <div
              className={`week-day${!readOnly && draft.date === date ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
              key={date}
            >
              <div className="week-day-head">
                <strong>{dateLabel(date)}</strong>
                <span>
                  {isToday && <em>Hoje</em>}
                  {day.toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              </div>
              {readOnly && !dayActivities.length && (
                <span className="week-day-empty">Livre</span>
              )}
              {dayActivities.map(activity =>
                readOnly ? (
                  <div
                    className={`week-activity is-${activity.activityType} is-readonly`}
                    key={activity.id}
                  >
                    <div className="week-activity-open">
                      <b>
                        {activityTimeRange(activity)} ·{" "}
                        {activityPeriod(activity).label}
                      </b>
                      <span>{activity.title}</span>
                      {cleanActivitySubtitle(activity.subtitle) && (
                        <small>
                          {cleanActivitySubtitle(activity.subtitle)}
                        </small>
                      )}
                      <em className="week-activity-type">
                        {ACTIVITY_TYPE_LABEL[activity.activityType]}
                      </em>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`week-activity is-${activity.activityType}${editingId === activity.id ? " is-editing" : ""}`}
                    key={activity.id}
                  >
                    <button
                      type="button"
                      className="week-activity-open"
                      onClick={() => edit(activity)}
                      disabled={saving}
                      aria-label={`Editar ${activity.title}`}
                    >
                      <b>
                        {activityTimeRange(activity)} ·{" "}
                        {activityPeriod(activity).label}
                      </b>
                      <span>{activity.title}</span>
                      {cleanActivitySubtitle(activity.subtitle) && (
                        <small>
                          {cleanActivitySubtitle(activity.subtitle)}
                        </small>
                      )}
                      <em className="week-activity-type">
                        {ACTIVITY_TYPE_LABEL[activity.activityType]}
                      </em>
                    </button>
                    <button
                      type="button"
                      className="week-activity-remove"
                      onClick={() => remove(activity)}
                      disabled={saving}
                      aria-label={`Remover ${activity.title}`}
                      title="Remover atividade"
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                )
              )}
              {!readOnly && (
                <button
                  type="button"
                  className="week-day-add"
                  onClick={() => scheduleOn(date)}
                  disabled={saving}
                  aria-label={`Agendar atividade em ${longDateLabel(date)}`}
                >
                  <Plus size={12} aria-hidden="true" />
                  {dayActivities.length ? "Agendar" : "Livre · agendar"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <div
          className={`schedule-form${editingId ? " is-editing" : ""}`}
          ref={formRef}
        >
          <div className="schedule-form-head">
            <span className="eyebrow">
              {editingId ? "EDITAR ATIVIDADE" : "NOVA ATIVIDADE"}
            </span>
            {editingId && (
              <button
                type="button"
                className="schedule-form-new"
                onClick={() => startNew(draft.date)}
                disabled={saving}
              >
                <Plus size={12} aria-hidden="true" /> Criar outra
              </button>
            )}
          </div>
          <div className="schedule-form-grid">
            <label>
              Título
              <input
                ref={titleRef}
                value={draft.title}
                placeholder="Ex.: Operação de torno"
                onChange={event =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label>
              Conteúdo <em>opcional</em>
              <input
                value={draft.subtitle}
                placeholder="Ex.: Laboratório presencial"
                onChange={event =>
                  setDraft({ ...draft, subtitle: event.target.value })
                }
              />
            </label>
            <label>
              Módulo
              <select
                value={draft.moduleId}
                onChange={event =>
                  setDraft({ ...draft, moduleId: event.target.value })
                }
              >
                <option value="">Selecione um módulo</option>
                {modules.map(module => (
                  <option key={module.id} value={module.id}>
                    {module.code} · {module.title}
                    {module.published ? "" : " · rascunho"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dia letivo
              <input
                type="date"
                value={draft.date}
                onChange={event => {
                  const date = event.target.value;
                  if (!isSchoolDate(date)) {
                    onNotify("Escolha um dia de segunda a sexta-feira.");
                    return;
                  }
                  const taken = occupiedPeriods(date, editingId);
                  setDraft({
                    ...draft,
                    date,
                    periodId: taken.has(draft.periodId)
                      ? (classSchedule.find(item => !taken.has(item.id))?.id ??
                        draft.periodId)
                      : draft.periodId,
                  });
                }}
              />
            </label>
            <label>
              Aula
              <select
                value={draft.periodId}
                onChange={event =>
                  setDraft({ ...draft, periodId: Number(event.target.value) })
                }
              >
                {classSchedule.map(item => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={takenInDraftDate.has(item.id)}
                  >
                    {item.label} · {item.start}–{item.end}
                    {takenInDraftDate.has(item.id) ? " · ocupada" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select
                value={draft.activityType}
                onChange={event =>
                  setDraft({
                    ...draft,
                    activityType: event.target.value as ActivityType,
                  })
                }
              >
                <option value="aula">Aula</option>
                <option value="laboratorio">Laboratório</option>
                <option value="avaliacao">Avaliação</option>
              </select>
            </label>
          </div>
          <div className="schedule-form-footer">
            <p className="schedule-form-summary" aria-live="polite">
              <Clock size={14} aria-hidden="true" />
              <span>
                <strong>
                  {longDateLabel(draft.date)} · {period.label} · {period.start}–
                  {period.end}
                </strong>
                <small>
                  Término automático após 45 min. Para mais tempo, agende também
                  a aula seguinte.
                </small>
              </span>
            </p>
            <div className="schedule-form-actions">
              {editingId && (
                <button
                  className="back-library"
                  onClick={() => startNew(draft.date)}
                  disabled={saving}
                >
                  Cancelar
                </button>
              )}
              <button
                className="new-module-button"
                onClick={save}
                disabled={saving || !draft.title.trim()}
              >
                <Save size={14} />{" "}
                {saving
                  ? "Salvando..."
                  : editingId
                    ? "Salvar alterações"
                    : "Agendar atividade"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function TeacherAnalytics({
  students,
  activities,
}: {
  students: TeacherStudentSummary[];
  activities: ScheduleActivity[];
}) {
  return (
    <Suspense
      fallback={
        <section className="teacher-analytics-loading" aria-live="polite">
          Carregando gráficos…
        </section>
      }
    >
      <TeacherAnalyticsCharts students={students} activities={activities} />
    </Suspense>
  );
}
const SUPERVISION_STALLED_DAYS = 7;
const SUPERVISION_VISIBLE_MODULES = 3;
type SupervisionState = "not-started" | "stalled" | "in-progress" | "completed";
type SupervisionFilter = "all" | SupervisionState;
type SupervisionSort = "priority" | "name" | "progress";
const SUPERVISION_STATES: Record<
  SupervisionState,
  { label: string; filterLabel: string; rank: number }
> = {
  "not-started": {
    label: "Ainda não iniciou",
    filterLabel: "Sem início",
    rank: 0,
  },
  stalled: { label: "Parado", filterLabel: "Parados", rank: 1 },
  "in-progress": {
    label: "Em andamento",
    filterLabel: "Em andamento",
    rank: 2,
  },
  completed: { label: "Concluído", filterLabel: "Concluídos", rank: 3 },
};
function daysSinceActivity(value: string | Date | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}
function supervisionState(student: TeacherStudentSummary): SupervisionState {
  if (student.averageProgress === 0) return "not-started";
  if (student.averageProgress >= 100) return "completed";
  const days = daysSinceActivity(student.lastActivityAt);
  return days === null || days >= SUPERVISION_STALLED_DAYS
    ? "stalled"
    : "in-progress";
}
function TeacherSupervision({
  students,
  onNotify,
  onOpenNotes,
}: {
  students: TeacherStudentSummary[];
  onNotify: (message: string) => void;
  onOpenNotes: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SupervisionFilter>("all");
  const [sort, setSort] = useState<SupervisionSort>("priority");
  const [selectedStudent, setSelectedStudent] =
    useState<TeacherStudentSummary | null>(null);
  const trpcUtils = trpc.useUtils();
  const resetStudentModuleMutation =
    trpc.learning.resetStudentModule.useMutation();
  const resetModuleProgress = (
    module: TeacherStudentSummary["modules"][number]
  ) => {
    if (!selectedStudent) return;
    const studentName = selectedStudent.name || `Aluno ${selectedStudent.id}`;
    const confirmation = `Zerar o progresso de ${studentName} no módulo "${module.title}"? Todas as etapas concluídas e os tempos registrados deste módulo serão removidos.`;
    if (!window.confirm(confirmation)) return;
    resetStudentModuleMutation.mutate(
      { studentId: selectedStudent.id, moduleId: module.moduleId },
      {
        onSuccess: async () => {
          await Promise.all([
            trpcUtils.badges.adminData.invalidate(),
            trpcUtils.learning.catalog.invalidate(),
          ]);
          setSelectedStudent(null);
          onNotify(
            `Progresso de ${studentName} resetado no módulo ${module.title}.`
          );
        },
        onError: () =>
          onNotify("Não foi possível resetar o progresso deste módulo."),
      }
    );
  };
  const studentName = (student: TeacherStudentSummary) =>
    student.name || `Aluno ${student.id}`;
  const classified = students.map(student => ({
    student,
    state: supervisionState(student),
    days: daysSinceActivity(student.lastActivityAt),
  }));
  const stateCounts = classified.reduce<Record<SupervisionState, number>>(
    (counts, entry) => ({ ...counts, [entry.state]: counts[entry.state] + 1 }),
    { "not-started": 0, stalled: 0, "in-progress": 0, completed: 0 }
  );
  const average = students.length
    ? Math.round(
        students.reduce(
          (total, student) => total + student.averageProgress,
          0
        ) / students.length
      )
    : 0;
  const normalizedQuery = query
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const visible = classified
    .filter(entry => filter === "all" || entry.state === filter)
    .filter(
      entry =>
        !normalizedQuery ||
        studentName(entry.student)
          .toLocaleLowerCase("pt-BR")
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .includes(normalizedQuery)
    )
    .sort((a, b) => {
      const byName = studentName(a.student).localeCompare(
        studentName(b.student),
        "pt-BR"
      );
      if (sort === "name") return byName;
      if (sort === "progress")
        return a.student.averageProgress - b.student.averageProgress || byName;
      // Prioridade: quem nunca começou, depois quem parou há mais tempo,
      // depois quem avança mais devagar.
      return (
        SUPERVISION_STATES[a.state].rank - SUPERVISION_STATES[b.state].rank ||
        (b.days ?? Infinity) - (a.days ?? Infinity) ||
        a.student.averageProgress - b.student.averageProgress ||
        byName
      );
    });
  const filtersActive = filter !== "all" || normalizedQuery.length > 0;
  const formatActivity = (value: string | Date | null) => {
    const days = daysSinceActivity(value);
    if (days === null || !value) return "sem atividade registrada";
    if (days === 0) return "hoje";
    if (days === 1) return "ontem";
    if (days < SUPERVISION_STALLED_DAYS) return `há ${days} dias`;
    return new Date(value)
      .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
      .replace(".", "");
  };
  return (
    <section
      className="teacher-supervision"
      aria-labelledby="teacher-supervision-title"
    >
      <div className="teacher-section-head teacher-supervision-head">
        <div>
          <span className="eyebrow">ACOMPANHAMENTO PEDAGÓGICO</span>
          <h2 id="teacher-supervision-title">Supervisão da turma</h2>
          <p>
            Veja quem está avançando e onde uma orientação pode fazer diferença.
          </p>
        </div>
        <button
          onClick={() => setHelpOpen(open => !open)}
          aria-expanded={helpOpen}
        >
          Como interpretar <CircleHelp size={14} />
        </button>
      </div>
      {helpOpen && (
        <div className="teacher-help-panel">
          <strong>Como interpretar</strong>
          <p>
            <b>Progresso médio</b> é a média dos módulos iniciados pelo aluno.{" "}
            <b>Parado</b> indica quem começou, ainda não concluiu e não registra
            atividade há {SUPERVISION_STALLED_DAYS} dias ou mais. Na ordem{" "}
            <b>Prioridade</b>, aparecem primeiro quem ainda não começou e quem
            está parado há mais tempo. Os minutos são consolidados quando cada
            etapa é concluída e aparecem separados por módulo no cartão do
            aluno.
          </p>
        </div>
      )}
      <div className="teacher-supervision-summary">
        <div>
          <span>Alunos cadastrados</span>
          <strong>{students.length}</strong>
        </div>
        <div>
          <span>Progresso médio</span>
          <strong>{average}%</strong>
        </div>
        <div>
          <span>Precisam de primeiro contato</span>
          <strong>{stateCounts["not-started"]}</strong>
        </div>
        <div>
          <span>Parados há {SUPERVISION_STALLED_DAYS}+ dias</span>
          <strong>{stateCounts.stalled}</strong>
        </div>
      </div>
      {students.length > 0 && (
        <div className="teacher-supervision-toolbar">
          <label className="teacher-supervision-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar aluno"
              aria-label="Buscar aluno pelo nome"
            />
          </label>
          <div
            className="teacher-supervision-filters"
            role="group"
            aria-label="Filtrar alunos por situação"
          >
            {(
              [
                "all",
                "not-started",
                "stalled",
                "in-progress",
                "completed",
              ] as const
            ).map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
              >
                {option === "all"
                  ? "Todos"
                  : SUPERVISION_STATES[option].filterLabel}
                <b>
                  {option === "all" ? students.length : stateCounts[option]}
                </b>
              </button>
            ))}
          </div>
          <label className="teacher-supervision-sort">
            <span>Ordenar</span>
            <select
              value={sort}
              onChange={event => setSort(event.target.value as SupervisionSort)}
            >
              <option value="priority">Prioridade</option>
              <option value="progress">Menor progresso</option>
              <option value="name">Nome</option>
            </select>
          </label>
        </div>
      )}
      {students.length > 0 && filtersActive && (
        <p className="teacher-supervision-count" aria-live="polite">
          Mostrando {visible.length} de {students.length} aluno
          {students.length === 1 ? "" : "s"}
        </p>
      )}
      {students.length > 0 && visible.length === 0 ? (
        <div className="teacher-supervision-empty">
          <Search size={20} />
          <strong>Nenhum aluno encontrado</strong>
          <span>Ajuste a busca ou o filtro para ver outros alunos.</span>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Limpar filtros
          </button>
        </div>
      ) : students.length ? (
        <div className="teacher-student-list">
          {visible.map(({ student, state, days }) => {
            const initials = (student.name || "Aluno")
              .split(" ")
              .map(part => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            const statusLabel =
              state === "stalled"
                ? days === null
                  ? "Parado · sem atividade"
                  : `Parado há ${days} dias`
                : SUPERVISION_STATES[state].label;
            const hiddenModules =
              student.modules.length - SUPERVISION_VISIBLE_MODULES;
            return (
              <article
                className={`teacher-student-row is-${state}`}
                key={student.id}
              >
                <div className="teacher-student-avatar">{initials}</div>
                <div className="teacher-student-main">
                  <strong>{studentName(student)}</strong>
                  <span>
                    <em className={`teacher-student-status is-${state}`}>
                      {statusLabel}
                    </em>{" "}
                    {student.modulesStarted} módulo
                    {student.modulesStarted === 1 ? "" : "s"} acompanhado
                    {student.modulesStarted === 1 ? "" : "s"}
                  </span>
                  <div className="teacher-student-modules">
                    {student.modules
                      .slice(0, SUPERVISION_VISIBLE_MODULES)
                      .map(module => (
                        <span
                          key={module.moduleId}
                          title={`${module.title}: ${module.progress}% · ${formatStepElapsed(module.studiedSeconds)} cronometrados`}
                        >
                          <b>{formatStepElapsed(module.studiedSeconds)}</b> ·{" "}
                          {module.title} · {module.progress}%
                        </span>
                      ))}
                    {hiddenModules > 0 && (
                      <small>
                        + {hiddenModules} módulo
                        {hiddenModules === 1 ? "" : "s"} no detalhe
                      </small>
                    )}
                  </div>
                </div>
                <div className="teacher-student-progress">
                  <div>
                    <span>Progresso médio</span>
                    <b>{student.averageProgress}%</b>
                  </div>
                  <i>
                    <em style={{ width: `${student.averageProgress}%` }} />
                  </i>
                </div>
                <div className="teacher-student-meta">
                  <span>
                    {formatStepElapsed(student.studiedSeconds)} cronometrados
                  </span>
                  <small>
                    Última atividade: {formatActivity(student.lastActivityAt)}
                  </small>
                </div>
                <button
                  className="teacher-student-action"
                  type="button"
                  onClick={() => setSelectedStudent(student)}
                  aria-label={`Abrir acompanhamento de ${studentName(student)}`}
                >
                  <ArrowRight size={15} />
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="teacher-supervision-empty">
          <UsersRound size={20} />
          <strong>Nenhum aluno cadastrado ainda</strong>
          <span>
            Quando a turma entrar, o progresso aparecerá aqui com segurança.
          </span>
        </div>
      )}
      {selectedStudent && (
        <div
          className="teacher-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedStudent(null)}
        >
          <section
            className="teacher-modal teacher-student-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-student-detail-title"
            onClick={event => event.stopPropagation()}
          >
            <button
              className="teacher-modal-close"
              onClick={() => setSelectedStudent(null)}
              aria-label="Fechar acompanhamento"
            >
              <X size={17} />
            </button>
            <span className="eyebrow">ACOMPANHAMENTO INDIVIDUAL</span>
            <h2 id="teacher-student-detail-title">
              {selectedStudent.name || `Aluno ${selectedStudent.id}`}
            </h2>
            <p className="teacher-detail-summary">
              {selectedStudent.modulesCompleted} módulo
              {selectedStudent.modulesCompleted === 1 ? "" : "s"} concluído
              {selectedStudent.modulesCompleted === 1 ? "" : "s"} ·{" "}
              {formatStepElapsed(selectedStudent.studiedSeconds)} cronometrados
              · última atividade{" "}
              {formatActivity(selectedStudent.lastActivityAt)}
            </p>
            <div className="teacher-detail-module-list">
              {selectedStudent.modules.length ? (
                selectedStudent.modules.map(module => (
                  <article
                    className="teacher-detail-module"
                    key={module.moduleId}
                  >
                    <div className="teacher-detail-module-main">
                      <div>
                        <strong>{module.title}</strong>
                        <span>
                          {module.progress}% de progresso ·{" "}
                          {formatStepElapsed(module.studiedSeconds)}{" "}
                          cronometrados no módulo
                        </span>
                      </div>
                      {module.stepTimes.length ? (
                        <ul
                          className="teacher-detail-step-times"
                          aria-label={`Tempo registrado por etapa de ${module.title}`}
                        >
                          {module.stepTimes.map(step => (
                            <li key={step.stepIndex}>
                              <span>
                                Etapa {step.stepIndex + 1} · {step.title}
                              </span>
                              <b>{formatStepElapsed(step.elapsedSeconds)}</b>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <small className="teacher-detail-no-step-time">
                          Tempo por etapa ainda não consolidado.
                        </small>
                      )}
                    </div>
                    <div className="teacher-detail-module-actions">
                      <b className="teacher-detail-module-total">
                        {formatStepElapsed(module.studiedSeconds)}
                      </b>
                      <button
                        className="teacher-reset-progress-button"
                        type="button"
                        disabled={resetStudentModuleMutation.isPending}
                        aria-label={`Resetar progresso de ${module.title} para ${selectedStudent.name || `Aluno ${selectedStudent.id}`}`}
                        onClick={() => resetModuleProgress(module)}
                      >
                        {resetStudentModuleMutation.isPending
                          ? "Resetando…"
                          : "Resetar progresso"}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p>
                  Nenhum módulo iniciado. O primeiro contato pode orientar o
                  início da formação.
                </p>
              )}
            </div>
            <button
              className="new-module-button"
              onClick={() => {
                setSelectedStudent(null);
                onOpenNotes();
                onNotify(
                  `Abra as anotações locais para registrar a orientação de ${selectedStudent.name || `Aluno ${selectedStudent.id}`}.`
                );
              }}
            >
              Registrar orientação <ArrowRight size={14} />
            </button>
          </section>
        </div>
      )}
    </section>
  );
}

function TeacherDashboard({
  modules,
  onOpen,
  onEdit,
  onNew,
  onNotify,
  onOpenNotes,
  onPreviewAsStudent,
  showModules = true,
  activities,
  onScheduleChange,
  scheduleSaving,
  badgeStudents,
  assignedBadges,
  badgeLoading,
  badgeError,
  onRetryBadges,
  badgeSaving,
  onAssignBadge,
  onRemoveBadge,
  supervision,
  teacherName,
  dataLoading,
  dataError,
  onRetryData,
  onOpenInventory,
  inventorySummary,
  inventoryLoading,
  inventoryError,
}: {
  modules: DidacticModule[];
  onOpen: (module: DidacticModule) => void;
  onEdit: (module: DidacticModule) => void;
  onNew: () => void;
  onNotify: (message: string) => void;
  onOpenNotes: () => void;
  onPreviewAsStudent: () => void;
  /** Falso para a administração: o Início vira só visão geral, sem gestão de módulos. */
  showModules?: boolean;
  activities: ScheduleActivity[];
  onScheduleChange: (activities: ScheduleActivity[]) => void;
  scheduleSaving: boolean;
  badgeStudents: BadgeStudent[];
  assignedBadges: AssignedStudentBadge[];
  badgeLoading: boolean;
  badgeError: boolean;
  onRetryBadges: () => void;
  badgeSaving: boolean;
  onAssignBadge: (input: AwardStudentBadgeInput) => void;
  onRemoveBadge: (badgeId: number) => void;
  supervision: TeacherStudentSummary[];
  teacherName: string;
  dataLoading: boolean;
  dataError: boolean;
  onRetryData: () => void;
  onOpenInventory: () => void;
  inventorySummary: InventorySummary | null;
  inventoryLoading: boolean;
  inventoryError: boolean;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const published = modules.filter(module => module.published).length;
  const draftModules = showModules
    ? modules.filter(module => !module.published)
    : [];
  const drafts = draftModules.length;
  const steps = modules.reduce(
    (total, module) => total + module.steps.length,
    0
  );
  const now = Date.now();
  const upcomingActivities = activities
    .filter(activity => new Date(activity.endsAt).getTime() >= now)
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  const nextActivity = upcomingActivities[0];
  const studentsWithoutStart = supervision.filter(
    student => student.modulesStarted === 0 && student.averageProgress === 0
  );
  const averageProgress = supervision.length
    ? Math.round(
        supervision.reduce((sum, student) => sum + student.averageProgress, 0) /
          supervision.length
      )
    : 0;
  const stockAlerts = inventorySummary?.alerts ?? [];
  const overdueLoans = inventorySummary?.totals.overdueLoans ?? 0;
  const firstName = teacherName.split(" ")[0] || "docente";
  const goTo = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  // "Para fazer agora": cada item leva direto ao lugar onde a ação acontece.
  const todo: Array<{
    id: string;
    tone: "red" | "amber" | "blue";
    icon: ReactNode;
    title: string;
    detail: string;
    action: string;
    onClick: () => void;
  }> = [
    ...(overdueLoans > 0
      ? [
          {
            id: "loans",
            tone: "red" as const,
            icon: <Warehouse size={16} />,
            title: `${overdueLoans} ${overdueLoans === 1 ? "empréstimo atrasado" : "empréstimos atrasados"}`,
            detail: "Ferramentas com devolução vencida.",
            action: "Ver empréstimos",
            onClick: onOpenInventory,
          },
        ]
      : []),
    ...stockAlerts.slice(0, 2).map(item => ({
      id: `stock-${item.id}`,
      tone: (item.available <= 0 ? "red" : "amber") as "red" | "amber",
      icon: <Warehouse size={16} />,
      title:
        item.available <= 0
          ? `${item.name} sem saldo`
          : `${item.name} com estoque baixo`,
      detail: `${item.available} ${item.unit} disponíveis · mínimo ${item.minQuantity}`,
      action: "Abrir estoque",
      onClick: onOpenInventory,
    })),
    ...draftModules.slice(0, 2).map(module => ({
      id: `draft-${module.id}`,
      tone: "amber" as const,
      icon: <Edit3 size={16} />,
      title: `${module.title} está em rascunho`,
      detail: module.steps.length
        ? `${module.steps.length} etapas prontas para revisar e publicar.`
        : "Ainda sem etapas: comece pelo conteúdo.",
      action: "Revisar e publicar",
      onClick: () => onEdit(module),
    })),
    ...(studentsWithoutStart.length
      ? [
          {
            id: "students",
            tone: "blue" as const,
            icon: <UsersRound size={16} />,
            title: `${studentsWithoutStart.length} ${studentsWithoutStart.length === 1 ? "aluno ainda não começou" : "alunos ainda não começaram"}`,
            detail: "Um primeiro contato costuma destravar o início.",
            action: "Ver turma",
            onClick: () => goTo("td-turma"),
          },
        ]
      : []),
    ...(nextActivity
      ? [
          {
            id: "next",
            tone: "blue" as const,
            icon: <CalendarClock size={16} />,
            title: `Próxima aula: ${nextActivity.title}`,
            detail: `${new Date(nextActivity.startsAt).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })} · ${activityTimeRange(nextActivity)}`,
            action: "Ver agenda",
            onClick: () => goTo("td-agenda"),
          },
        ]
      : []),
  ];

  return (
    <main className="clean-content teacher-dashboard-content td">
      <header className="td-hero">
        <div>
          <span className="eyebrow">
            {showModules ? "CENTRAL DOCENTE" : "VISÃO GERAL"}
          </span>
          <h1>Olá, {firstName}.</h1>
          <p>
            {showModules
              ? "Veja o que precisa da sua atenção, acompanhe a turma e prepare as próximas aulas."
              : "Veja o que precisa da sua atenção, acompanhe as turmas, a agenda e o estoque."}
          </p>
        </div>
        <div className="td-hero-actions">
          <button type="button" className="td-btn" onClick={onOpenNotes}>
            <FileText size={15} aria-hidden="true" /> Anotações
          </button>
          <button type="button" className="td-btn" onClick={onOpenInventory}>
            <Warehouse size={15} aria-hidden="true" /> Estoque
          </button>
          {showModules && (
            <button type="button" className="td-btn is-primary" onClick={onNew}>
              <Plus size={15} aria-hidden="true" /> Novo módulo
            </button>
          )}
        </div>
      </header>

      <nav className="td-nav" aria-label="Seções da central docente">
        {[
          ["td-atencao", "Para fazer agora"],
          ["td-turma", "Turma"],
          ...(showModules ? [["td-modulos", "Módulos"]] : []),
          ["td-agenda", "Agenda"],
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => goTo(id)}>
            {label}
          </button>
        ))}
        <button
          type="button"
          className="td-help-toggle"
          onClick={() => setHelpOpen(open => !open)}
          aria-expanded={helpOpen}
        >
          <CircleHelp size={14} aria-hidden="true" /> Como funciona
        </button>
      </nav>
      {helpOpen && (
        <div className="td-help" role="note">
          <p>
            {showModules && (
              <>
                <b>Módulos</b>: rascunhos ficam privados; publicar libera o
                conteúdo para os alunos.{" "}
              </>
            )}
            <b>Turma</b>: progresso e tempo confirmados no banco, por aluno e
            por módulo. <b>Agenda</b>: organiza as aulas da semana e não altera
            o progresso de ninguém.
          </p>
        </div>
      )}

      <div
        className="teacher-data-status"
        role={dataError ? "alert" : "status"}
        aria-live="polite"
      >
        {dataLoading ? (
          "Atualizando dados confirmados do banco…"
        ) : dataError ? (
          <>
            <span>Não foi possível carregar os dados docentes do banco.</span>
            <button type="button" onClick={onRetryData}>
              Tentar novamente
            </button>
          </>
        ) : null}
      </div>

      <section className="td-summary" aria-label="Resumo">
        <button
          type="button"
          className="td-stat"
          onClick={() => goTo("td-turma")}
        >
          <b className="td-stat-icon" aria-hidden="true">
            <UsersRound size={18} />
          </b>
          <span className="td-stat-label">Alunos</span>
          <strong>{supervision.length}</strong>
          <em>progresso médio {averageProgress}%</em>
        </button>
        {showModules && (
          <button
            type="button"
            className="td-stat"
            onClick={() => goTo("td-modulos")}
          >
            <b className="td-stat-icon" aria-hidden="true">
              <Layers3 size={18} />
            </b>
            <span className="td-stat-label">Módulos publicados</span>
            <strong>
              {published}
              <small>/{modules.length}</small>
            </strong>
            <em>
              {drafts
                ? `${drafts} ${drafts === 1 ? "rascunho" : "rascunhos"} · `
                : ""}
              {steps} etapas
            </em>
          </button>
        )}
        <button
          type="button"
          className="td-stat"
          onClick={() => goTo("td-agenda")}
        >
          <b className="td-stat-icon" aria-hidden="true">
            <CalendarClock size={18} />
          </b>
          <span className="td-stat-label">Próximas aulas</span>
          <strong>{upcomingActivities.length}</strong>
          <em>{activities.length} no calendário</em>
        </button>
        <button
          type="button"
          className={`td-stat ${stockAlerts.length || overdueLoans ? "has-alert" : ""}`}
          onClick={onOpenInventory}
        >
          <b className="td-stat-icon" aria-hidden="true">
            <Warehouse size={18} />
          </b>
          <span className="td-stat-label">Estoque</span>
          <strong>
            {inventoryLoading
              ? "…"
              : inventoryError
                ? "—"
                : (inventorySummary?.totals.items ?? 0)}
            <small> itens</small>
          </strong>
          <em>
            {inventoryError
              ? "não foi possível carregar"
              : stockAlerts.length || overdueLoans
                ? `${stockAlerts.length} com estoque baixo · ${overdueLoans} atrasos`
                : `${inventorySummary?.totals.activeLoans ?? 0} empréstimos ativos`}
          </em>
        </button>
      </section>

      <section
        id="td-atencao"
        className="td-section td-todo"
        aria-labelledby="td-atencao-title"
      >
        <div className="td-section-head">
          <div>
            <span className="eyebrow">PRIORIDADES</span>
            <h2 id="td-atencao-title">Para fazer agora</h2>
          </div>
        </div>
        {todo.length ? (
          <ul>
            {todo.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`td-todo-item tone-${item.tone}`}
                  onClick={item.onClick}
                >
                  <b className="td-todo-icon" aria-hidden="true">
                    {item.icon}
                  </b>
                  <span className="td-todo-copy">
                    <strong>{item.title}</strong>
                    <em>{item.detail}</em>
                  </span>
                  <b className="td-todo-action">
                    {item.action} <ArrowRight size={14} aria-hidden="true" />
                  </b>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="td-empty">
            <Check size={16} aria-hidden="true" />{" "}
            {showModules
              ? "Tudo em dia: nenhum rascunho pendente, alerta de estoque ou aluno parado."
              : "Tudo em dia: nenhum alerta de estoque ou aluno parado."}
          </p>
        )}
      </section>

      <section id="td-turma" className="td-section" aria-label="Turma">
        <TeacherAnalytics students={supervision} activities={activities} />
        <TeacherSupervision
          students={supervision}
          onNotify={onNotify}
          onOpenNotes={onOpenNotes}
        />
        <TeacherBadgeManager
          students={badgeStudents}
          badges={assignedBadges}
          loading={badgeLoading}
          error={badgeError}
          onRetry={onRetryBadges}
          saving={badgeSaving}
          onAssign={onAssignBadge}
          onRemove={onRemoveBadge}
        />
      </section>

      {showModules && (
        <section
          id="td-modulos"
          className="td-section"
          aria-labelledby="td-modulos-title"
        >
          <div className="td-section-head">
            <div>
              <span className="eyebrow">GESTÃO DE CONTEÚDO</span>
              <h2 id="td-modulos-title">Seus módulos</h2>
              <p>
                Rascunhos ficam privados; publicar disponibiliza o conteúdo aos
                alunos.
              </p>
            </div>
            <button
              type="button"
              className="td-link"
              onClick={onPreviewAsStudent}
            >
              Abrir biblioteca <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
          <ul className="td-modules">
            {modules.map(module => (
              <li key={module.id} className="td-module">
                <b className="td-module-icon" aria-hidden="true">
                  {module.kind === "Ferramenta" ? (
                    <Wrench size={18} />
                  ) : module.kind === "Montagem" ? (
                    <Layers3 size={18} />
                  ) : (
                    <Settings2 size={18} />
                  )}
                </b>
                <div className="td-module-copy">
                  <em>
                    {module.code} · {module.kind}
                  </em>
                  <strong>{module.title}</strong>
                  <span className="td-module-meta">
                    {module.steps.length}{" "}
                    {module.steps.length === 1 ? "etapa" : "etapas"} ·{" "}
                    {module.resources.length}{" "}
                    {module.resources.length === 1 ? "recurso" : "recursos"}
                  </span>
                </div>
                <b
                  className={`td-module-status ${module.published ? "is-published" : "is-draft"}`}
                >
                  {module.published ? "Publicado" : "Rascunho"}
                </b>
                <div className="td-module-actions">
                  <button
                    type="button"
                    className="td-btn"
                    onClick={() => onOpen(module)}
                    aria-label={`Visualizar ${module.title}`}
                  >
                    Visualizar
                  </button>
                  <button
                    type="button"
                    className="td-btn is-primary"
                    onClick={() => onEdit(module)}
                    aria-label={`Editar ${module.title}`}
                  >
                    <Edit3 size={14} aria-hidden="true" /> Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="td-agenda" className="td-section" aria-label="Agenda">
        <ScheduleManager
          modules={modules}
          activities={activities}
          onChange={onScheduleChange}
          onNotify={onNotify}
          saving={scheduleSaving}
        />
      </section>
    </main>
  );
}
function Clock3Icon() {
  return <Clock size={17} />;
}

function formatStepElapsed(seconds: number) {
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
function StepTimerReadout({
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

type HomeView =
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

const VIEW_PATHS: Record<Exclude<HomeView, "not-found">, string> = {
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

const MODULE_VIEWS: HomeView[] = ["library", "reader", "editor"];

/** Converte a URL atual na tela do aplicativo (permite recarregar e usar o histórico). */
function viewFromPath(path: string): HomeView {
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

function initialsOf(name: string | null | undefined, fallback: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return `${parts[0][0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

export default function Home({
  user,
  onLogout,
  loggingOut,
}: {
  user: PublicUser;
  onLogout: () => Promise<void>;
  loggingOut: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const utils = trpc.useUtils();
  const authQuery = trpc.auth.me.useQuery(undefined, { initialData: user });
  const currentUser = authQuery.data ?? user;
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const profileAvatarUrl = localAvatarUrl ?? currentUser.avatarUrl ?? null;
  // O papel exibido vem da sessão validada no servidor; o backend repete a checagem em cada endpoint.
  const isTeacher = isStaffRole(currentUser.role);
  const isAdmin = isAdminRole(currentUser.role);
  const canSeeModules = canAccessModules(currentUser.role);
  const [location, navigate] = useLocation();
  const requestedView = viewFromPath(location);
  // A administração não abre módulos: biblioteca, leitor e editor caem no Início.
  const view: HomeView =
    !canSeeModules && MODULE_VIEWS.includes(requestedView)
      ? "dashboard"
      : requestedView;
  const setView = (next: Exclude<HomeView, "not-found">) => {
    if (VIEW_PATHS[next] !== location) navigate(VIEW_PATHS[next]);
  };
  const [statsPeriod, setStatsPeriod] = useState<
    "all" | "today" | "week" | "month"
  >("all");
  const currentIdentityKey = currentUser.id;
  const catalogScopeKey = `${currentUser.id}:${currentUser.role}`;
  const catalogQuery = trpc.learning.catalog.useQuery({
    period: statsPeriod,
    identityKey: catalogScopeKey,
  });
  const catalogViewerMatches =
    catalogQuery.data?.viewerId === currentIdentityKey &&
    catalogQuery.data?.viewerRole === currentUser.role;
  const avatarMutation = trpc.profile.uploadAvatar.useMutation();
  const saveModuleMutation = trpc.learning.saveModule.useMutation();
  const deleteModuleMutation = trpc.learning.deleteModule.useMutation();
  const startStepMutation = trpc.learning.startStep.useMutation();
  const progressMutation = trpc.learning.updateProgress.useMutation();
  const saveScheduleMutation = trpc.learning.saveSchedule.useMutation();
  const canManageBadges = isTeacher;
  const noteStorageKey = `student-notes:user:${currentUser.id}`;
  const myBadgesQuery = trpc.badges.mine.useQuery(
    { identityKey: currentUser.id },
    { enabled: !isTeacher }
  );
  const teacherBadgesQuery = trpc.badges.adminData.useQuery(
    { identityKey: currentUser.id },
    { enabled: isTeacher && canManageBadges }
  );
  // Resumo do estoque: consultado apenas por docentes (o servidor recusa alunos).
  const inventorySummaryQuery = trpc.inventory.summary.useQuery(undefined, {
    enabled: isTeacher,
    staleTime: 30_000,
    // Mantém os avisos de estoque das notificações atualizados sem recarregar a página.
    refetchInterval: 60_000,
  });
  const assignBadgeMutation = trpc.badges.assign.useMutation();
  const removeBadgeMutation = trpc.badges.remove.useMutation();
  const [modules, setModules] = useState<DidacticModule[]>([]);
  const [scheduleActivities, setScheduleActivities] = useState<
    ScheduleActivity[]
  >([]);
  const [selectedModuleId, setSelectedModuleId] = useState("matriz");
  const [editing, setEditing] = useState<DidacticModule | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [kindFilter, setKindFilter] = useState<ModuleKind | "Todos">("Todos");
  const [completionCelebration, setCompletionCelebration] = useState<{
    title: string;
    code: string;
  } | null>(null);
  const [stepTimerSession, setStepTimerSession] = useState<{
    identityKey: number | null;
    roleKey: boolean;
    moduleId: string;
    stepIndex: number;
    startedAt: Date;
    elapsedSeconds: number;
    completedAt: Date | null;
  } | null>(null);
  const restoredActiveSessionKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!catalogViewerMatches || !catalogQuery.data) {
      setModules([]);
      setScheduleActivities([]);
      return;
    }
    const remote = catalogQuery.data as CatalogData;
    setModules(normalizeRemoteModules(remote));
    setScheduleActivities(remote.activities);
  }, [catalogQuery.data, catalogViewerMatches]);
  const saveSchedule = (next: ScheduleActivity[]) => {
    const entries = next.map(activity => {
      const exactPeriod = findClassPeriodForDate(activity.startsAt);
      const period =
        exactPeriod || nearestClassPeriod(scheduleClock(activity.startsAt));
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
    setScheduleActivities(next);
    saveScheduleMutation.mutate(entries, {
      onSuccess: async () => {
        const result = await catalogQuery.refetch();
        // Atividades de outros docentes não mudam pela tela de quem salvou: mostra o que ficou gravado.
        if (result.data) setScheduleActivities(result.data.activities);
        notify("Cronograma salvo no banco e sincronizado com as anotações.");
      },
      onError: async error => {
        const result = await catalogQuery.refetch();
        setScheduleActivities(result.data?.activities ?? []);
        notify(
          serverMessage(
            error,
            "Não foi possível salvar o cronograma. Confira os horários e tente novamente."
          )
        );
      },
    });
  };
  useEffect(() => {
    // Admin numa URL de módulo: corrige o endereço para o Início.
    if (requestedView !== view) {
      setView(view as Exclude<HomeView, "not-found">);
      return;
    }
    // /editor sem um módulo em edição (ex.: página recarregada) volta para a biblioteca.
    if (view === "editor" && (!isTeacher || !editing)) setView("library");
  }, [isTeacher, view, requestedView, editing]);
  // Um aviso novo reinicia o prazo: o timer do aviso anterior não o apaga antes da hora.
  const toastTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);
  const notify = (message: string) => {
    window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(
      () => setToast(""),
      Math.max(2400, message.length * 45)
    );
  };
  const activeSessionRestoreKey = `${currentIdentityKey ?? "anonymous"}:${isTeacher ? "teacher" : "student"}`;
  useEffect(() => {
    setStepTimerSession(null);
    restoredActiveSessionKeyRef.current = null;
  }, [isTeacher, currentIdentityKey]);
  // Mantém a seleção do leitor válida: sem módulo selecionado (ex.: "Leitor" no menu ao
  // abrir o app) abre o primeiro na etapa atual; etapas removidas ou progresso resetado
  // trazem a etapa de volta para uma posição existente e liberada. Fica antes da retomada
  // automática para que, no mesmo commit, a sessão retomada prevaleça.
  useEffect(() => {
    if (!modules.length) return;
    const current = modules.find(module => module.id === selectedModuleId);
    if (!current) {
      const first = modules[0];
      setSelectedModuleId(first.id);
      setStepIndex(
        Math.max(
          0,
          Math.min(first.currentStepIndex ?? 0, first.steps.length - 1)
        )
      );
      return;
    }
    const lastIndex = Math.max(current.steps.length - 1, 0);
    const maxIndex = isTeacher
      ? lastIndex
      : Math.min(lastIndex, current.currentStepIndex ?? 0);
    if (stepIndex > maxIndex) setStepIndex(maxIndex);
  }, [modules, selectedModuleId, stepIndex, isTeacher]);
  useEffect(() => {
    if (isTeacher || !catalogViewerMatches || !catalogQuery.data) return;
    if (restoredActiveSessionKeyRef.current === activeSessionRestoreKey) return;
    // Só retoma automaticamente o leitor ao abrir o início ou o próprio leitor.
    if (view !== "dashboard" && view !== "reader") return;
    restoredActiveSessionKeyRef.current = activeSessionRestoreKey;
    const latestOpenSession = catalogQuery.data.modules
      .flatMap(module =>
        (module.stepSessions ?? [])
          .filter(session => session.completedAt === null)
          .map(session => ({
            moduleId: module.id,
            stepIndex: session.stepIndex,
            startedAt: session.startedAt,
          }))
      )
      .sort(
        (left, right) => right.startedAt.getTime() - left.startedAt.getTime()
      )[0];
    if (!latestOpenSession) return;
    setSelectedModuleId(latestOpenSession.moduleId);
    setStepIndex(latestOpenSession.stepIndex);
    setView("reader");
  }, [
    activeSessionRestoreKey,
    catalogQuery.data,
    catalogViewerMatches,
    isTeacher,
  ]);
  useEffect(() => {
    if (!completionCelebration) return;
    const timeout = window.setTimeout(
      () => setCompletionCelebration(null),
      3600
    );
    return () => window.clearTimeout(timeout);
  }, [completionCelebration]);
  const notifications = useMemo<AppNotification[]>(() => {
    const now = Date.now();
    const weekAhead = now + 7 * 86_400_000;
    const upcoming = scheduleActivities
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
      .slice(0, 3);
    const activityLabel = {
      aula: "Aula",
      laboratorio: "Laboratório",
      avaliacao: "Avaliação",
    } as const;
    const classNotifications: AppNotification[] = upcoming.map(
      ({ activity, startsAt }) => ({
        id: `class-${activity.id}-${startsAt.getTime()}`,
        kind: "class",
        title: `${activityLabel[activity.activityType] ?? "Aula"}: ${activity.title}`,
        detail: activity.subtitle || "Agendada no calendário da turma.",
        when: startsAt,
        urgent:
          activity.activityType === "avaliacao" &&
          startsAt.getTime() - now < 86_400_000,
        target: { view: "dashboard" },
      })
    );
    if (isTeacher) {
      const summary = inventorySummaryQuery.data;
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
      const overdue = summary?.totals.overdueLoans ?? 0;
      const drafts = canSeeModules
        ? modules.filter(module => !module.published)
        : [];
      return [
        ...(overdue > 0
          ? [
              {
                id: `loans-overdue-${overdue}`,
                kind: "loan" as const,
                title: `${overdue} ${overdue === 1 ? "empréstimo atrasado" : "empréstimos atrasados"}`,
                detail: "Ferramentas com a devolução prevista vencida.",
                urgent: true,
                target: { view: "inventory" as const },
              },
            ]
          : []),
        ...stockAlerts,
        ...classNotifications,
        ...drafts.slice(0, 3).map(module => ({
          id: `draft-${module.id}`,
          kind: "draft" as const,
          title: `${module.code} está em rascunho`,
          detail: `“${module.title}” ainda não aparece para os alunos.`,
          target: { view: "editor" as const, moduleId: module.id },
        })),
      ];
    }
    const visibleModules = modules.filter(module => module.published);
    const inProgress = visibleModules
      .filter(module => module.progress > 0 && module.progress < 100)
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 2);
    const done = visibleModules
      .filter(module => module.progress >= 100)
      .slice(0, 2);
    const fresh = visibleModules
      .filter(module => module.progress === 0)
      .slice(0, 2);
    return [
      ...classNotifications,
      ...inProgress.map(module => ({
        id: `progress-${module.id}-${module.currentStepIndex ?? 0}`,
        kind: "progress" as const,
        title: `Continue: ${module.title}`,
        detail: `${Math.round(module.progress)}% concluído · etapa ${(module.currentStepIndex ?? 0) + 1} de ${Math.max(module.steps.length, 1)}`,
        target: { view: "reader" as const, moduleId: module.id },
      })),
      ...fresh.map(module => ({
        id: `new-${module.id}`,
        kind: "new" as const,
        title: `Novo módulo: ${module.title}`,
        detail: `${module.code} · ${module.duration || module.kind}`,
        target: { view: "reader" as const, moduleId: module.id },
      })),
      ...done.map(module => ({
        id: `done-${module.id}`,
        kind: "done" as const,
        title: `Módulo concluído: ${module.title}`,
        detail: "Parabéns! Revise quando quiser na Biblioteca.",
        target: { view: "library" as const },
      })),
    ];
  }, [
    inventorySummaryQuery.data,
    isTeacher,
    canSeeModules,
    modules,
    scheduleActivities,
  ]);
  const openNotification = (item: AppNotification) => {
    const module = item.target.moduleId
      ? modules.find(entry => entry.id === item.target.moduleId)
      : undefined;
    if (item.target.view === "reader" && module) openModule(module);
    else if (item.target.view === "editor") {
      setEditing(module ?? activeModule);
      setView("editor");
    } else setView(item.target.view);
  };
  const activeModule =
    modules.find(item => item.id === selectedModuleId) ||
    modules[0] ||
    emptyModule;
  const activeStep = activeModule.steps[stepIndex] || activeModule.steps[0];
  if (catalogQuery.isError && !catalogViewerMatches)
    return (
      <main className="clean-content module-empty-state" role="alert">
        <h1>Não foi possível carregar o catálogo</h1>
        <p>
          Confira a conexão com o servidor e tente novamente. Nenhum conteúdo
          demonstrativo foi colocado no lugar dos dados do banco.
        </p>
        <button
          className="library-empty-reset"
          type="button"
          onClick={() => void catalogQuery.refetch()}
        >
          Tentar novamente
        </button>
      </main>
    );
  if (!catalogViewerMatches)
    return (
      <BootScreen
        label="Carregando seus módulos…"
        onRetry={() => void catalogQuery.refetch()}
      />
    );
  const completedStepCount = Math.max(
    0,
    Math.min(activeModule.steps.length, activeModule.currentStepIndex ?? 0)
  );
  const localStepTimerSession =
    catalogViewerMatches &&
    stepTimerSession?.identityKey === currentIdentityKey &&
    stepTimerSession?.roleKey === isTeacher &&
    stepTimerSession?.moduleId === activeModule.id &&
    stepTimerSession.stepIndex === stepIndex
      ? stepTimerSession
      : null;
  const savedStepSession = catalogViewerMatches
    ? (catalogQuery.data as CatalogData | undefined)?.modules
        .find(module => module.id === activeModule.id)
        ?.stepSessions?.find(session => session.stepIndex === stepIndex)
    : undefined;
  const savedStepTimerSession = savedStepSession
    ? {
        moduleId: activeModule.id,
        stepIndex,
        startedAt: new Date(savedStepSession.startedAt),
        elapsedSeconds: savedStepSession.elapsedSeconds,
        completedAt: savedStepSession.completedAt
          ? new Date(savedStepSession.completedAt)
          : null,
      }
    : null;
  const activeStepTimerSession = localStepTimerSession ?? savedStepTimerSession;
  const selectedStepIsCompleted =
    isStepCompleted(stepIndex, completedStepCount) ||
    Boolean(activeStepTimerSession?.completedAt);
  const stepTimerIsRunning =
    !selectedStepIsCompleted &&
    Boolean(activeStepTimerSession && !activeStepTimerSession.completedAt);
  // Busca sem acento: "modulo 03" encontra "MÓDULO 03", "operacao" encontra "Operação".
  const foldSearchText = (value: string) =>
    value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const moduleSearchQuery = foldSearchText(search.trim());
  const visibleModules = modules.filter(
    item =>
      (kindFilter === "Todos" || sameKind(item.kind, kindFilter)) &&
      foldSearchText(
        `${item.title} ${item.description} ${item.code} ${item.kind}`
      ).includes(moduleSearchQuery)
  );
  // Exemplos sempre aparecem; tipos escritos pelo docente entram depois deles.
  const moduleKindOptions: Array<ModuleKind | "Todos"> = ["Todos"];
  for (const kind of [
    ...MODULE_KIND_SUGGESTIONS,
    ...modules.map(item => item.kind.trim()),
  ]) {
    if (kind && !moduleKindOptions.some(option => sameKind(option, kind)))
      moduleKindOptions.push(kind);
  }
  const moduleKindCounts: Record<ModuleKind | "Todos", number> =
    Object.fromEntries(
      moduleKindOptions.map(kind => [
        kind,
        kind === "Todos"
          ? modules.length
          : modules.filter(item => sameKind(item.kind, kind)).length,
      ])
    );
  const hasLibraryFilters = kindFilter !== "Todos" || Boolean(search.trim());
  const clearLibraryFilters = () => {
    setKindFilter("Todos");
    setSearch("");
  };
  const moduleResultText = hasLibraryFilters
    ? `${visibleModules.length} ${visibleModules.length === 1 ? "módulo encontrado" : "módulos encontrados"}`
    : `${visibleModules.length} ${visibleModules.length === 1 ? "módulo no catálogo" : "módulos no catálogo"}`;
  const moduleEmptyDescription =
    modules.length === 0
      ? "Ainda não há conteúdos disponíveis no catálogo."
      : search.trim()
        ? `Nenhum módulo corresponde a “${search.trim()}”${kindFilter !== "Todos" ? ` no tipo ${kindFilter}` : ""}.`
        : `Nenhum módulo do tipo ${kindFilter} está disponível.`;
  const resourceCategoryOrder: Record<Exclude<Category, "all">, number> = {
    materials: 0,
    machines: 1,
    tools: 2,
    parts: 3,
  };
  const filteredResources = activeModule.resources
    .filter(item => category === "all" || item.category === category)
    .sort(
      (a, b) =>
        resourceCategoryOrder[a.category] - resourceCategoryOrder[b.category]
    );
  const moduleProgress = Math.max(0, Math.min(100, activeModule.progress));
  // O paquímetro lê uma casa decimal: usa a fração exata das etapas quando ela
  // corresponde ao progresso salvo (arredondado), senão o valor salvo.
  const exactStepProgress = activeModule.steps.length
    ? (completedStepCount / activeModule.steps.length) * 100
    : 0;
  const moduleProgressReading =
    Math.round(exactStepProgress) === moduleProgress
      ? exactStepProgress
      : moduleProgress;
  const canGoNext =
    stepIndex < activeModule.steps.length - 1 &&
    (isTeacher || stepIndex + 1 <= completedStepCount);
  const resourceCategoryOptions: { id: Category; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "materials", label: "Materiais" },
    { id: "machines", label: "Máquinas" },
    { id: "tools", label: "Ferramentas" },
    { id: "parts", label: "Mini peças" },
  ];
  const resourceCategoryCounts: Record<Category, number> = {
    all: activeModule.resources.length,
    materials: activeModule.resources.filter(
      item => item.category === "materials"
    ).length,
    machines: activeModule.resources.filter(
      item => item.category === "machines"
    ).length,
    tools: activeModule.resources.filter(item => item.category === "tools")
      .length,
    parts: activeModule.resources.filter(item => item.category === "parts")
      .length,
  };
  const openModule = (module: DidacticModule) => {
    setSelectedModuleId(module.id);
    setStepIndex(
      Math.max(
        0,
        Math.min(
          module.currentStepIndex ?? 0,
          Math.max(module.steps.length - 1, 0)
        )
      )
    );
    setCategory("all");
    setView("reader");
  };
  const startCurrentStep = () => {
    if (isTeacher || activeStepTimerSession || startStepMutation.isPending)
      return;
    if (selectedStepIsCompleted) {
      notify(
        "Esta etapa já está concluída. Somente o docente pode resetar o progresso."
      );
      return;
    }
    if (
      !activeModule.id ||
      !activeModule.steps.length ||
      stepIndex >= activeModule.steps.length
    ) {
      notify("Não há uma etapa disponível para iniciar.");
      return;
    }
    startStepMutation.mutate(
      { moduleId: activeModule.id, stepIndex },
      {
        onSuccess: async ({ session }) => {
          setStepTimerSession({
            identityKey: currentIdentityKey,
            roleKey: isTeacher,
            moduleId: activeModule.id,
            stepIndex,
            ...session,
          });
          await catalogQuery.refetch();
          notify("Etapa iniciada. O tempo será salvo ao concluí-la.");
        },
        onError: async error => {
          await catalogQuery.refetch();
          notify(
            serverMessage(
              error,
              "Não foi possível iniciar o timer desta etapa. Tente novamente."
            )
          );
        },
      }
    );
  };
  const completeStep = () => {
    if (isTeacher) {
      notify("A pré-visualização docente não altera o progresso dos alunos.");
      return;
    }
    if (selectedStepIsCompleted) {
      notify(
        "Esta etapa já está concluída. Somente o docente pode resetar o progresso."
      );
      return;
    }
    if (!activeModule.steps.length || !activeModule.id) {
      notify(
        "Este módulo ainda não possui etapas. Abra o editor docente para configurá-lo."
      );
      return;
    }
    if (!activeStepTimerSession || activeStepTimerSession.completedAt) {
      notify("Clique em Iniciar etapa antes de concluí-la.");
      return;
    }
    const completed = Math.min(activeModule.steps.length, stepIndex + 1);
    const elapsedSeconds = getElapsedStudySeconds(
      activeStepTimerSession.startedAt.getTime(),
      Date.now()
    );
    progressMutation.mutate(
      { moduleId: activeModule.id, stepIndex: completed, elapsedSeconds },
      {
        onSuccess: async ({ elapsedSeconds: savedElapsedSeconds }) => {
          setStepTimerSession(current =>
            current &&
            current.identityKey === currentIdentityKey &&
            current.roleKey === isTeacher &&
            current.moduleId === activeModule.id &&
            current.stepIndex === stepIndex
              ? {
                  ...current,
                  elapsedSeconds: savedElapsedSeconds,
                  completedAt: new Date(),
                }
              : current
          );
          await catalogQuery.refetch();
          if (stepIndex < activeModule.steps.length - 1) {
            setStepIndex(completed);
            notify("Etapa concluída. Atualizando sua missão e seu nível.");
          } else {
            setCompletionCelebration({
              title: activeModule.title,
              code: activeModule.code,
            });
            notify("Módulo concluído. Progresso salvo.");
          }
        },
        onError: async error => {
          await catalogQuery.refetch();
          notify(
            serverMessage(
              error,
              "Não foi possível salvar o progresso. A tela permanece com os dados confirmados pelo servidor."
            )
          );
        },
      }
    );
  };
  const deleteModule = (module: DidacticModule) => {
    if (modules.length <= 1) {
      notify("Mantenha pelo menos um módulo no catálogo.");
      return;
    }
    if (
      !window.confirm(
        `Excluir o módulo "${module.title}"? Esta ação remove suas etapas, recursos, progresso dos alunos e o histórico de tempo registrado neste módulo.`
      )
    )
      return;
    deleteModuleMutation.mutate(
      { moduleId: module.id },
      {
        onSuccess: async () => {
          const result = await catalogQuery.refetch();
          setModules(
            result.data
              ? normalizeRemoteModules(result.data as CatalogData)
              : []
          );
          setSelectedModuleId(result.data?.modules[0]?.id ?? "");
          setEditing(null);
          setView("library");
          notify("Módulo excluído do catálogo.");
        },
        onError: error =>
          notify(
            serverMessage(
              error,
              "Não foi possível excluir o módulo. A tela permanece com os dados confirmados pelo servidor."
            )
          ),
      }
    );
  };
  if (isTeacher && view === "editor" && editing)
    return (
      <Editor
        module={editing}
        onChange={setEditing}
        onClose={() => setView("library")}
        onDelete={() => deleteModule(editing)}
        canDelete={modules.some(module => module.id === editing.id)}
        saving={saveModuleMutation.isPending}
        onSave={() => {
          const originalModule = modules.find(
            module => module.id === editing.id
          );
          const changedFromStepIndex = originalModule
            ? getFirstChangedStepIndex(
                originalModule.steps.map(step => step.id),
                editing.steps.map(step => step.id)
              )
            : null;
          if (
            changedFromStepIndex !== null &&
            !window.confirm(
              `A estrutura das etapas mudou a partir da etapa ${changedFromStepIndex + 1}. O progresso e os tempos desta etapa e das seguintes serão removidos para todos os alunos; as etapas anteriores serão mantidas. Deseja continuar?`
            )
          )
            return;
          const payload = {
            ...editing,
            kind: editing.kind.trim(),
            confirmStepStructureReset: changedFromStepIndex !== null,
            published: Boolean(editing.published),
            coverImage: editing.coverImage ?? null,
            steps: editing.steps.map(step => ({
              id: step.id,
              title: step.title,
              description: step.description,
              tip: step.tip,
              image: step.image ?? null,
              attachments: step.attachments ?? [],
            })),
            resources: editing.resources.map(
              ({ icon: _icon, ...resource }) => ({
                ...resource,
                attachments: resource.attachments ?? [],
              })
            ),
          };
          saveModuleMutation.mutate(payload, {
            onSuccess: async () => {
              const result = await catalogQuery.refetch();
              setModules(
                result.data
                  ? normalizeRemoteModules(result.data as CatalogData)
                  : []
              );
              setView("library");
              notify(
                changedFromStepIndex !== null
                  ? `Módulo salvo. Progresso e timers a partir da etapa ${changedFromStepIndex + 1} foram redefinidos.`
                  : "Módulo salvo no banco de dados."
              );
            },
            onError: error =>
              notify(
                serverMessage(
                  error,
                  "Não foi possível salvar o módulo. A edição continua aberta para revisão."
                )
              ),
          });
        }}
      />
    );
  return (
    <div className="clean-app">
      <AppSidebar
        view={view}
        isTeacher={isTeacher}
        isAdmin={isAdmin}
        open={menu}
        onClose={() => setMenu(false)}
        onNavigate={target => {
          if (target === "editor") setEditing(activeModule);
          setView(target);
          setMenu(false);
        }}
        lowStock={inventorySummaryQuery.data?.totals.lowStock ?? 0}
        catalog={{
          total: modules.length,
          published: modules.filter(m => m.published).length,
          averageProgress: overallStepProgress(modules).percent,
        }}
        user={{
          name: currentUser.name ?? ROLE_LABELS[currentUser.role],
          role: ROLE_LABELS[currentUser.role],
          initials: initialsOf(currentUser.name, isTeacher ? "DO" : "AL"),
          avatarUrl: profileAvatarUrl,
        }}
        onLogout={() => {
          void onLogout().catch(() =>
            notify("Não foi possível encerrar a sessão. Tente novamente.")
          );
        }}
        loggingOut={loggingOut}
      />
      <div className="clean-main">
        <header className="clean-header">
          <div className="header-left">
            <button
              type="button"
              className="mobile-menu"
              aria-label="Abrir menu"
              aria-expanded={menu}
              aria-controls="primary-navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={18} />
            </button>
            <div className="reference-brand">
              <BrandLogo size="sm" withMark mark="official" />
            </div>
            {isTeacher && (
              <nav className="reference-nav" aria-label="Atalhos docentes">
                {canSeeModules && (
                  <button
                    className={view === "library" ? "active" : ""}
                    aria-current={view === "library" ? "page" : undefined}
                    onClick={() => setView("library")}
                  >
                    MÓDULOS
                  </button>
                )}
                <button
                  className={view === "inventory" ? "active" : ""}
                  aria-current={view === "inventory" ? "page" : undefined}
                  onClick={() => setView("inventory")}
                >
                  ESTOQUE
                </button>
                {isAdmin && (
                  <button
                    className={view === "oversight" ? "active" : ""}
                    aria-current={view === "oversight" ? "page" : undefined}
                    onClick={() => setView("oversight")}
                  >
                    SUPERVISÃO
                  </button>
                )}
              </nav>
            )}
          </div>
          <div className="header-right cl-header-actions">
            <NotificationCenter
              items={notifications}
              storageKey={`controllab-notifications-read-${currentUser.id}`}
              onOpen={openNotification}
            />
            <button
              type="button"
              className="cl-header-icon"
              aria-label={
                theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"
              }
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              onClick={() => toggleTheme?.()}
            >
              <ThemeSunMoon dark={theme === "dark"} size={20} />
            </button>
          </div>
        </header>
        <Suspense
          fallback={
            <main className="clean-content">
              <GearLoader label="Abrindo…" />
            </main>
          }
        >
        {view === "dashboard" ? (
          isAdmin ? (
            <AdminHome
              adminName={currentUser.name ?? "Administração"}
              inventorySummary={inventorySummaryQuery.data ?? null}
              calendar={
                <ScheduleManager
                  modules={modules}
                  activities={scheduleActivities}
                  onChange={saveSchedule}
                  onNotify={notify}
                  saving={saveScheduleMutation.isPending}
                  readOnly
                />
              }
              onOpenNotes={() => setView("notes")}
              onOpenInventory={() => setView("inventory")}
              onOpenOversight={() => setView("oversight")}
              onOpenClassrooms={() => setView("classrooms")}
              onOpenUsers={() => setView("users")}
            />
          ) : isTeacher ? (
            <TeacherDashboard
              modules={modules}
              onOpen={openModule}
              onEdit={module => {
                setEditing(module);
                setView("editor");
              }}
              onNew={() => {
                setEditing(createDraftModule(modules));
                setView("editor");
              }}
              onNotify={notify}
              onOpenNotes={() => setView("notes")}
              onPreviewAsStudent={() => setView("library")}
              showModules={canSeeModules}
              onOpenInventory={() => setView("inventory")}
              inventorySummary={inventorySummaryQuery.data ?? null}
              inventoryLoading={inventorySummaryQuery.isLoading}
              inventoryError={inventorySummaryQuery.isError}
              activities={scheduleActivities}
              onScheduleChange={saveSchedule}
              scheduleSaving={saveScheduleMutation.isPending}
              badgeStudents={teacherBadgesQuery.data?.students ?? []}
              supervision={teacherBadgesQuery.data?.supervision ?? []}
              teacherName={currentUser.name ?? "Docente"}
              dataLoading={teacherBadgesQuery.isLoading}
              dataError={teacherBadgesQuery.isError}
              onRetryData={() => void teacherBadgesQuery.refetch()}
              assignedBadges={teacherBadgesQuery.data?.badges ?? []}
              badgeLoading={teacherBadgesQuery.isLoading}
              badgeError={teacherBadgesQuery.isError}
              onRetryBadges={() => void teacherBadgesQuery.refetch()}
              badgeSaving={
                assignBadgeMutation.isPending || removeBadgeMutation.isPending
              }
              onAssignBadge={input =>
                assignBadgeMutation.mutate(input, {
                  onSuccess: () => {
                    void teacherBadgesQuery.refetch();
                    notify("Badge atribuída ao aluno.");
                  },
                  onError: () =>
                    notify(
                      "Não foi possível atribuir a badge. Verifique se a conta docente está ativa."
                    ),
                })
              }
              onRemoveBadge={badgeId =>
                removeBadgeMutation.mutate(
                  { badgeId },
                  {
                    onSuccess: () => {
                      void teacherBadgesQuery.refetch();
                      notify("Badge removida do aluno.");
                    },
                    onError: () => notify("Não foi possível remover a badge."),
                  }
                )
              }
            />
          ) : (
            <StudentDashboard
              modules={modules}
              badges={myBadgesQuery.data ?? []}
              onOpen={openModule}
              onNotify={notify}
              onOpenNotes={() => setView("notes")}
              onOpenLibrary={() => setView("library")}
              activities={scheduleActivities}
              catalog={
                catalogViewerMatches
                  ? (catalogQuery.data as CatalogData)
                  : undefined
              }
              studentName={currentUser.name ?? undefined}
              avatarUrl={profileAvatarUrl}
              onAvatarChange={(dataUrl, mimeType) => {
                setLocalAvatarUrl(dataUrl);
                avatarMutation.mutate(
                  {
                    dataUrl,
                    mimeType: mimeType as
                      | "image/jpeg"
                      | "image/png"
                      | "image/webp",
                  },
                  {
                    onSuccess: async () => {
                      const result = await authQuery.refetch();
                      if (result.data?.avatarUrl) setLocalAvatarUrl(null);
                      void utils.auth.me.invalidate();
                      notify("Foto de perfil salva.");
                    },
                    onError: () =>
                      notify(
                        "A foto aparece nesta prévia, mas não foi salva no servidor."
                      ),
                  }
                );
              }}
              period={statsPeriod}
              onPeriodChange={setStatsPeriod}
            />
          )
        ) : view === "library" ? (
          <main className="clean-content library-content">
            <div className="library-hero">
              <span className="library-hero-pulse" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <div>
                <div className="breadcrumb">
                  CONTROL LAB <span>/</span> MÓDULOS
                </div>
                <h1>
                  Módulos de
                  <br />
                  <em>ferramentaria.</em>
                </h1>
                <p>
                  Aulas organizadas por ferramenta, montagem e processo, com
                  etapas, objetivos e recursos de apoio.
                </p>
              </div>
              <div className="library-stat">
                <BookOpen size={25} />
                <b>{modules.length}</b>
                <span>
                  {modules.length === 1
                    ? "módulo no catálogo"
                    : "módulos no catálogo"}
                </span>
              </div>
            </div>
            <div className="library-toolbar">
              <div
                className="library-tabs"
                role="group"
                aria-label="Filtrar módulos por tipo"
              >
                {moduleKindOptions.map(kind => (
                  <button
                    type="button"
                    className={kindFilter === kind ? "selected" : ""}
                    aria-pressed={kindFilter === kind}
                    disabled={
                      moduleKindCounts[kind] === 0 && kindFilter !== kind
                    }
                    aria-label={`${kind}: ${moduleKindCounts[kind]} ${moduleKindCounts[kind] === 1 ? "módulo" : "módulos"}`}
                    key={kind}
                    onClick={() => setKindFilter(kind)}
                  >
                    <span>{kind}</span>
                    <span className="library-tab-count" aria-hidden="true">
                      {moduleKindCounts[kind]}
                    </span>
                  </button>
                ))}
              </div>
              <label className="search-box">
                <Search size={16} />
                <input
                  aria-label="Buscar módulo"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar módulo"
                />
                {search && (
                  <button
                    type="button"
                    className="clear-search"
                    aria-label="Limpar busca"
                    onClick={() => setSearch("")}
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
              {isTeacher && (
                <button
                  className="new-module-button"
                  onClick={() => {
                    setEditing(createDraftModule(modules));
                    setView("editor");
                  }}
                >
                  <Plus size={15} /> Novo módulo
                </button>
              )}
            </div>
            <div className="library-results-bar">
              <span role="status" aria-live="polite">
                {moduleResultText}
              </span>
              {hasLibraryFilters && visibleModules.length > 0 && (
                <button
                  type="button"
                  className="library-clear-filters"
                  onClick={clearLibraryFilters}
                >
                  Limpar filtros <X size={13} />
                </button>
              )}
            </div>
            {visibleModules.length > 0 ? (
              <div className="module-grid">
                {visibleModules.map(module => (
                  <ModuleCard
                    key={module.id}
                    module={module}
                    canEdit={isTeacher}
                    onOpen={() => openModule(module)}
                    onEdit={() => {
                      setEditing(module);
                      setView("editor");
                    }}
                    onDelete={() => deleteModule(module)}
                  />
                ))}
              </div>
            ) : (
              <section
                className="module-empty-state"
                role="status"
                aria-live="polite"
              >
                <div className="module-empty-icon" aria-hidden="true">
                  <Search size={20} />
                </div>
                <h2>
                  {modules.length === 0
                    ? "Nenhum módulo no catálogo"
                    : "Nenhum módulo encontrado"}
                </h2>
                <p>{moduleEmptyDescription}</p>
                {hasLibraryFilters && (
                  <button
                    type="button"
                    className="library-empty-reset"
                    onClick={clearLibraryFilters}
                  >
                    Limpar busca e filtros
                  </button>
                )}
              </section>
            )}
          </main>
        ) : view === "inventory" ? (
          isTeacher ? (
            <InventoryPage
              onNotify={notify}
              onOpenModule={moduleId => {
                if (!canSeeModules)
                  return notify(
                    "Os módulos ficam disponíveis apenas para docentes e alunos."
                  );
                const target = modules.find(module => module.id === moduleId);
                if (target) openModule(target);
              }}
            />
          ) : (
            <AccessDenied onBack={() => setView("dashboard")} />
          )
        ) : view === "users" ||
          view === "classrooms" ||
          view === "oversight" ? (
          isAdmin ? (
            view === "users" ? (
              <AdminUsersPage
                currentUserId={currentUser.id}
                onNotify={notify}
              />
            ) : view === "classrooms" ? (
              <AdminClassroomsPage onNotify={notify} />
            ) : (
              <AdminOversightPage />
            )
          ) : (
            <AccessDenied
              title="Acesso restrito à administração"
              description="A gestão de logins e acessos é exclusiva da administração do sistema."
              onBack={() => setView("dashboard")}
            />
          )
        ) : view === "not-found" ? (
          <main className="clean-content access-denied" role="alert">
            <div className="access-denied-card">
              <span className="eyebrow">ERRO 404</span>
              <h1>Página não encontrada</h1>
              <p>O endereço acessado não existe no Control Lab.</p>
              <button
                type="button"
                className="fl-button fl-button-primary"
                onClick={() => setView("dashboard")}
              >
                <ArrowLeft size={15} aria-hidden="true" /> Voltar ao início
              </button>
            </div>
          </main>
        ) : view === "notes" ? (
          <NotesPage
            key={noteStorageKey}
            onBack={() => setView("dashboard")}
            onNotify={notify}
            teacherMode={isTeacher}
            students={teacherBadgesQuery.data?.students}
            activities={scheduleActivities}
            legacyStorageKey={noteStorageKey}
          />
        ) : modules.length === 0 ? (
          <main className="clean-content module-empty-state" role="status">
            <h1>Nenhum módulo disponível</h1>
            <p>
              Ainda não há conteúdos publicados no catálogo para abrir no
              leitor.
            </p>
            <button
              type="button"
              className="library-empty-reset"
              onClick={() => setView("library")}
            >
              Ir para a biblioteca
            </button>
          </main>
        ) : (
          <main className="clean-content reader-content rd">
            <ReaderKeyboard
              onPrevious={
                stepIndex > 0 ? () => setStepIndex(stepIndex - 1) : undefined
              }
              onNext={canGoNext ? () => setStepIndex(stepIndex + 1) : undefined}
            />
            <button
              type="button"
              className="back-library"
              onClick={() => setView("library")}
            >
              <ArrowLeft size={14} aria-hidden="true" /> Voltar para módulos
            </button>
            <header className="rd-header">
              <div className="reader-title">
                <div>
                  <div className="breadcrumb">
                    {activeModule.code} <span>/</span>{" "}
                    {activeModule.kind.toUpperCase()}
                  </div>
                  <h1>{activeModule.title}</h1>
                  <p>{activeModule.description}</p>
                </div>
                {isTeacher && (
                  <button
                    type="button"
                    className="edit-module-button"
                    onClick={() => {
                      setEditing(activeModule);
                      setView("editor");
                    }}
                  >
                    <Edit3 size={14} aria-hidden="true" /> Editar conteúdo
                  </button>
                )}
              </div>
              <div className="reader-overview">
                <div className="reader-objective">
                  <span className="eyebrow">
                    <Target size={13} aria-hidden="true" /> OBJETIVO DO MÓDULO
                  </span>
                  <p>{activeModule.objective}</p>
                </div>
                <div className="reader-progress-summary">
                  <div className="reader-progress-heading">
                    <span className="eyebrow">PROGRESSO</span>
                  </div>
                  <CaliperGauge
                    value={moduleProgressReading}
                    label="Progresso salvo do módulo"
                    caption={`${completedStepCount} de ${activeModule.steps.length} ${
                      activeModule.steps.length === 1
                        ? "etapa concluída"
                        : "etapas concluídas"
                    }`}
                  />
                </div>
              </div>
            </header>
            <div className="content-grid reader-content-grid">
              <ReaderTimeline
                moduleId={activeModule.id}
                steps={activeModule.steps}
                activeIndex={stepIndex}
                canVisitThrough={completedStepCount}
                teacherMode={isTeacher}
                isRunning={stepTimerIsRunning}
                isCompleted={index =>
                  isStepCompleted(index, completedStepCount) ||
                  (index === stepIndex && selectedStepIsCompleted)
                }
                onSelect={index => setStepIndex(index)}
              />
              <section className="main-analysis">
                <div className="section-heading reader-carousel-heading">
                  <div>
                    <span className="eyebrow">
                      {activeModule.steps.length
                        ? `ETAPA ${String(stepIndex + 1).padStart(2, "0")} DE ${String(activeModule.steps.length).padStart(2, "0")}`
                        : "SEM ETAPAS"}
                    </span>
                    <h2>{activeStep?.title || "Conteúdo em preparação"}</h2>
                  </div>
                </div>
                <div className="reader-instruction">
                  <p>
                    {activeStep?.description ||
                      "Este módulo ainda não tem etapas. Abra o editor docente para começar a escrever o conteúdo."}
                  </p>
                </div>
                {(activeStep?.tip || isTeacher) && (
                  <aside className="rd-tip" aria-label="Dica do instrutor">
                    <b className="rd-tip-icon" aria-hidden="true">
                      <Lightbulb size={16} />
                    </b>
                    <div>
                      <span className="eyebrow">DICA DO INSTRUTOR</span>
                      <p>
                        {activeStep?.tip ||
                          "Inclua uma dica prática para orientar o aluno."}
                      </p>
                    </div>
                  </aside>
                )}
                {(activeStep?.image || isTeacher) && (
                  <figure
                    key={activeStep?.id || stepIndex}
                    className={`reader-image-panel ${activeStep?.image ? "has-image" : "is-empty"}`}
                  >
                    {activeStep?.image ? (
                      <>
                        <figcaption className="reader-image-caption">
                          IMAGEM DE REFERÊNCIA
                        </figcaption>
                        <img
                          className="reader-static-image"
                          src={activeStep.image}
                          alt={`Imagem de apoio para ${activeStep?.title || "a etapa"}`}
                          loading="lazy"
                        />
                      </>
                    ) : (
                      <div
                        className="reader-image-empty"
                        role="status"
                        aria-live="polite"
                      >
                        <ImagePlus size={24} aria-hidden="true" />
                        <strong>Imagem da etapa ainda não adicionada</strong>
                        <span>
                          {!activeStep
                            ? "Esta etapa será configurada pelo docente."
                            : isTeacher
                              ? "Use Editar conteúdo para adicionar uma imagem a esta etapa."
                              : "O docente ainda não disponibilizou uma imagem para esta etapa."}
                        </span>
                      </div>
                    )}
                  </figure>
                )}
                <AttachmentList
                  key={`att-${activeStep?.id || stepIndex}`}
                  title="Arquivos da etapa"
                  attachments={activeStep?.attachments ?? []}
                />
                <div
                  className="reader-carousel-controls"
                  role="group"
                  aria-label="Navegação do passo a passo"
                >
                  <button
                    type="button"
                    className="reader-carousel-previous"
                    disabled={stepIndex === 0}
                    onClick={() =>
                      setStepIndex(current => Math.max(0, current - 1))
                    }
                  >
                    <ArrowLeft size={15} aria-hidden="true" />
                    <span>Anterior</span>
                  </button>
                  {!isTeacher ? (
                    <div
                      className={`step-timer-widget ${stepTimerIsRunning ? "is-running" : selectedStepIsCompleted ? "is-complete" : "is-pending"}`}
                      role="group"
                      aria-label={`Timer da etapa ${stepIndex + 1}`}
                    >
                      <StepTimerReadout
                        session={activeStepTimerSession}
                        timerKey={`${activeModule.id}:${stepIndex}`}
                        running={stepTimerIsRunning}
                        completed={selectedStepIsCompleted}
                        label={
                          <span className="step-timer-label">
                            <strong>TEMPO DESTA ETAPA</strong>
                            <small>
                              {selectedStepIsCompleted
                                ? "Concluída"
                                : stepTimerIsRunning
                                  ? "Em andamento"
                                  : startStepMutation.isPending
                                    ? "Iniciando…"
                                    : "Pronta para iniciar"}
                            </small>
                          </span>
                        }
                      />
                    </div>
                  ) : (
                    <span className="reader-carousel-position" role="status">
                      {activeModule.steps.length
                        ? `Etapa ${stepIndex + 1} de ${activeModule.steps.length}`
                        : "Sem etapas"}
                    </span>
                  )}
                  {isTeacher ? (
                    <span className="reader-teacher-preview-note" role="status">
                      Pré-visualização docente · progresso não é alterado
                    </span>
                  ) : selectedStepIsCompleted && canGoNext ? (
                    <button
                      type="button"
                      className="continue-button reader-action-button is-next"
                      onClick={() => setStepIndex(stepIndex + 1)}
                    >
                      <span>Próxima etapa</span>
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  ) : selectedStepIsCompleted ? (
                    <button
                      type="button"
                      className="continue-button reader-action-button is-complete"
                      disabled
                    >
                      {completedStepCount >= activeModule.steps.length
                        ? "Módulo concluído"
                        : "Etapa concluída"}{" "}
                      <Check size={15} aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`continue-button reader-action-button ${stepTimerIsRunning ? "is-running" : "is-ready"}`}
                      aria-busy={
                        startStepMutation.isPending ||
                        progressMutation.isPending
                      }
                      onClick={
                        stepTimerIsRunning ? completeStep : startCurrentStep
                      }
                      disabled={
                        !activeModule.steps.length ||
                        !activeModule.id ||
                        stepIndex >= activeModule.steps.length ||
                        selectedStepIsCompleted ||
                        progressMutation.isPending ||
                        startStepMutation.isPending
                      }
                    >
                      {startStepMutation.isPending ||
                      progressMutation.isPending ? (
                        <>
                          <LoaderCircle
                            className="reader-action-spinner"
                            size={15}
                            aria-hidden="true"
                          />
                          <span>
                            {startStepMutation.isPending
                              ? "Iniciando etapa…"
                              : "Salvando conclusão…"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>
                            {stepTimerIsRunning
                              ? stepIndex < activeModule.steps.length - 1
                                ? "Concluir etapa"
                                : "Concluir módulo"
                              : "Iniciar etapa"}
                          </span>
                          <ArrowRight size={15} aria-hidden="true" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </section>
            </div>
            <section
              className="resource-panel rd-resources"
              aria-label="Recursos do módulo"
            >
              <div className="panel-heading">
                <div>
                  <h2>Recursos do módulo</h2>
                  <p>Materiais, máquinas e ferramentas deste conteúdo.</p>
                </div>
              </div>
              <div
                className="category-tabs"
                role="group"
                aria-label="Filtrar recursos por categoria"
              >
                {resourceCategoryOptions.map(item => {
                  const count = resourceCategoryCounts[item.id];
                  return (
                    <button
                      type="button"
                      className={category === item.id ? "selected" : ""}
                      key={item.id}
                      aria-pressed={category === item.id}
                      aria-label={`${item.label}: ${count} ${count === 1 ? "recurso" : "recursos"}`}
                      onClick={() => setCategory(item.id)}
                    >
                      <span>{item.label}</span>
                      <span className="category-tab-count" aria-hidden="true">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="resource-list">
                {filteredResources.map(resource => {
                  const Icon = resource.icon;
                  return (
                    <article
                      key={resource.id}
                      className="clean-card resource-card-light"
                    >
                      <div className="resource-card-head">
                        <div className="resource-icon">
                          <Icon size={15} aria-hidden="true" />
                        </div>
                        <div className="resource-copy">
                          <span className="eyebrow">{resource.label}</span>
                          <strong>{resource.title}</strong>
                          <small>{resource.detail}</small>
                        </div>
                      </div>
                      {isTeacher && resource.inventory && (
                        <div
                          className={`resource-stock-line health-${resource.inventory.health}`}
                          title={`Código ${resource.inventory.code} · ${resource.inventory.location}`}
                        >
                          <Warehouse size={13} aria-hidden="true" />
                          <span>
                            {resource.inventory.archived
                              ? "Item arquivado no estoque"
                              : `${resource.inventory.available} ${resource.inventory.unit} disponíveis`}
                          </span>
                          <b>
                            {STOCK_HEALTH_LABELS[resource.inventory.health]}
                          </b>
                        </div>
                      )}
                      <AttachmentList
                        title="Arquivos"
                        attachments={resource.attachments ?? []}
                      />
                      <div className="resource-card-foot">
                        <span className="resource-stage-badge">
                          {resource.status}
                        </span>
                        {resource.modelUrl && (
                          <a
                            className="resource-model-link"
                            href={resource.modelUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Abrir referência técnica de ${resource.title} (abre em nova aba)`}
                          >
                            Abrir referência{" "}
                            <ExternalLink size={12} aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
                {filteredResources.length === 0 && (
                  <div
                    className="empty-resources"
                    role="status"
                    aria-live="polite"
                  >
                    <Box size={19} aria-hidden="true" />
                    <div>
                      <strong>
                        {category === "all"
                          ? "Nenhum recurso vinculado"
                          : "Nenhum recurso nesta categoria"}
                      </strong>
                      <span>
                        {category === "all"
                          ? "Este módulo ainda não tem recursos adicionados."
                          : "Tente outra categoria ou veja todos os recursos deste módulo."}
                      </span>
                    </div>
                    {category !== "all" && (
                      <button type="button" onClick={() => setCategory("all")}>
                        Ver todos os recursos <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          </main>
        )}
        </Suspense>
        <AnimatePresence>
          {completionCelebration && (
            <motion.div
              className="completion-overlay"
              role="status"
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCompletionCelebration(null)}
            >
              <motion.div
                className="completion-island"
                initial={{ opacity: 0, y: 18, scale: 0.82 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.94 }}
                transition={{ type: "spring", stiffness: 360, damping: 24 }}
                onClick={event => event.stopPropagation()}
              >
                <StampMark />
                <span className="eyebrow">{completionCelebration.code}</span>
                <h2>Módulo concluído</h2>
                <p>{completionCelebration.title}</p>
                <div className="completion-progress">
                  <span />
                </div>
                <small>Progresso salvo no banco de dados.</small>
                <button
                  type="button"
                  onClick={() => setCompletionCelebration(null)}
                >
                  Continuar estudando <ArrowRight size={14} />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {toast && (
          <div className="clean-toast">
            <span />
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
