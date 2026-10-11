import { useMemo, useState } from "react";
import {
  byDay,
  daysUntil,
  describeWhen,
  fromDateKey,
  occurrencesInMonth,
  toDateKey,
  type Occurrence,
  type Reminder,
} from "../lib/reminders.ts";
import { formatUsd } from "../lib/money.ts";
import { Sheet } from "../screens/Sheets.tsx";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A month, with the days money is due marked on them.
 *
 * The grid starts where the month starts. A calendar whose first row is padded
 * wrongly puts every date under the wrong weekday, which is the kind of error
 * that reads as fine until somebody pays rent on a Tuesday.
 *
 * Every day is a target, not only the marked ones. A date that cannot be
 * pressed has to be read against the list underneath to answer "what is on the
 * 14th", and an empty day still has a useful answer — nothing is due, and here
 * is where to put something. Pressing one opens that day on its own.
 */
export function PaymentCalendar({
  reminders,
  onPay,
  onRemove,
  onAdd,
}: {
  reminders: readonly Reminder[];
  onPay: (occurrence: Occurrence) => void;
  onRemove: (id: string) => void;
  /** Start a new due date already dated to the day that was opened. */
  onAdd?: (dateKey: string) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [opened, setOpened] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const occurrences = useMemo(
    () => occurrencesInMonth(reminders, year, month),
    [reminders, year, month],
  );
  const marked = useMemo(() => byDay(occurrences), [occurrences]);

  const firstWeekday = new Date(year, month, 1).getDay();
  const length = new Date(year, month + 1, 0).getDate();
  // en-US to match money.ts, which formats every other date in the product.
  // Left to the system locale, this one card spoke a different language from
  // the receipts beside it.
  const monthName = cursor.toLocaleString("en-US", { month: "long" });

  const step = (by: number): void => {
    setOpened(null);
    setCursor(new Date(year, month + by, 1));
  };

  const total = occurrences.reduce(
    (sum, o) => (o.reminder.amount === null ? sum : sum + BigInt(o.reminder.amount)),
    0n,
  );

  // A day stays open across an edit, so removing one of three things leaves the
  // other two on screen instead of closing the sheet out from under the tap.
  const openedDate = opened === null ? null : fromDateKey(opened);
  const openedDue = opened === null ? [] : occurrences.filter((o) => toDateKey(o.date) === opened);

  return (
    <div className="calendar">
      <div className="calendar__head">
        <p className="calendar__month">
          <span>
            {monthName}, {year}
          </span>
          <span className="calendar__dot" aria-hidden="true" />
          <span className="calendar__sub">
            {occurrences.length === 0
              ? "Nothing due"
              : `${occurrences.length} due${total > 0n ? ` · ${formatUsd(total)}` : ""}`}
          </span>
        </p>
        <div className="calendar__nav">
          <button
            type="button"
            className="iconbtn"
            aria-label="Previous month"
            onClick={() => step(-1)}
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            className="iconbtn"
            aria-label="Next month"
            onClick={() => step(1)}
          >
            <Chevron direction="right" />
          </button>
        </div>
      </div>

      <div className="calendar__grid" role="grid" aria-label={`${monthName} ${year}`}>
        {DAY_NAMES.map((name) => (
          <span key={name} className="calendar__dayname" aria-hidden="true">
            {name}
          </span>
        ))}

        {/* Array(n) is holes, and holes are skipped by map — the spec's own
            version of this never rendered its leading blanks, so every month
            started on a Sunday. */}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`lead-${i}`} className="calendar__blank" aria-hidden="true" />
        ))}

        {Array.from({ length }, (_, i) => {
          const day = i + 1;
          const date = new Date(year, month, day);
          const key = toDateKey(date);
          const due = marked.get(day) ?? [];
          const isToday = toDateKey(today) === key;
          const overdue = due.length > 0 && daysUntil(date, today) < 0;

          return (
            <button
              key={key}
              type="button"
              className={due.length > 0 ? "calendar__day calendar__day--due" : "calendar__day"}
              data-today={isToday}
              data-overdue={overdue}
              data-selected={opened === key}
              aria-label={`${longDate(date)}${
                due.length === 0 ? ", nothing due" : `, ${due.length} due`
              }`}
              title={due.length === 0 ? undefined : due.map((o) => o.reminder.label).join(", ")}
              onClick={() => setOpened(opened === key ? null : key)}
            >
              {day}
              {due.length > 1 && <span className="calendar__count">{due.length}</span>}
            </button>
          );
        })}
      </div>

      {occurrences.length === 0 ? (
        <p className="small faint calendar__note">
          Nothing is due in {monthName}. Pick a day to add one, or add one below.
        </p>
      ) : (
        <ul className="duelist">
          {occurrences.map((occurrence) => (
            <DueRow
              key={`${occurrence.reminder.id}-${toDateKey(occurrence.date)}`}
              occurrence={occurrence}
              today={today}
              onPay={onPay}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      {openedDate !== null && (
        <Sheet label={longDate(openedDate)} dismissible onClose={() => setOpened(null)}>
          <div className="stack-sm">
            <p className="eyebrow">{weekdayOf(openedDate)}</p>
            <h2 className="daysheet__title">{longDate(openedDate)}</h2>
            <p className="hushed" style={{ margin: 0 }}>
              {openedDue.length === 0
                ? "Nothing is due on this day."
                : `${openedDue.length} ${openedDue.length === 1 ? "thing" : "things"} due${
                    sumOf(openedDue) > 0n ? ` · ${formatUsd(sumOf(openedDue))}` : ""
                  }`}
            </p>
          </div>

          {openedDue.length > 0 && (
            <ul className="duelist">
              {openedDue.map((occurrence) => (
                <DueRow
                  key={occurrence.reminder.id}
                  occurrence={occurrence}
                  today={today}
                  onPay={(o) => {
                    setOpened(null);
                    onPay(o);
                  }}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          )}

          <div className="row">
            {onAdd !== undefined && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setOpened(null);
                  onAdd(toDateKey(openedDate));
                }}
              >
                Add a due date here
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setOpened(null)}>
              Close
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** One due thing, rendered the same in the month list and in a day. */
function DueRow({
  occurrence,
  today,
  onPay,
  onRemove,
}: {
  occurrence: Occurrence;
  today: Date;
  onPay: (occurrence: Occurrence) => void;
  onRemove: (id: string) => void;
}) {
  const away = daysUntil(occurrence.date, today);
  return (
    <li>
      <span className="duelist__date">
        <b>{occurrence.date.getDate()}</b>
        <small>{occurrence.date.toLocaleString("en-US", { month: "short" })}</small>
      </span>
      <span className="duelist__what">
        <span className="duelist__label">{occurrence.reminder.label}</span>
        <span className="duelist__meta" data-overdue={away < 0}>
          {describeWhen(away)}
          {occurrence.reminder.repeat !== "none" && ` · ${occurrence.reminder.repeat}`}
          {occurrence.reminder.note !== "" && ` · ${occurrence.reminder.note}`}
        </span>
      </span>
      {occurrence.reminder.amount !== null && (
        <span className="figure duelist__amount">{formatUsd(occurrence.reminder.amount)}</span>
      )}
      <span className="duelist__actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPay(occurrence)}>
          Pay
        </button>
        <button
          type="button"
          className="iconbtn"
          aria-label={`Remove ${occurrence.reminder.label}`}
          onClick={() => onRemove(occurrence.reminder.id)}
        >
          <Cross />
        </button>
      </span>
    </li>
  );
}

function sumOf(occurrences: readonly Occurrence[]): bigint {
  return occurrences.reduce(
    (sum, o) => (o.reminder.amount === null ? sum : sum + BigInt(o.reminder.amount)),
    0n,
  );
}

function longDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function weekdayOf(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M10 3.2 5.2 8l4.8 4.8" : "M6 3.2 10.8 8 6 12.8"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
