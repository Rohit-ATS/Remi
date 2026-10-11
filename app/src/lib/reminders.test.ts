import { describe, expect, it } from "vitest";
import {
  byDay,
  daysUntil,
  describeWhen,
  fromDateKey,
  occurrencesInMonth,
  toDateKey,
  upcoming,
  type Reminder,
} from "./reminders.ts";

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: "r1",
  label: "Figma",
  amount: "15000000",
  due: "2026-10-15",
  repeat: "none",
  note: "",
  ...over,
});

describe("date keys", () => {
  it("round-trips a local date without shifting a day", () => {
    expect(toDateKey(new Date(2026, 9, 1))).toBe("2026-10-01");
    expect(fromDateKey("2026-10-01")?.getDate()).toBe(1);
    expect(fromDateKey("2026-10-01")?.getMonth()).toBe(9);
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(fromDateKey("not a date")).toBeNull();
    expect(fromDateKey("2026-10-1")).toBeNull();
  });
});

describe("occurrencesInMonth", () => {
  it("places a one-off only in its own month", () => {
    const list = [reminder()];
    expect(occurrencesInMonth(list, 2026, 9)).toHaveLength(1);
    expect(occurrencesInMonth(list, 2026, 10)).toHaveLength(0);
    expect(occurrencesInMonth(list, 2026, 8)).toHaveLength(0);
  });

  it("repeats a monthly reminder in every later month, never earlier", () => {
    const list = [reminder({ repeat: "monthly", due: "2026-10-15" })];
    expect(occurrencesInMonth(list, 2026, 8)).toHaveLength(0);
    expect(occurrencesInMonth(list, 2026, 9)[0]?.date.getDate()).toBe(15);
    expect(occurrencesInMonth(list, 2027, 2)[0]?.date.getDate()).toBe(15);
  });

  it("clamps a monthly 31st to the last day of a shorter month", () => {
    const list = [reminder({ repeat: "monthly", due: "2026-01-31" })];
    expect(occurrencesInMonth(list, 2026, 0)[0]?.date.getDate()).toBe(31);
    expect(occurrencesInMonth(list, 2026, 1)[0]?.date.getDate()).toBe(28);
    expect(occurrencesInMonth(list, 2026, 3)[0]?.date.getDate()).toBe(30);
  });

  it("repeats a yearly reminder only in its own month", () => {
    const list = [reminder({ repeat: "yearly", due: "2026-04-05" })];
    expect(occurrencesInMonth(list, 2027, 3)[0]?.date.getDate()).toBe(5);
    expect(occurrencesInMonth(list, 2027, 4)).toHaveLength(0);
  });

  it("groups several on one day", () => {
    const list = [
      reminder({ id: "a", due: "2026-10-01" }),
      reminder({ id: "b", due: "2026-10-01" }),
      reminder({ id: "c", due: "2026-10-09" }),
    ];
    const grouped = byDay(occurrencesInMonth(list, 2026, 9));
    expect(grouped.get(1)).toHaveLength(2);
    expect(grouped.get(9)).toHaveLength(1);
  });
});

describe("upcoming", () => {
  it("returns the next date for each reminder, soonest first", () => {
    const list = [
      reminder({ id: "rent", label: "Rent", repeat: "monthly", due: "2026-01-01" }),
      reminder({ id: "figma", label: "Figma", repeat: "monthly", due: "2026-01-20" }),
    ];
    const next = upcoming(list, new Date(2026, 9, 10));
    expect(next.map((o) => o.reminder.id)).toEqual(["figma", "rent"]);
    expect(next[0]?.date.getDate()).toBe(20);
    expect(next[1]?.date.getMonth()).toBe(10);
  });

  it("finds a yearly reminder whose month has already passed", () => {
    const list = [reminder({ repeat: "yearly", due: "2026-04-05" })];
    const next = upcoming(list, new Date(2026, 9, 10));
    expect(next).toHaveLength(1);
    expect(next[0]?.date.getFullYear()).toBe(2027);
  });

  it("leaves out a one-off that has already passed", () => {
    expect(upcoming([reminder({ due: "2026-01-05" })], new Date(2026, 9, 10))).toHaveLength(0);
  });
});

describe("daysUntil", () => {
  it("counts whole days either side of today", () => {
    const today = new Date(2026, 9, 10);
    expect(daysUntil(new Date(2026, 9, 10), today)).toBe(0);
    expect(daysUntil(new Date(2026, 9, 11), today)).toBe(1);
    expect(daysUntil(new Date(2026, 9, 8), today)).toBe(-2);
  });

  it("describes the gap in words", () => {
    expect(describeWhen(0)).toBe("Due today");
    expect(describeWhen(1)).toBe("Due tomorrow");
    expect(describeWhen(-1)).toBe("1 day overdue");
    expect(describeWhen(4)).toBe("In 4 days");
  });
});
