import { classSchedule } from "./class-schedule";

export type StudentNote = {
  id: string;
  date: string;
  periodId: number;
  subject: string;
  title: string;
  body: string;
  updatedAt: string;
};

export function makeStudentNote(periodId = 1, subject = "Aula de ferramentaria", now = Date.now(), date = new Date(now).toISOString().slice(0, 10)): StudentNote {
  return {
    id: `note-${now}`,
    date,
    periodId,
    subject,
    title: "",
    body: "",
    updatedAt: new Date(now).toISOString(),
  };
}

/** Return unique, valid class-period IDs with a note on the requested school date. */
export function getRecordedPeriodIds(notes: StudentNote[], date: string): number[] {
  const recorded = new Set(notes.filter((note) => note.date === date).map((note) => note.periodId));
  return classSchedule.filter((period) => recorded.has(period.id)).map((period) => period.id);
}

export function updateStudentNote(
  notes: StudentNote[],
  id: string,
  patch: Partial<Pick<StudentNote, "date" | "periodId" | "subject" | "title" | "body">>,
  now = Date.now(),
): StudentNote[] {
  return notes.map((note) => note.id === id
    ? { ...note, ...patch, updatedAt: new Date(now).toISOString() }
    : note);
}

export function removeStudentNote(notes: StudentNote[], id: string): StudentNote[] {
  return notes.filter((note) => note.id !== id);
}

/**
 * Lê anotações salvas no navegador. Descarta entradas sem id e completa campos
 * ausentes; os dados salvos prevalecem sobre os padrões (o padrão só entra quando
 * o campo falta ou está vazio).
 */
export function parseStoredNotes(raw: unknown, fallbackDate: string): StudentNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): StudentNote[] => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Partial<StudentNote>;
    if (typeof value.id !== "string" || !value.id) return [];
    const updatedAt = typeof value.updatedAt === "string" && value.updatedAt ? value.updatedAt : new Date().toISOString();
    return [
      {
        id: value.id,
        date: typeof value.date === "string" && value.date ? value.date : fallbackDate,
        periodId: Number.isInteger(value.periodId) && (value.periodId as number) > 0 ? (value.periodId as number) : 1,
        subject: typeof value.subject === "string" && value.subject ? value.subject : "Ferramentaria",
        title: typeof value.title === "string" ? value.title : "",
        body: typeof value.body === "string" ? value.body : "",
        updatedAt,
      },
    ];
  });
}

/** Busca simples (sem acentos, sem caixa) em título, assunto e conteúdo; mais recentes primeiro. */
export function searchStudentNotes(notes: StudentNote[], query: string): StudentNote[] {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return notes
    .filter((note) => {
      const haystack = normalize(`${note.title} ${note.subject} ${note.body}`);
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
