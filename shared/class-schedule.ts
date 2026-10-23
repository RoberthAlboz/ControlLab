export const CLASS_PERIOD_MINUTES = 45;
export const CLASS_PERIOD_MS = CLASS_PERIOD_MINUTES * 60_000;
export const SCHOOL_START_MINUTES = 7 * 60 + 45;
export const SCHOOL_END_MINUTES = 16 * 60 + 45;

export type ClassPeriod = {
  id: number;
  label: string;
  start: string;
  end: string;
};

const formatClock = (totalMinutes: number) => {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const classSchedule: ClassPeriod[] = Array.from({ length: 12 }, (_, index) => {
  const startMinutes = SCHOOL_START_MINUTES + index * CLASS_PERIOD_MINUTES;
  return {
    id: index + 1,
    label: `Aula ${index + 1}`,
    start: formatClock(startMinutes),
    end: formatClock(startMinutes + CLASS_PERIOD_MINUTES),
  };
});

/** Format a Date using the viewer's local calendar date, for date inputs and week headers. */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** School days are Monday through Friday, matching the student annotation page. */
export function isSchoolDate(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  const dayOfWeek = date.getUTCDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

export function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function nextSchoolDateKey(date: Date, schoolDaysAhead = 0): string {
  let key = localDateKey(date);
  let remaining = Math.max(0, schoolDaysAhead);
  while (!isSchoolDate(key) || remaining > 0) {
    key = addCalendarDays(key, 1);
    if (isSchoolDate(key)) remaining -= 1;
  }
  return key;
}

export function getClassPeriod(periodId: number): ClassPeriod | undefined {
  return classSchedule.find((period) => period.id === periodId);
}

/**
 * Store the school's wall-clock timetable as UTC timestamps. The UI always formats
 * these dates with UTC getters, so the class period cannot shift by browser timezone.
 */
export function createPeriodDate(dateKey: string, periodId: number): Date {
  const period = getClassPeriod(periodId);
  if (!isSchoolDate(dateKey) || !period) throw new Error("Data ou período escolar inválido.");
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = period.start.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

export function scheduleDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function scheduleClock(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function findClassPeriodByStart(clock: string): ClassPeriod | undefined {
  return classSchedule.find((period) => period.start === clock);
}

export function findClassPeriodForDate(value: Date | string): ClassPeriod | undefined {
  return findClassPeriodByStart(scheduleClock(value));
}

/** Pick the nearest official period when importing an older free-form activity. */
export function nearestClassPeriod(clock: string): ClassPeriod {
  const [hour, minute] = clock.split(":").map(Number);
  const target = hour * 60 + minute;
  return classSchedule.reduce((nearest, period) => {
    const [periodHour, periodMinute] = period.start.split(":").map(Number);
    const [nearestHour, nearestMinute] = nearest.start.split(":").map(Number);
    const distance = Math.abs(periodHour * 60 + periodMinute - target);
    const nearestDistance = Math.abs(nearestHour * 60 + nearestMinute - target);
    return distance < nearestDistance ? period : nearest;
  }, classSchedule[0]);
}
