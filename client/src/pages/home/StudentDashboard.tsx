import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { localDateKey, scheduleDateKey } from "@shared/class-schedule";
import type { StudentBadge } from "@shared/competencies";
import NumberTicker from "@/components/forge/NumberTicker";
import StudyProgressRing from "@/components/forge/StudyProgressRing";
import TeacherProfileModal from "@/components/forge/TeacherProfileModal";
import AuthGearTrain from "@/components/forge/AuthGearTrain";
import StudentLoansCard from "@/components/StudentLoansCard";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Target,
  FileText,
  ImagePlus,
  Layers3,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings2,
  Trophy,
  Wrench,
  X,
} from "lucide-react";
import {
  type StudentModuleTab,
  type ScheduleActivity,
  type Step,
  activityPeriod,
  activityTimeRange,
  cleanActivitySubtitle,
  type DidacticModule,
  StudentModuleProgress,
  overallStepProgress,
  formatStudyDuration,
  StudentModuleEmptyState,
  type CatalogData,
  Clock3Icon,
  initialsOf,
} from "./shared";

export function StudentDashboard({
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
                  aria-label={`Ponto forte: ${badge.label}, reconhecido pelo docente`}
                  title={`Reconhecido pelo docente${badge.detail ? `: ${badge.detail}` : ""}`}
                >
                  <div className="sp-badge-icon" aria-hidden="true">
                    <Trophy size={14} />
                  </div>
                  <div>
                    <b>{capitalize(badge.label)}</b>
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

        <StudentLoansCard />

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

/** Primeira letra maiúscula: o docente costuma escrever a habilidade em minúsculas. */
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
