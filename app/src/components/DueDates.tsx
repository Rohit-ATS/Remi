import { useCallback, useEffect, useState } from "react";
import type { StoredAccount } from "../lib/account.ts";
import { describeError } from "../lib/account.ts";
import type { ServerConfig } from "../lib/api.ts";
import { hasReminders, saveReminders, unlockReminders } from "../lib/vault.ts";
import { newId, toDateKey, type Occurrence, type Reminder } from "../lib/reminders.ts";
import { parseAmount } from "../lib/money.ts";
import { PaymentCalendar } from "./PaymentCalendar.tsx";

/**
 * The due dates a business keeps in its head: a retainer, a subscription, a
 * quarterly bill.
 *
 * They are encrypted under the same key as the payee book, because a reminder
 * is a name attached to a sum of money and that is the one thing this product
 * promises not to leave lying around. That costs one Face ID prompt the first
 * time the list is opened in a session, which is why nothing here loads until
 * the person asks for it.
 */
export function DueDates({
  account,
  network,
  onPay,
}: {
  account: StoredAccount;
  network: ServerConfig["network"];
  onPay: (occurrence: Occurrence) => void;
}) {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  if (reminders === null) {
    return (
      <div className="stack-sm">
        <p className="hushed">
          Your due dates are encrypted under the same Face ID as your payee book.
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

  return (
    <div className="stack-sm">
      {error !== null && <div className="notice notice-error">{error}</div>}

      <PaymentCalendar
        reminders={reminders}
        onPay={onPay}
        onRemove={(id) => void persist(reminders.filter((r) => r.id !== id))}
      />

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
        A due date is a note. Nothing here moves money on its own — when one
        arrives, Pay fills in the line and you still confirm it.
      </p>
    </div>
  );
}
