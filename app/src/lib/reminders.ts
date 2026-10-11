// Due dates for the payments a business has to make anyway: a monthly
// retainer, a subscription, a quarterly invoice.
//
// A reminder is a note, not an instruction. Nothing here sends money or can be
// made to — when a due date arrives the calendar offers a prefilled link to
// the composer, and the confirm sheet still stands between that and a payout.
// An app that could pay on a schedule by itself would need a key that signs
// without the person present, which is the one thing this product refuses to
// hold.

export type Repeat = "none" | "monthly" | "yearly";

export type Reminder = {
  id: string;
  /** Who or what is owed: "Maria Santos", "Figma", "Quarterly VAT". */
  label: string;
  /** Minor units, as a decimal string, or null when the amount varies. */
  amount: string | null;
  /** The first date it falls due, as YYYY-MM-DD in local time. */
  due: string;
  repeat: Repeat;
  note: string;
};

export type Occurrence = { reminder: Reminder; date: Date };

export function newId(): string {
  return crypto.randomUUID();
}

/** YYYY-MM-DD for a local date, which is what a date input reads and writes. */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD as a local date.
 *
 * `new Date("2026-10-01")` is parsed as UTC midnight, which is the previous day
 * in every timezone west of Greenwich — a due date that silently moves is worse
 * than no due date.
 */
export function fromDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (match === null) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Every date a reminder falls on within one month.
 *
 * A monthly reminder set for the 31st has no 31st to land on in four months of
 * the year. It falls on the last day of those months rather than skipping them
 * or sliding into the next one, because rent due on the last day is the thing
 * people actually mean.
 */
export function occurrencesInMonth(
  reminders: readonly Reminder[],
  year: number,
  month: number,
): Occurrence[] {
  const found: Occurrence[] = [];
  const length = daysInMonth(year, month);

  for (const reminder of reminders) {
    const start = fromDateKey(reminder.due);
    if (start === null) continue;

    const monthIndex = year * 12 + month;
    const startIndex = start.getFullYear() * 12 + start.getMonth();
    if (monthIndex < startIndex) continue;

    if (reminder.repeat === "none") {
      if (monthIndex !== startIndex) continue;
      found.push({ reminder, date: new Date(year, month, start.getDate()) });
      continue;
    }

    if (reminder.repeat === "yearly" && start.getMonth() !== month) continue;

    found.push({ reminder, date: new Date(year, month, Math.min(start.getDate(), length)) });
  }

  return found.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Occurrences grouped by day of month, for painting a grid. */
export function byDay(occurrences: readonly Occurrence[]): Map<number, Occurrence[]> {
  const map = new Map<number, Occurrence[]>();
  for (const occurrence of occurrences) {
    const day = occurrence.date.getDate();
    const list = map.get(day);
    if (list === undefined) map.set(day, [occurrence]);
    else list.push(occurrence);
  }
  return map;
}

/**
 * The next time each reminder falls due on or after a given day, soonest first.
 *
 * Looks a year and a bit ahead so a yearly reminder set for last month still
 * resolves to its next date rather than disappearing.
 */
export function upcoming(
  reminders: readonly Reminder[],
  from: Date,
  limit = 3,
): Occurrence[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const found: Occurrence[] = [];

  for (let ahead = 0; ahead <= 13; ahead += 1) {
    const cursor = new Date(start.getFullYear(), start.getMonth() + ahead, 1);
    for (const occurrence of occurrencesInMonth(
      reminders,
      cursor.getFullYear(),
      cursor.getMonth(),
    )) {
      if (occurrence.date.getTime() < start.getTime()) continue;
      if (found.some((seen) => seen.reminder.id === occurrence.reminder.id)) continue;
      found.push(occurrence);
    }
  }

  return found.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, limit);
}

/** Whole days from today to a due date: negative is overdue, 0 is today. */
export function daysUntil(date: Date, today = new Date()): number {
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function describeWhen(days: number): string {
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`;
  return `In ${days} days`;
}
