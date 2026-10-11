import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Address } from "viem";
import type { StoredAccount } from "../lib/account.ts";
import { describeError } from "../lib/account.ts";
import type { ServerConfig } from "../lib/api.ts";
import { hasReminders, saveReminders, unlockReminders } from "../lib/vault.ts";
import { canArm, newId, toDateKey, type Occurrence, type Reminder } from "../lib/reminders.ts";
import { demoReminders } from "../lib/demoReminders.ts";
import { enablePayouts, preflight, sendPayout } from "../lib/payouts.ts";
import { formatUsd, parseAmount } from "../lib/money.ts";
import { navigate } from "../lib/router.ts";
import { unlockName } from "../lib/unlock.ts";
import { DayPanel, PaymentCalendar, type OpenDay } from "./PaymentCalendar.tsx";

/**
 * The due dates a business keeps in its head: a retainer, a subscription, a
 * quarterly bill.
 *
 * They are encrypted under the same key as the payee book, because a reminder
 * is a name attached to a sum of money and that is the one thing this product
 * promises not to leave lying around. That costs one passkey prompt the first
 * time the list is opened in a session, which is why nothing here loads until
 * the person asks for it.
 */
export function DueDates({
  account,
  config,
  onPay,
}: {
  account: StoredAccount;
  /**
   * The whole config, not just the network: the network decides whether a
   * demo key may be used at all, and paying an armed reminder outright needs
   * the chain and the contract addresses beside it.
   */
  config: ServerConfig;
  onPay: (occurrence: Occurrence) => void;
}) {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [openDay, setOpenDay] = useState<OpenDay | null>(null);
  // The column beside the calendar, if this screen offers one. Resolved in an
  // effect because it is rendered by a different component on the same pass.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const network = config.network;

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(() => toDateKey(new Date()));
  const [repeat, setRepeat] = useState<Reminder["repeat"]>("monthly");
  const [note, setNote] = useState("");

  // Nothing encrypted yet means nothing to unlock, so a first-time list opens
  // without a prompt and the prompt arrives when there is something to protect.
  useEffect(() => {
    if (!hasReminders()) setReminders([]);
  }, []);

  // A demo account arriving at an empty book gets one, so the calendar has
  // something on it and both armed and unarmed states are visible without
  // anyone configuring one first. Written once: a book that was emptied on
  // purpose stays empty.
  useEffect(() => {
    if (reminders === null || reminders.length > 0) return;
    if (account.demo !== true || hasReminders()) return;
    void persist(demoReminders());
    // persist is stable enough for this one-shot; re-running on its identity
    // would refill a book the moment it was emptied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders, account.demo]);

  useEffect(() => {
    setSlot(document.getElementById("day-detail"));
  }, []);

  const unlock = useCallback(async (): Promise<Reminder[] | null> => {
    setBusy(true);
    setError(null);
    try {
      const list = await unlockReminders<Reminder>(account, network);
      setReminders(list);
      return list;
    } catch (caught) {
      setError(describeError(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }, [account, network]);

  // Deferring the unlock exists to avoid spending a prompt nobody asked for.
  // A demo account has no prompt to spend — its key is already here — so the
  // button in front of the list would be asking for a click to do nothing.
  useEffect(() => {
    if (reminders !== null || account.demo !== true || !hasReminders()) return;
    void unlock();
  }, [reminders, account.demo, unlock]);

  const persist = async (next: Reminder[]): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await saveReminders(account, network, next);
      setReminders(next);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const add = async (): Promise<void> => {
    const trimmed = label.trim();
    if (trimmed === "") return;

    const minor = amount.trim() === "" ? null : parseAmount(amount);
    if (amount.trim() !== "" && minor === null) {
      setError("That amount could not be read. Use digits, like 400 or 400.50.");
      return;
    }

    await persist([
      ...(reminders ?? []),
      {
        id: newId(),
        label: trimmed,
        amount: minor === null ? null : minor.toString(),
        due,
        repeat,
        note: note.trim(),
      },
    ]);

    setLabel("");
    setAmount("");
    setNote("");
    setAdding(false);
  };

  const setAutopay = (id: string, on: boolean): void => {
    void persist(
      (reminders ?? []).map((r) => (r.id === id ? { ...r, autopay: on } : r)),
    );
  };

  /**
   * Pays an armed reminder outright.
   *
   * This is the whole of what `autopay` means: no composer, no parsing, no
   * typing — and no skipped verification either. `sendPayout` runs a passkey
   * ceremony, so the money moves because somebody was here and proved it.
   */
  const payNow = async (occurrence: Occurrence): Promise<void> => {
    const reminder = occurrence.reminder;
    if (!canArm(reminder) || reminder.amount === null) return;

    const payee = reminder.payee as Address;
    const amount = BigInt(reminder.amount);

    setPaying(reminder.id);
    setError(null);
    try {
      let checked = await preflight(config, account.address, payee, amount);

      // The first payout from an account has to approve the token before it
      // can move it. The confirm sheet warns about the second prompt; here
      // the two simply run back to back.
      if (!checked.ok && checked.kind === "needs-approval") {
        await enablePayouts(config);
        checked = await preflight(config, account.address, payee, amount);
      }

      if (!checked.ok) {
        setError(
          checked.kind === "insufficient-funds"
            ? `That needs ${formatUsd(amount)} and this account has ${formatUsd(checked.available)}.`
            : checked.kind === "bad-address"
              ? "This due date points at an address that is not valid."
              : "That payout cannot go through yet.",
        );
        return;
      }

      const sent = await sendPayout(config, { payeeAddress: payee, amount });
      setOpenDay(null);
      if (sent.receiptNo !== null) navigate(`/r/${sent.receiptNo}`);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setPaying(null);
    }
  };

  // Opening the form from a day should not make the person type that day back
  // in, so the date it was opened from is already filled.
  const addOn = (dateKey: string): void => {
    setDue(dateKey);
    setAdding(true);
  };

  const remove = (id: string): void => {
    void persist((reminders ?? []).filter((r) => r.id !== id));
  };

  if (reminders === null) {
    return (
      <div className="stack-sm">
        <p className="hushed">
          Your due dates are encrypted under the same passkey as your payee book.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void unlock()}
        >
          {busy ? <span className="spinner" /> : "Unlock due dates"}
        </button>
        {error !== null && <div className="notice notice-error">{error}</div>}
      </div>
    );
  }

  const panelProps =
    openDay === null
      ? null
      : {
          day: openDay,
          unlock: unlockName(),
          paying,
          onPay,
          onPayNow: (occurrence: Occurrence) => void payNow(occurrence),
          onArm: setAutopay,
          onRemove: remove,
          onAdd: addOn,
          onClose: () => setOpenDay(null),
        };

  return (
    <div className="stack-sm">
      {error !== null && <div className="notice notice-error">{error}</div>}

      <PaymentCalendar
        reminders={reminders}
        onPay={onPay}
        onRemove={remove}
        onDayOpen={setOpenDay}
      />

      {/* The day opens beside the calendar rather than over it, so the grid
          stays readable and the next day along is one click rather than a
          dismissal and a click. Without that column — a narrow window — it
          falls back to sitting under the calendar. */}
      {panelProps !== null &&
        (slot === null ? (
          <DayPanel {...panelProps} />
        ) : (
          createPortal(<DayPanel {...panelProps} />, slot)
        ))}

      {adding ? (
        <form
          className="duesform"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <div className="field">
            <label htmlFor="due-label">What is due</label>
            <input
              id="due-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Maria Santos, or Figma"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="duesform__row">
            <div className="field">
              <label htmlFor="due-amount">Amount</label>
              <input
                id="due-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Optional"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="due-date">First due</label>
              <input
                id="due-date"
                type="date"
                value={due}
                onChange={(event) => setDue(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="due-repeat">Repeats</label>
              <select
                id="due-repeat"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value as Reminder["repeat"])}
              >
                <option value="none">Once</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="due-note">Note</label>
            <input
              id="due-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
              autoComplete="off"
            />
          </div>

          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy || label.trim() === ""}>
              {busy ? <span className="spinner" /> : "Save due date"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setAdding(true)}>
          Add a due date
        </button>
      )}

      <p className="small faint">
        A due date is a note. Nothing here moves money on its own: Pay fills in the line and you
        confirm it, and an armed one still asks for {unlockName()} on the day.
      </p>
    </div>
  );
}
