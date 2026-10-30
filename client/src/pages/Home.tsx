import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { getElapsedStudySeconds, getFirstChangedStepIndex, isStepCompleted, MIN_STEP_SECONDS } from "@shared/progress";
import ThemeSunMoon from "@/components/forge/ThemeSunMoon";
import BrandLogo from "@/components/forge/BrandLogo";
import NotesPage from "@/components/notes/NotesPage";
import AppSidebar from "@/components/forge/AppSidebar";
import NotificationCenter, { type AppNotification } from "@/components/forge/NotificationCenter";
import { ArrowLeft, Menu } from "lucide-react";
import {
  type ScheduleActivity,
  type DidacticModule,
  emptyModule,
  createDraftModule,
  serverMessage,
  overallStepProgress,
  type CatalogData,
  normalizeRemoteModules,
  type HomeView,
  VIEW_PATHS,
  MODULE_VIEWS,
  viewFromPath,
  initialsOf,
} from "./home/shared";
import {
  buildNotifications,
  completedStepCountOf,
  firstPublishIssue,
  firstQuizIssue,
  type KindFilter,
  latestOpenStepSession,
  maxVisitableStepIndex,
  resumeStepIndex,
  toSaveModulePayload,
  toScheduleEntries,
} from "./home/logic";
import { Editor } from "./home/Editor";
import { StudentDashboard } from "./home/StudentDashboard";
import { ScheduleManager } from "./home/ScheduleManager";
import { TeacherDashboard } from "./home/TeacherDashboard";
import { LibraryView } from "./home/LibraryView";
import { ReaderView } from "./home/ReaderView";
import { CompletionOverlay, type CompletionCelebration } from "./home/CompletionOverlay";
import { useToast } from "./home/useToast";

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
  const noteStorageKey = `student-notes:user:${currentUser.id}`;
  const myBadgesQuery = trpc.badges.mine.useQuery(
    { identityKey: currentUser.id },
    { enabled: !isTeacher }
  );
  const teacherBadgesQuery = trpc.badges.adminData.useQuery(
    { identityKey: currentUser.id },
    { enabled: isTeacher }
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
  const [search, setSearch] = useState("");
  const { toast, notify } = useToast();
  // Acerto do quiz confirmado nesta tela ("módulo:etapa"), antes de o catálogo recarregar.
  const [quizPassedKey, setQuizPassedKey] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>("Todos");
  const [completionCelebration, setCompletionCelebration] =
    useState<CompletionCelebration | null>(null);
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
    setScheduleActivities(next);
    saveScheduleMutation.mutate(toScheduleEntries(next), {
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
      setSelectedModuleId(modules[0].id);
      setStepIndex(resumeStepIndex(modules[0]));
      return;
    }
    const maxIndex = maxVisitableStepIndex(current, isTeacher);
    if (stepIndex > maxIndex) setStepIndex(maxIndex);
  }, [modules, selectedModuleId, stepIndex, isTeacher]);
  useEffect(() => {
    if (isTeacher || !catalogViewerMatches || !catalogQuery.data) return;
    if (restoredActiveSessionKeyRef.current === activeSessionRestoreKey) return;
    // Só retoma automaticamente o leitor ao abrir o início ou o próprio leitor.
    if (view !== "dashboard" && view !== "reader") return;
    restoredActiveSessionKeyRef.current = activeSessionRestoreKey;
    const latestOpenSession = latestOpenStepSession(catalogQuery.data.modules);
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
  const notifications = useMemo(
    () =>
      buildNotifications({
        now: Date.now(),
        isStaff: isTeacher,
        canSeeModules,
        modules,
        activities: scheduleActivities,
        inventorySummary: inventorySummaryQuery.data,
      }),
    [
      inventorySummaryQuery.data,
      isTeacher,
      canSeeModules,
      modules,
      scheduleActivities,
    ]
  );
  const activeModule =
    modules.find(item => item.id === selectedModuleId) ||
    modules[0] ||
    emptyModule;
  const openModule = (module: DidacticModule) => {
    setSelectedModuleId(module.id);
    setStepIndex(resumeStepIndex(module));
    setView("reader");
  };
  const openEditor = (module: DidacticModule) => {
    setEditing(module);
    setView("editor");
  };
  const openNotification = (item: AppNotification) => {
    const module = item.target.moduleId
      ? modules.find(entry => entry.id === item.target.moduleId)
      : undefined;
    if (item.target.view === "reader" && module) openModule(module);
    else if (item.target.view === "editor") openEditor(module ?? activeModule);
    else setView(item.target.view);
  };
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
  const activeStep = activeModule.steps[stepIndex] || activeModule.steps[0];
  const completedStepCount = completedStepCountOf(activeModule);
  // Sessão do timer: a recém-iniciada nesta tela vale mais que a salva no catálogo.
  const localStepTimerSession =
    stepTimerSession?.identityKey === currentIdentityKey &&
    stepTimerSession?.roleKey === isTeacher &&
    stepTimerSession?.moduleId === activeModule.id &&
    stepTimerSession.stepIndex === stepIndex
      ? stepTimerSession
      : null;
  const savedStepSession = (catalogQuery.data as CatalogData | undefined)?.modules
    .find(module => module.id === activeModule.id)
    ?.stepSessions?.find(session => session.stepIndex === stepIndex);
  const savedStepTimerSession = savedStepSession
    ? {
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
    const elapsedSeconds = getElapsedStudySeconds(
      activeStepTimerSession.startedAt.getTime(),
      Date.now()
    );
    if (elapsedSeconds < MIN_STEP_SECONDS) {
      notify(
        `Leia a etapa com atenção: a conclusão libera em ${MIN_STEP_SECONDS - elapsedSeconds} s.`
      );
      return;
    }
    const completed = Math.min(activeModule.steps.length, stepIndex + 1);
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
  /** Recarrega o catálogo depois de salvar ou excluir, sem esperar o próximo refetch automático. */
  const reloadModules = async () => {
    const result = await catalogQuery.refetch();
    setModules(
      result.data ? normalizeRemoteModules(result.data as CatalogData) : []
    );
    return result.data;
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
          const data = await reloadModules();
          setSelectedModuleId(data?.modules[0]?.id ?? "");
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
  const saveEditingModule = (module: DidacticModule) => {
    const issue = firstPublishIssue(module) ?? firstQuizIssue(module.steps);
    if (issue) {
      notify(issue);
      return;
    }
    const originalModule = modules.find(entry => entry.id === module.id);
    const changedFromStepIndex = originalModule
      ? getFirstChangedStepIndex(
          originalModule.steps.map(step => step.id),
          module.steps.map(step => step.id)
        )
      : null;
    if (
      changedFromStepIndex !== null &&
      !window.confirm(
        `A estrutura das etapas mudou a partir da etapa ${changedFromStepIndex + 1}. O progresso e os tempos desta etapa e das seguintes serão removidos para todos os alunos; as etapas anteriores serão mantidas. Deseja continuar?`
      )
    )
      return;
    saveModuleMutation.mutate(toSaveModulePayload(module, changedFromStepIndex), {
      onSuccess: async () => {
        await reloadModules();
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
  };
  const toastBanner = toast && (
    <div className="clean-toast" role="status">
      <span />
      {toast}
    </div>
  );
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
          onSave={() => saveEditingModule(editing)}
        />
        {/* O editor ocupa a tela inteira: sem isto, erros de validação e de salvamento ficavam invisíveis. */}
        {toastBanner}
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
              onEdit={openEditor}
              onNew={() => openEditor(createDraftModule(modules))}
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
              catalog={catalogQuery.data as CatalogData}
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
          <LibraryView
            modules={modules}
            canEdit={isTeacher}
            search={search}
            onSearchChange={setSearch}
            kindFilter={kindFilter}
            onKindFilterChange={setKindFilter}
            onOpen={openModule}
            onEdit={openEditor}
            onDelete={deleteModule}
            onNew={() => openEditor(createDraftModule(modules))}
          />
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
          <ReaderView
            module={activeModule}
            stepIndex={stepIndex}
            onStepChange={setStepIndex}
            isTeacher={isTeacher}
            timer={{
              session: activeStepTimerSession,
              running: stepTimerIsRunning,
              completed: selectedStepIsCompleted,
            }}
            quiz={{
              passed: activeStepQuizPassed,
              pending: answerQuizMutation.isPending,
              onAnswer: answerStepQuiz,
            }}
            startPending={startStepMutation.isPending}
            completePending={progressMutation.isPending}
            onStart={startCurrentStep}
            onComplete={completeStep}
            onEdit={() => openEditor(activeModule)}
            onBack={() => setView("library")}
          />
        )}
        </Suspense>
        <CompletionOverlay
          celebration={completionCelebration}
          onClose={() => setCompletionCelebration(null)}
        />
        {toastBanner}
      </div>
    </div>
  );
}
