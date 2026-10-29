import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import { STOCK_HEALTH_LABELS } from "@shared/inventory";
import {
  findClassPeriodForDate,
  nearestClassPeriod,
  scheduleClock,
  scheduleDateKey,
} from "@shared/class-schedule";
import { getElapsedStudySeconds, getFirstChangedStepIndex, isStepCompleted, MIN_STEP_SECONDS } from "@shared/progress";
import { quizProblem } from "@shared/quiz";
import { AttachmentList } from "@/components/ModuleAttachments";
import StepQuizPanel from "@/components/StepQuizPanel";
import ReaderTimeline from "@/components/forge/ReaderTimeline";
import CaliperGauge from "@/components/forge/CaliperGauge";
import StampMark from "@/components/forge/StampMark";
import ThemeSunMoon from "@/components/forge/ThemeSunMoon";
import BrandLogo from "@/components/forge/BrandLogo";
import NotesPage from "@/components/notes/NotesPage";
import ReaderKeyboard from "@/components/forge/ReaderKeyboard";
import AppSidebar from "@/components/forge/AppSidebar";
import NotificationCenter, { type AppNotification } from "@/components/forge/NotificationCenter";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Box,
  Check,
  Clock,
  Edit3,
  Target,
  Lightbulb,
  ExternalLink,
  Filter,
  ImagePlus,
  LoaderCircle,
  Menu,
  Plus,
  Save,
  Search,
  Warehouse,
  X,
} from "lucide-react";
import {
  type Category,
  type ModuleKind,
  MODULE_KIND_SUGGESTIONS,
  sameKind,
  type ScheduleActivity,
  type Resource,
  type Step,
  cleanActivitySubtitle,
  type DidacticModule,
  emptyModule,
  createDraftModule,
  serverMessage,
  overallStepProgress,
  type CatalogData,
  normalizeRemoteModules,
  ModuleCard,
  StepTimerReadout,
  type HomeView,
  VIEW_PATHS,
  MODULE_VIEWS,
  viewFromPath,
  initialsOf,
} from "./home/shared";
import {
  Editor,
} from "./home/Editor";
import {
  StudentDashboard,
} from "./home/StudentDashboard";
import {
  ScheduleManager,
} from "./home/ScheduleManager";
import {
  TeacherDashboard,
} from "./home/TeacherDashboard";

// Telas só de docente/administração: o aluno nunca baixa esse código.
const InventoryPage = lazy(() => import("@/pages/Inventory"));
const AdminUsersPage = lazy(() => import("@/pages/AdminUsers"));
const AdminClassroomsPage = lazy(() => import("@/pages/AdminClassrooms"));
const AdminOversightPage = lazy(() => import("@/pages/AdminOversight"));
const AdminHome = lazy(() => import("@/pages/AdminHome"));

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
  const answerQuizMutation = trpc.learning.answerQuiz.useMutation();
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
  // Acerto do quiz confirmado nesta tela ("módulo:etapa"), antes de o catálogo recarregar.
  const [quizPassedKey, setQuizPassedKey] = useState<string | null>(null);
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
  const activeStepQuiz = activeStep?.quiz ?? null;
  const activeStepQuizPassed =
    Boolean(activeStep?.quizPassed) ||
    quizPassedKey === `${activeModule.id}:${stepIndex}`;
  const answerStepQuiz = async (selectedIndex: number) => {
    try {
      const result = await answerQuizMutation.mutateAsync({
        moduleId: activeModule.id,
        stepIndex,
        selectedIndex,
      });
      if (result.correct) {
        setQuizPassedKey(`${activeModule.id}:${stepIndex}`);
        void catalogQuery.refetch();
      }
      return result;
    } catch (error) {
      notify(serverMessage(error, "Não foi possível conferir a resposta. Tente novamente."));
      return null;
    }
  };
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
    const secondsInStep = getElapsedStudySeconds(
      activeStepTimerSession.startedAt.getTime(),
      Date.now()
    );
    if (secondsInStep < MIN_STEP_SECONDS) {
      notify(
        `Leia a etapa com atenção: a conclusão libera em ${MIN_STEP_SECONDS - secondsInStep} s.`
      );
      return;
    }
    if (activeStepQuiz && !activeStepQuizPassed) {
      notify("Responda corretamente à verificação da etapa para concluí-la.");
      document
        .querySelector(".step-quiz")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      <>
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
          const quizIssue = editing.steps
            .map((step, index) => {
              const problem = step.quiz
                ? quizProblem({
                    question: step.quiz.question,
                    options: step.quiz.options,
                    correctIndex: step.quiz.correctIndex ?? -1,
                    explanation: step.quiz.explanation ?? "",
                  })
                : null;
              return problem ? `Etapa ${index + 1}: ${problem}` : null;
            })
            .find(Boolean);
          if (quizIssue) {
            notify(quizIssue);
            return;
          }
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
              quiz: step.quiz
                ? {
                    question: step.quiz.question.trim(),
                    options: step.quiz.options.map(option => option.trim()),
                    correctIndex: step.quiz.correctIndex ?? 0,
                    explanation: (step.quiz.explanation ?? "").trim(),
                  }
                : null,
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
      {/* O editor ocupa a tela inteira: sem isto, erros de validação e de salvamento ficavam invisíveis. */}
      {toast && (
        <div className="clean-toast" role="status">
          <span />
          {toast}
        </div>
      )}
      </>
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
              quizSteps={teacherBadgesQuery.data?.quizSteps ?? []}
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
              {/* Sem filtro, o total já está no banner: a contagem só volta ao filtrar. */}
              <span role="status" aria-live="polite">
                {hasLibraryFilters ? moduleResultText : ""}
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
                {activeStepQuiz && (isTeacher || !isStepCompleted(stepIndex, completedStepCount)) && (
                  <StepQuizPanel
                    key={`quiz-${activeModule.id}-${activeStep?.id || stepIndex}`}
                    quiz={activeStepQuiz}
                    mode={isTeacher ? "teacher" : "student"}
                    passed={activeStepQuizPassed}
                    locked={!stepTimerIsRunning}
                    pending={answerQuizMutation.isPending}
                    onAnswer={answerStepQuiz}
                  />
                )}
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
