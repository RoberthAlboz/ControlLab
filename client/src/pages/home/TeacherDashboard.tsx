import QuizInsights, { type QuizStepInsight } from "@/components/QuizInsights";
import {
  lazy,
  Suspense,
  useState,
  type ReactNode,
} from "react";
import { trpc } from "@/lib/trpc";
import type { InventorySummary } from "@/lib/router-types";
import type {
  AssignedStudentBadge,
  BadgeStudent,
  AwardStudentBadgeInput,
  StudentBadge,
} from "@shared/competencies";
import TeacherBadgeManager from "@/components/TeacherBadgeManager";
import {
  ArrowRight,
  Check,
  CircleHelp,
  Clock,
  Edit3,
  CalendarClock,
  FileText,
  Filter,
  Layers3,
  Plus,
  Search,
  Settings2,
  UsersRound,
  Warehouse,
  Wrench,
  X,
} from "lucide-react";
import {
  type ScheduleActivity,
  type Step,
  activityTimeRange,
  type DidacticModule,
  type TeacherStudentSummary,
  formatStepElapsed,
} from "./shared";
import {
  ScheduleManager,
} from "./ScheduleManager";

export const TeacherAnalyticsCharts = lazy(
  () => import("@/components/TeacherAnalyticsCharts")
);

export function TeacherAnalytics({
  students,
  activities,
  focus,
}: {
  students: TeacherStudentSummary[];
  activities: ScheduleActivity[];
  focus: "progress" | "agenda";
}) {
  return (
    <Suspense
      fallback={
        <section className="teacher-analytics-loading" aria-live="polite">
          Carregando gráficos…
        </section>
      }
    >
      <TeacherAnalyticsCharts students={students} activities={activities} focus={focus} />
    </Suspense>
  );
}
export const SUPERVISION_STALLED_DAYS = 7;
export const SUPERVISION_VISIBLE_MODULES = 3;
export type SupervisionState = "not-started" | "stalled" | "in-progress" | "completed";
export type SupervisionFilter = "all" | SupervisionState;
export type SupervisionSort = "priority" | "name" | "progress";
export const SUPERVISION_STATES: Record<
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
export function daysSinceActivity(value: string | Date | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}
export function supervisionState(student: TeacherStudentSummary): SupervisionState {
  if (student.averageProgress === 0) return "not-started";
  if (student.averageProgress >= 100) return "completed";
  const days = daysSinceActivity(student.lastActivityAt);
  return days === null || days >= SUPERVISION_STALLED_DAYS
    ? "stalled"
    : "in-progress";
}
export function TeacherSupervision({
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
                  {student.quiz && student.quiz.answered > 0 && (
                    <small title="Verificações acertadas na primeira tentativa">
                      Quiz: {student.quiz.firstTry}/{student.quiz.answered} de
                      primeira
                    </small>
                  )}
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

type TeacherTab = "hoje" | "turma" | "modulos" | "agenda";

export function TeacherDashboard({
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
  quizSteps = [],
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
  quizSteps?: QuizStepInsight[];
  teacherName: string;
  dataLoading: boolean;
  dataError: boolean;
  onRetryData: () => void;
  onOpenInventory: () => void;
  inventorySummary: InventorySummary | null;
  inventoryLoading: boolean;
  inventoryError: boolean;
}) {
  const [tab, setTab] = useState<TeacherTab>("hoje");
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
  const goTo = (next: TeacherTab) => {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const tabs: Array<[TeacherTab, string, number | null]> = [
    ["hoje", "Hoje", null],
    ["turma", "Turma", supervision.length],
    ...(showModules ? [["modulos", "Módulos", modules.length] as [TeacherTab, string, number]] : []),
    ["agenda", "Agenda", upcomingActivities.length],
  ];

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
            onClick: () => goTo("turma"),
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
            onClick: () => goTo("agenda"),
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
              ? "O que precisa da sua atenção, a turma e as próximas aulas."
              : "Veja o que precisa da sua atenção, acompanhe as turmas, a agenda e o estoque."}
          </p>
        </div>
        <div className="td-hero-actions">
          <button type="button" className="td-btn" onClick={onOpenNotes}>
            <FileText size={15} aria-hidden="true" /> Anotações
          </button>
          {showModules && (
            <button type="button" className="td-btn is-primary" onClick={onNew}>
              <Plus size={15} aria-hidden="true" /> Novo módulo
            </button>
          )}
        </div>
      </header>

      <nav className="td-nav" role="tablist" aria-label="Seções da central docente">
        {tabs.map(([id, label, total]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "is-active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {total != null && <span className="td-nav-count">{total}</span>}
          </button>
        ))}
      </nav>

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

      {tab === "hoje" && (
      <>
      <section className="td-summary" aria-label="Resumo">
        <button
          type="button"
          className="td-stat"
          onClick={() => goTo("turma")}
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
            onClick={() => goTo("modulos")}
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
          onClick={() => goTo("agenda")}
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
      </>
      )}

      {tab === "turma" && (
      <section id="td-turma" className="td-section" aria-label="Turma">
        <TeacherAnalytics students={supervision} activities={activities} focus="progress" />
        <TeacherSupervision
          students={supervision}
          onNotify={onNotify}
          onOpenNotes={onOpenNotes}
        />
        <QuizInsights steps={quizSteps} />
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
      )}

      {showModules && tab === "modulos" && (
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

      {tab === "agenda" && (
      <section id="td-agenda" className="td-section" aria-label="Agenda">
        <TeacherAnalytics students={supervision} activities={activities} focus="agenda" />
        <ScheduleManager
          modules={modules}
          activities={activities}
          onChange={onScheduleChange}
          onNotify={onNotify}
          saving={scheduleSaving}
        />
      </section>
      )}
    </main>
  );
}
