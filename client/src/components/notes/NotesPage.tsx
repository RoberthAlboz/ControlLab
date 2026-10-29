import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, CloudOff, FileText, LoaderCircle, Lock, Plus, RotateCcw, Search, Trash2, Users, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import GearLoader from "@/components/forge/GearLoader";
import {
  addCalendarDays,
  classSchedule,
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
  getRecordedPeriodIds,
  makeStudentNote,
  parseStoredNotes,
  removeStudentNote,
  searchStudentNotes,
  updateStudentNote,
  type StudentNote,
} from "@shared/notes";

/**
 * Diário de aula: uma anotação (ou mais) por período de 45 min de cada dia letivo.
 * As anotações ficam no servidor (uma por aluno), então acompanham o aluno em
 * qualquer computador e não ficam expostas no navegador de uma máquina
 * compartilhada do laboratório. A gravação é agrupada para não enviar tudo a
 * cada tecla. Docentes escolhem um aluno e leem o diário dele, sem editar.
 */
type NotesActivity = { id: string; title: string; startsAt: string | Date };

type NotesPageProps = {
  onBack: () => void;
  onNotify: (message: string) => void;
  teacherMode?: boolean;
  activities: NotesActivity[];
  /** Chave antiga do localStorage: as notas que estiverem lá são enviadas uma vez e apagadas. */
  legacyStorageKey: string;
  /** Modo docente: alunos cujo diário pode ser consultado (`undefined` enquanto carrega). */
  students?: Array<{ id: number; name: string | null }>;
};

const SUBJECTS = ["Ferramentaria", "Metrologia", "CNC", "Montagem", "Processos", "Segurança"];
const PROMPTS = ["Procedimento", "Medida", "Dúvida para revisar"];
const SAVE_DELAY_MS = 800;

type SaveState = "saved" | "pending" | "error";

const dateFromKey = (key: string) => new Date(`${key}T12:00:00`);

/** Segunda-feira da semana letiva que contém a data. */
function weekStartKey(key: string) {
  const date = dateFromKey(key);
  const offset = (date.getDay() + 6) % 7;
  return addCalendarDays(key, -offset);
}

/** Aula em andamento agora, pelo relógio local (a grade é 07:45–16:45 em blocos de 45 min). */
function currentLocalPeriodId(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return classSchedule.find(period => {
    const [startHour, startMinute] = period.start.split(":").map(Number);
    const [endHour, endMinute] = period.end.split(":").map(Number);
    return minutes >= startHour * 60 + startMinute && minutes < endHour * 60 + endMinute;
  })?.id;
}

function weekRangeLabel(firstKey: string, lastKey: string) {
  const first = dateFromKey(firstKey);
  const last = dateFromKey(lastKey);
  const month = (date: Date) => date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()} – ${last.getDate()} de ${month(last)}`
    : `${first.getDate()} de ${month(first)} – ${last.getDate()} de ${month(last)}`;
}

function activityPeriodId(activity: NotesActivity) {
  return (findClassPeriodForDate(activity.startsAt) || nearestClassPeriod(scheduleClock(activity.startsAt))).id;
}

/** Notas que versões anteriores gravavam só no navegador. */
function readLegacyNotes(storageKey: string, fallbackDate: string): StudentNote[] {
  try {
    const saved = localStorage.getItem(storageKey);
    return parseStoredNotes(saved ? JSON.parse(saved) : [], fallbackDate);
  } catch {
    return [];
  }
}

function forgetLegacyNotes(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* navegador sem localStorage: nada a limpar */
  }
}

function wordCount(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Envio feito ao sair da página; a próxima abertura espera por ele antes de ler. */
let pendingFlush: Promise<unknown> | null = null;

export default function NotesPage(props: NotesPageProps) {
  return props.teacherMode ? <TeacherNotesPage {...props} /> : <StudentNotesPage {...props} />;
}

/** Docente escolhe um aluno e lê o diário dele; nada é gravado. */
function TeacherNotesPage(props: NotesPageProps) {
  const [chosenId, setChosenId] = useState<number | null>(null);
  const students = props.students;
  const studentId = chosenId ?? students?.[0]?.id ?? null;
  const notesQuery = trpc.notes.ofStudent.useQuery(
    { studentId: studentId ?? 0 },
    { enabled: studentId !== null, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false },
  );

  if (!students || (studentId !== null && notesQuery.isPending)) {
    return (
      <main className="nt-page">
        <GearLoader label="Carregando anotações…" size="lg" />
      </main>
    );
  }
  if (studentId === null || notesQuery.isError || !notesQuery.data) {
    return (
      <main className="nt-page" role="alert">
        <button type="button" className="nt-back" onClick={props.onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> Voltar ao início
        </button>
        <p className="nt-side-empty">
          {studentId === null ? "Nenhum aluno cadastrado ainda." : "Não foi possível carregar as anotações deste aluno."}
        </p>
        {studentId !== null && (
          <button type="button" className="nt-primary" onClick={() => void notesQuery.refetch()}>
            <RotateCcw size={16} aria-hidden="true" /> Tentar novamente
          </button>
        )}
      </main>
    );
  }

  const picker = (
    <label className="nt-student">
      <Users size={16} aria-hidden="true" />
      <select aria-label="Aluno" value={studentId} onChange={event => setChosenId(Number(event.target.value))}>
        {students.map(student => (
          <option key={student.id} value={student.id}>
            {student.name || `Aluno #${student.id}`}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <NotesWorkspace
      key={studentId}
      {...props}
      initialNotes={notesQuery.data.notes ?? []}
      uploadInitial={false}
      studentName={notesQuery.data.student.name || `Aluno #${studentId}`}
      studentPicker={picker}
    />
  );
}

function StudentNotesPage(props: NotesPageProps) {
  const [flushDone, setFlushDone] = useState(!pendingFlush);
  useEffect(() => {
    if (!pendingFlush) return;
    void pendingFlush.finally(() => setFlushDone(true));
  }, []);
  // Sempre lê do servidor ao abrir: nunca edita uma cópia antiga em cache.
  const notesQuery = trpc.notes.mine.useQuery(undefined, { enabled: flushDone, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false });
  const todayKey = localDateKey(new Date());

  if (!flushDone || !notesQuery.isFetchedAfterMount) {
    return (
      <main className="nt-page">
        <GearLoader label="Carregando anotações…" size="lg" />
      </main>
    );
  }
  if (notesQuery.isError || !notesQuery.data) {
    return (
      <main className="nt-page" role="alert">
        <button type="button" className="nt-back" onClick={props.onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> Voltar ao início
        </button>
        <p className="nt-side-empty">Não foi possível carregar suas anotações. Nada foi perdido: elas continuam no servidor.</p>
        <button type="button" className="nt-primary" onClick={() => void notesQuery.refetch()}>
          <RotateCcw size={16} aria-hidden="true" /> Tentar novamente
        </button>
      </main>
    );
  }

  // Nunca salvou no servidor? Traz o que estiver no navegador (versão antiga) e envia.
  const legacy = notesQuery.data.notes === null ? readLegacyNotes(props.legacyStorageKey, todayKey) : [];
  return <NotesWorkspace {...props} initialNotes={notesQuery.data.notes ?? legacy} uploadInitial={legacy.length > 0} />;
}

function NotesWorkspace({
  onBack,
  onNotify,
  teacherMode = false,
  activities,
  legacyStorageKey,
  initialNotes,
  uploadInitial,
  studentName,
  studentPicker,
}: NotesPageProps & { initialNotes: StudentNote[]; uploadInitial: boolean; studentName?: string; studentPicker?: ReactNode }) {
  const todayKey = localDateKey(new Date());
  const schoolToday = isSchoolDate(todayKey) ? todayKey : nextSchoolDateKey(new Date());
  // O docente abre no dia mais recente com registro, se hoje o aluno ainda não anotou nada.
  const initialDate = teacherMode && initialNotes.length && !initialNotes.some(note => note.date === schoolToday)
    ? initialNotes.reduce((latest, note) => (note.date > latest ? note.date : latest), initialNotes[0].date)
    : schoolToday;

  const [notes, setNotes] = useState<StudentNote[]>(initialNotes);
  const [saveState, setSaveState] = useState<SaveState>(uploadInitial ? "pending" : "saved");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedPeriod, setSelectedPeriod] = useState(() =>
    initialDate === todayKey ? (currentLocalPeriodId() ?? 1) : 1,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const periodsRef = useRef<HTMLOListElement>(null);

  // No celular a lista de aulas vira uma faixa horizontal: mantém a aula escolhida à vista.
  useEffect(() => {
    const list = periodsRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-period="${selectedPeriod}"]`);
    if (list && item && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = item.offsetLeft - list.offsetLeft - 8;
    }
  }, [selectedPeriod, query]);

  // Gravação agrupada no servidor: envia a lista inteira um pouco depois da
  // última alteração. Um envio por vez; o que mudar durante o envio vai no seguinte.
  const utils = trpc.useUtils();
  const dirty = useRef(uploadInitial);
  const inFlight = useRef(false);
  const latest = useRef(notes);
  latest.current = notes;
  const persist = useCallback(async () => {
    if (teacherMode || inFlight.current || !dirty.current) return;
    inFlight.current = true;
    dirty.current = false;
    const snapshot = latest.current;
    try {
      const { updatedAt } = await utils.client.notes.save.mutate({ notes: snapshot });
      utils.notes.mine.setData(undefined, { notes: snapshot, updatedAt });
      forgetLegacyNotes(legacyStorageKey);
      setSaveState(dirty.current ? "pending" : "saved");
    } catch {
      dirty.current = true;
      setSaveState("error");
    } finally {
      inFlight.current = false;
    }
    // Alterações feitas enquanto o envio acontecia.
    if (dirty.current && latest.current !== snapshot) void persistRef.current();
  }, [legacyStorageKey, teacherMode, utils]);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    if (uploadInitial) {
      void persistRef.current();
      onNotify("Suas anotações deste navegador foram enviadas para a sua conta.");
    } else {
      forgetLegacyNotes(legacyStorageKey);
    }
    // Só na abertura da página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!dirty.current || teacherMode) return;
    setSaveState("pending");
    const timer = window.setTimeout(() => void persistRef.current(), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [notes, teacherMode]);
  useEffect(() => {
    // Fechar a aba com algo ainda não enviado: o navegador pede confirmação.
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty.current && !inFlight.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      // Saiu da página de anotações pelo app: envia o que faltou.
      if (dirty.current && !teacherMode) {
        pendingFlush = utils.client.notes.save
          .mutate({ notes: latest.current })
          .catch(() => undefined)
          .finally(() => {
            pendingFlush = null;
          });
      }
    };
  }, [teacherMode, utils]);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  const change = (next: StudentNote[]) => {
    dirty.current = true;
    setNotes(next);
  };

  const weekStart = weekStartKey(selectedDate);
  const weekDays = Array.from({ length: 5 }, (_, index) => addCalendarDays(weekStart, index));
  const weekLabel = weekRangeLabel(weekDays[0], weekDays[4]);

  const datesWithNotes = useMemo(() => new Set(notes.map(note => note.date)), [notes]);
  const recordedPeriods = useMemo(() => new Set(getRecordedPeriodIds(notes, selectedDate)), [notes, selectedDate]);
  const periodNotes = useMemo(
    () => notes.filter(note => note.date === selectedDate && note.periodId === selectedPeriod).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)),
    [notes, selectedDate, selectedPeriod],
  );
  const selected = periodNotes.find(note => note.id === selectedId) ?? periodNotes[0] ?? null;
  const dayActivities = useMemo(() => {
    const byPeriod = new Map<number, string>();
    for (const activity of activities) {
      if (scheduleDateKey(activity.startsAt) === selectedDate) byPeriod.set(activityPeriodId(activity), activity.title);
    }
    return byPeriod;
  }, [activities, selectedDate]);
  const results = useMemo(() => searchStudentNotes(notes, query), [notes, query]);
  const currentPeriod = getClassPeriod(selectedPeriod) ?? classSchedule[0];
  const nowPeriodId = selectedDate === todayKey ? currentLocalPeriodId() : undefined;

  const goTo = (date: string, periodId?: number, noteId?: string) => {
    setSelectedDate(date);
    if (periodId) setSelectedPeriod(periodId);
    setSelectedId(noteId ?? null);
    setConfirmDelete(false);
  };
  const shiftWeek = (weeks: number) => goTo(addCalendarDays(weekStart, weeks * 7));

  const createNote = () => {
    if (teacherMode) return;
    const subject = SUBJECTS[(selectedPeriod - 1) % SUBJECTS.length];
    const note = makeStudentNote(selectedPeriod, subject, Date.now(), selectedDate);
    change([note, ...notes]);
    setSelectedId(note.id);
    setQuery("");
    window.requestAnimationFrame(() => titleRef.current?.focus());
  };
  const updateSelected = (patch: Partial<Pick<StudentNote, "subject" | "title" | "body">>) => {
    if (!selected || teacherMode) return;
    change(updateStudentNote(notes, selected.id, patch));
  };
  const addPrompt = (label: string) => {
    if (!selected) return;
    const marker = `• ${label}:`;
    if (selected.body.includes(marker)) return;
    const body = selected.body.trimEnd();
    updateSelected({ body: `${body}${body ? "\n\n" : ""}${marker} ` });
  };
  const deleteSelected = () => {
    if (!selected || teacherMode) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    change(removeStudentNote(notes, selected.id));
    setSelectedId(null);
    setConfirmDelete(false);
    onNotify("Anotação excluída.");
  };

  const words = selected ? wordCount(selected.body) : 0;
  const updatedLabel = selected
    ? new Date(selected.updatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "")
    : "";

  return (
    <main className="nt-page">
      <button type="button" className="nt-back" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden="true" /> Voltar ao início
      </button>

      <header className="nt-header">
        <div>
          <p className="nt-eyebrow">{teacherMode ? "Consulta" : "Área do aluno"}</p>
          <h1>Diário de aula</h1>
          <p className="nt-lead">
            {teacherMode
              ? `Somente leitura: diário de ${studentName ?? "aluno"}, preenchido pelo próprio aluno na conta dele.`
              : "Registre o que aprendeu em cada aula. Tudo é salvo automaticamente na sua conta e aparece em qualquer computador."}
          </p>
        </div>
        <div className="nt-header-actions">
          {studentPicker}
          <label className="nt-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar nas anotações"
              aria-label="Buscar nas anotações"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca">
                <X size={14} />
              </button>
            )}
          </label>
          {!teacherMode && (
            <button type="button" className="nt-primary" onClick={createNote}>
              <Plus size={16} aria-hidden="true" /> Nova anotação
            </button>
          )}
        </div>
      </header>

      <section className="nt-week" aria-label="Dias letivos">
        <div className="nt-week-nav">
          <button type="button" className="nt-icon" onClick={() => shiftWeek(-1)} aria-label="Semana anterior">
            <ChevronLeft size={18} />
          </button>
          <p>
            <CalendarDays size={15} aria-hidden="true" /> {weekLabel}
          </p>
          <button type="button" className="nt-icon" onClick={() => shiftWeek(1)} aria-label="Próxima semana">
            <ChevronRight size={18} />
          </button>
          {weekStart !== weekStartKey(initialDate) && (
            <button type="button" className="nt-today" onClick={() => goTo(initialDate)}>
              Hoje
            </button>
          )}
        </div>
        <div className="nt-days" role="group" aria-label="Escolha o dia">
          {weekDays.map(key => {
            const date = dateFromKey(key);
            const active = key === selectedDate;
            return (
              <button
                key={key}
                type="button"
                className={`nt-day ${active ? "is-active" : ""} ${key === todayKey ? "is-today" : ""}`}
                aria-pressed={active}
                aria-label={`${date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}${datesWithNotes.has(key) ? ", com anotações" : ""}`}
                onClick={() => goTo(key)}
              >
                <em>{date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</em>
                <strong>{date.getDate()}</strong>
                <i aria-hidden="true">{datesWithNotes.has(key) ? <b /> : null}</i>
              </button>
            );
          })}
        </div>
        <div className="nt-progress" aria-live="polite">
          <strong>
            {recordedPeriods.size}
            <em>/{classSchedule.length}</em>
          </strong>
          <p>aulas registradas no dia</p>
          <div className="nt-progress-bar" aria-hidden="true">
            <i style={{ width: `${(recordedPeriods.size / classSchedule.length) * 100}%` }} />
          </div>
        </div>
      </section>

      <div className="nt-layout">
        <aside className="nt-side" aria-label={query ? "Resultados da busca" : "Aulas do dia"}>
          {query ? (
            <>
              <p className="nt-side-title">
                {results.length} {results.length === 1 ? "resultado" : "resultados"}
              </p>
              {results.length === 0 ? (
                <p className="nt-side-empty">Nada encontrado para “{query}”.</p>
              ) : (
                <ul className="nt-results">
                  {results.map(note => (
                    <li key={note.id}>
                      <button
                        type="button"
                        onClick={() => {
                          goTo(note.date, note.periodId, note.id);
                          setQuery("");
                        }}
                      >
                        <strong>{note.title || "Sem título"}</strong>
                        <p>{note.body.replace(/\s+/g, " ").slice(0, 90) || "Anotação vazia"}</p>
                        <em>
                          {dateFromKey(note.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")} ·{" "}
                          {getClassPeriod(note.periodId)?.label ?? "Aula"} · {note.subject}
                        </em>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="nt-side-title">Aulas do dia · 45 min</p>
              <ol className="nt-periods" ref={periodsRef}>
                {classSchedule.map(period => {
                  const active = period.id === selectedPeriod;
                  const recorded = recordedPeriods.has(period.id);
                  const activity = dayActivities.get(period.id);
                  return (
                    <li key={period.id} data-period={period.id}>
                      <button
                        type="button"
                        className={`nt-period ${active ? "is-active" : ""} ${recorded ? "is-recorded" : ""}`}
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedPeriod(period.id);
                          setSelectedId(null);
                          setConfirmDelete(false);
                        }}
                      >
                        <b className="nt-period-time">
                          {period.start}
                          <em>{period.end}</em>
                        </b>
                        <div className="nt-period-copy">
                          <strong>
                            {period.label}
                            {period.id === nowPeriodId && <i className="nt-now">agora</i>}
                          </strong>
                          <p>{activity ?? (recorded ? "Com anotação" : "Sem registro")}</p>
                        </div>
                        {recorded && <Check size={15} className="nt-period-check" aria-label="com anotação" />}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </aside>

        <section className="nt-editor" aria-label="Anotação">
          <div className="nt-editor-head">
            <div>
              <p className="nt-eyebrow">
                {dateFromKey(selectedDate).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <h2>
                {currentPeriod.label} · {currentPeriod.start}–{currentPeriod.end}
              </h2>
              {dayActivities.get(selectedPeriod) && <p className="nt-editor-activity">No cronograma: {dayActivities.get(selectedPeriod)}</p>}
            </div>
            {teacherMode && (
              <b className="nt-readonly">
                <Lock size={13} aria-hidden="true" /> Somente leitura
              </b>
            )}
          </div>

          {periodNotes.length > 1 ? (
            <div className="nt-tabs" role="tablist" aria-label="Anotações desta aula">
              {periodNotes.map((note, index) => (
                <button
                  key={note.id}
                  type="button"
                  role="tab"
                  aria-selected={selected?.id === note.id}
                  className={selected?.id === note.id ? "is-active" : ""}
                  onClick={() => {
                    setSelectedId(note.id);
                    setConfirmDelete(false);
                  }}
                >
                  {note.title || `Anotação ${index + 1}`}
                </button>
              ))}
              {!teacherMode && (
                <button type="button" className="nt-tab-add" onClick={createNote} aria-label="Outra anotação nesta aula">
                  <Plus size={14} />
                </button>
              )}
            </div>
          ) : null}

          {selected ? (
            <div className="nt-sheet">
              <div className="nt-sheet-meta">
                <select
                  className="nt-subject"
                  aria-label="Assunto da aula"
                  value={selected.subject}
                  disabled={teacherMode}
                  onChange={event => updateSelected({ subject: event.target.value })}
                >
                  {(SUBJECTS.includes(selected.subject) ? SUBJECTS : [selected.subject, ...SUBJECTS]).map(subject => (
                    <option key={subject}>{subject}</option>
                  ))}
                </select>
                {!teacherMode && (
                  <div className="nt-sheet-actions">
                    <button type="button" className="nt-ghost" onClick={createNote}>
                      <Plus size={14} aria-hidden="true" /> Outra anotação
                    </button>
                    <button type="button" className={`nt-delete ${confirmDelete ? "is-confirming" : ""}`} onClick={deleteSelected}>
                      <Trash2 size={14} aria-hidden="true" /> {confirmDelete ? "Confirmar exclusão" : "Excluir"}
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={titleRef}
                className="nt-title"
                aria-label="Título da anotação"
                value={selected.title}
                readOnly={teacherMode}
                onChange={event => updateSelected({ title: event.target.value })}
                placeholder="Dê um título para esta aula"
              />
              {!teacherMode && (
                <div className="nt-prompts" role="group" aria-label="Adicionar tópico ao texto">
                  {PROMPTS.map(label => {
                    const added = selected.body.includes(`• ${label}:`);
                    return (
                      <button key={label} type="button" disabled={added} aria-pressed={added} onClick={() => addPrompt(label)}>
                        {added ? <Check size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />} {label}
                      </button>
                    );
                  })}
                </div>
              )}
              <label className="sr-only" htmlFor="nt-body">
                Conteúdo da anotação
              </label>
              <textarea
                id="nt-body"
                className="nt-body"
                value={selected.body}
                readOnly={teacherMode}
                onChange={event => updateSelected({ body: event.target.value })}
                placeholder="O que foi feito na aula, medidas observadas, cuidados de segurança, dúvidas para revisar…"
              />
              <footer className="nt-sheet-foot">
                <p className={`nt-save is-${teacherMode ? "saved" : saveState}`} role={saveState === "error" ? "alert" : "status"}>
                  {teacherMode ? (
                    <>
                      <Lock size={13} aria-hidden="true" /> Consulta
                    </>
                  ) : saveState === "pending" ? (
                    <>
                      <LoaderCircle size={13} className="nt-spin" aria-hidden="true" /> Salvando…
                    </>
                  ) : saveState === "error" ? (
                    <>
                      <CloudOff size={13} aria-hidden="true" /> Não foi possível salvar.{" "}
                      <button type="button" className="nt-ghost" onClick={() => void persist()}>
                        Tentar de novo
                      </button>
                    </>
                  ) : (
                    <>
                      <Check size={13} aria-hidden="true" /> Salvo
                    </>
                  )}
                </p>
                <p>
                  {words} {words === 1 ? "palavra" : "palavras"} · editado {updatedLabel}
                </p>
              </footer>
            </div>
          ) : (
            <div className="nt-empty">
              <b className="nt-empty-icon" aria-hidden="true">
                <FileText size={24} />
              </b>
              <strong>{teacherMode ? "Nenhum registro nesta aula" : "Esta aula ainda não tem anotação"}</strong>
              <p>
                {teacherMode
                  ? "Não há anotações salvas para este horário."
                  : "Anote o que foi feito, as medidas observadas e o que ficou de dúvida. Leva menos de um minuto."}
              </p>
              {!teacherMode && (
                <button type="button" className="nt-primary" onClick={createNote}>
                  <Plus size={16} aria-hidden="true" /> Criar anotação
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
