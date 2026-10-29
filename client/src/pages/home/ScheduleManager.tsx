import { useRef, useState } from "react";
import {
  CLASS_PERIOD_MS,
  addCalendarDays,
  classSchedule,
  createPeriodDate,
  getClassPeriod,
  isSchoolDate,
  localDateKey,
  nextSchoolDateKey,
  scheduleDateKey,
} from "@shared/class-schedule";
import {
  Clock,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import {
  type ScheduleActivity,
  type ActivityType,
  ACTIVITY_TYPE_LABEL,
  activityPeriod,
  activityTimeRange,
  cleanActivitySubtitle,
  type DidacticModule,
  newContentId,
} from "./shared";

export function ScheduleManager({
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
