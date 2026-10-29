/**
 * Datas no fuso da escola (padrão America/Sao_Paulo), independentes do fuso do
 * servidor. Sem isto, `toISOString()` (UTC) jogava o estudo feito depois das
 * 21h de Brasília para o dia seguinte.
 */
import { addCalendarDays } from "./class-schedule";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** `AAAA-MM-DD` do dia em que o instante cai, no fuso informado. */
export function dateKeyInZone(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Diferença (ms) entre o relógio do fuso e o UTC naquele instante. */
function zoneOffsetMs(date: Date, timeZone: string) {
  const { year, month, day, hour, minute, second } = zonedParts(date, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante da meia-noite de `dateKey` no fuso informado. */
export function startOfZonedDay(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  // Duas passadas resolvem a virada de horário de verão no próprio dia.
  let guess = utcMidnight - zoneOffsetMs(new Date(utcMidnight), timeZone);
  guess = utcMidnight - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

export type StatsPeriod = "all" | "today" | "week" | "month";

/** Início do período de estatísticas (hoje, últimos 7 dias, mês corrente) no fuso da escola. */
export function periodStartInZone(period: Exclude<StatsPeriod, "all">, now: Date, timeZone: string): Date {
  const todayKey = dateKeyInZone(now, timeZone);
  if (period === "today") return startOfZonedDay(todayKey, timeZone);
  if (period === "week") return startOfZonedDay(addCalendarDays(todayKey, -6), timeZone);
  return startOfZonedDay(`${todayKey.slice(0, 8)}01`, timeZone);
}

/**
 * Dias seguidos de estudo terminando hoje ou ontem (no fuso da escola).
 * Zero quando o último dia de estudo foi anteontem ou antes.
 */
export function studyStreakDays(completedAt: Array<Date | null>, now: Date, timeZone: string): number {
  const days = new Set(completedAt.filter((value): value is Date => value instanceof Date).map(value => dateKeyInZone(value, timeZone)));
  if (!days.size) return 0;
  const todayKey = dateKeyInZone(now, timeZone);
  let cursor = days.has(todayKey) ? todayKey : addCalendarDays(todayKey, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return streak;
}
