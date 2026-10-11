import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AssistantAnswer, type ServerConfig } from "../lib/api.ts";
import { describeError, type StoredAccount } from "../lib/account.ts";
import { parsePaymentIntent } from "../lib/intent.ts";
import { formatUsd } from "../lib/money.ts";
import { enablePayouts, preflight, sendPayout } from "../lib/payouts.ts";
import { useSpeech } from "../lib/speech.ts";
import {
  findEntry,
  hasPayeeBook,
  savePayeeBook,
  unlockPayeeBook,
  upsertEntry,
  type PayeeEntry,
} from "../lib/vault.ts";
import { ConfirmSheet, PayeeSheet, type PendingPayout } from "./Sheets.tsx";
import { navigate } from "../lib/router.ts";

/**
 * One input, two outcomes.
 *
 * The deterministic parser gets first refusal on everything typed. If it reads
 * a payout, the confirm sheet opens and no model is involved. If it does not,
 * the text goes to the assistant as a question — which can only read. That
 * split is the whole safety model: nothing a model returns can move money.
 */
export function Composer({
  config,
  account,
  onSent,
  draft,
}: {
  config: ServerConfig;
  account: StoredAccount;
  onSent: () => void;
  /**
   * A line put in the box from outside — the pay shortcuts on the dashboard.
   * The counter is what makes it land: picking the same payee twice should fill
   * the box twice, and comparing text alone would silently ignore the second.
   */
  draft?: { text: string; memo?: string; nonce: number } | undefined;
}) {
  const [text, setText] = useState("");
  const [memo, setMemo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const filled = useRef(0);
  const [book, setBook] = useState<PayeeEntry[] | null>(null);
  const [parseReason, setParseReason] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingPayout | null>(null);
  const [unknownLabel, setUnknownLabel] = useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = useState(false);

  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (draft === undefined || draft.nonce === filled.current) return;
    filled.current = draft.nonce;
    setText(draft.text);
    setMemo(draft.memo ?? "");
    // Land the caret at the end, so a shortcut that stops at "Pay Maria " is a
    // starting point rather than something to clear.
    const input = inputRef.current;
    if (input !== null) {
      input.focus();
      input.setSelectionRange(draft.text.length, draft.text.length);
      input.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [draft]);

  const openConfirm = useCallback(
    async (next: PendingPayout): Promise<void> => {
      setSheetError(null);
      setPending(next);
      if (next.entry === null) return;

      const check = await preflight(config, account.address, next.entry.address, next.amount);
      if (check.ok) {
        setNeedsApproval(false);
        return;
      }
      if (check.kind === "needs-approval") {
        setNeedsApproval(true);
        return;
      }
      if (check.kind === "insufficient-funds") {
        setSheetError(
          `You have ${formatUsd(check.available)} available and this payout is ${formatUsd(next.amount)}. Add funds to send it.`,
        );
        return;
      }
      setSheetError("That recipient's details do not look right. Check the address and save again.");
    },
    [config, account.address],
  );

  const route = useCallback(
    async (line: string, description: string): Promise<void> => {
      // The parser reads one sentence, and a trailing "for ..." is how it has
      // always taken a memo — so the two fields are joined into that sentence
      // rather than the parser learning about fields. One grammar, one path to
      // money, and the description still lands on the receipt.
      const parsed = parsePaymentIntent(joinIntent(line, description));
      setAnswer(null);

      if (!parsed.ok) {
        setParseReason(parsed.reason);
        setAsking(true);
        try {
          // A question is whatever was typed in the first field. The
          // description belongs to a payout, so appending it here would only
          // garble the question.
          setAnswer(await api.ask(account.address, line));
        } catch (caught) {
          setAnswer({
            answer:
              caught instanceof Error
                ? `That question could not be answered right now (${caught.message}).`
                : "That question could not be answered right now.",
            rows: [],
            source: "fallback",
            note: null,
          });
        } finally {
          setAsking(false);
        }
        return;
      }

      setParseReason(null);

      // Unlocking the book costs a Face ID prompt, so it only opens when a
      // payout actually needs a name resolved.
      let currentBook = book;
      if (currentBook === null) {
        if (!hasPayeeBook()) {
          currentBook = [];
          setBook([]);
        } else {
          try {
            currentBook = await unlockPayeeBook(account);
            setBook(currentBook);
          } catch (caught) {
            setNotice(describeError(caught));
            return;
          }
        }
      }

      const entry = findEntry(currentBook, parsed.intent.payee);
      const next: PendingPayout = {
        label: parsed.intent.payee,
        amount: parsed.intent.amount,
        memo: parsed.intent.memo,
        category: "Contractor",
        entry: entry ?? null,
      };

      if (entry === undefined) {
        setPending(next);
        setUnknownLabel(parsed.intent.payee);
        return;
      }
      await openConfirm(next);
    },
    [account, book, openConfirm],
  );

  // Dictation produces a whole sentence, memo and all, so it goes to the first
  // field and routes exactly as a typed sentence would.
  const speech = useSpeech((transcript) => {
    setText(transcript);
    void route(transcript, memo);
  });

  // Which of the two things the button will do, decided by the same parser
  // that will do it. The label is never a guess.
  const sends = text.trim() === "" || parsePaymentIntent(joinIntent(text, memo)).ok;

  const onSavePayee = async (entry: PayeeEntry): Promise<void> => {
    setBusy(true);
    setSheetError(null);
    try {
      const next = upsertEntry(book ?? [], entry);
      await savePayeeBook(account, next);
      setBook(next);
      setUnknownLabel(null);
      if (pending !== null) await openConfirm({ ...pending, entry });
    } catch (caught) {
      setSheetError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async (): Promise<void> => {
    if (pending === null || pending.entry === null) return;
    setBusy(true);
    setSheetError(null);
    try {
      if (needsApproval) {
        await enablePayouts(config);
        setNeedsApproval(false);
      }

      const sent = await sendPayout(config, {
        payeeAddress: pending.entry.address as `0x${string}`,
        amount: pending.amount,
      });

      setPending(null);
      setText("");
      setMemo("");
      // The indexer polls, but a nudge makes the receipt appear immediately.
      await api.reindex().catch(() => undefined);
      onSent();

      if (sent.receiptNo !== null) navigate(`/r/${sent.receiptNo}`);
      else setNotice(`Sent in ${(sent.confirmedInMs / 1000).toFixed(1)}s.`);
    } catch (caught) {
      setSheetError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() !== "") void route(text, memo);
        }}
      >
        <div className="field">
          <label htmlFor="composer-line">Who and how much</label>
          <div className="inputrow">
            <input
              id="composer-line"
              ref={inputRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Pay Maria four hundred dollars"
              autoComplete="off"
            />
            {speech.supported && (
              <button
                type="button"
                className="mic"
                data-listening={speech.listening}
                aria-label={speech.listening ? "Stop listening" : "Speak"}
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
              >
                {speech.listening ? "■" : "●"}
              </button>
            )}
          </div>
        </div>

        {/* A question has nothing to describe, so the field steps back rather
            than disappearing — a box that comes and goes under the cursor is
            worse than one that dims. */}
        <div className="field" data-muted={!sends}>
          <label htmlFor="composer-memo">Description</label>
          <input
            id="composer-memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="October retainer"
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={text.trim() === ""}>
          {asking ? <span className="spinner" /> : sends ? "Send" : "Ask"}
        </button>
        <p className="small faint">
          {sends
            ? "The description becomes the memo on the receipt and the line in your books."
            : "Say who and how much to pay, or ask a question about your books."}
        </p>
      </form>

      {notice !== null && (
        <div className="notice" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}

      {answer !== null && (
        <div className="card stack-sm">
          <p className="eyebrow">Answer</p>
          <p>{answer.answer}</p>
          {parseReason !== null && (
            <p className="small faint">Did you mean to pay someone? {parseReason}</p>
          )}
          {answer.rows.length > 0 && (
            <div className="scroll" style={{ marginTop: "0.4rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payee</th>
                    <th>Category</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {answer.rows.map((row, index) => (
                    <tr key={`${row.date}-${index}`}>
                      <td>{row.date}</td>
                      <td>{row.label}</td>
                      <td>{row.category}</td>
                      <td className="n">{row.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small faint">
            {answer.source === "model"
              ? "Figures come from the rows above, not from the model."
              : (answer.note ?? "Computed from the rows above.")}
          </p>
        </div>
      )}

      {unknownLabel !== null && (
        <PayeeSheet
          label={unknownLabel}
          busy={busy}
          error={sheetError}
          onSave={(entry) => void onSavePayee(entry)}
          onClose={() => {
            setUnknownLabel(null);
            setPending(null);
            setSheetError(null);
          }}
        />
      )}

      {unknownLabel === null && pending !== null && pending.entry !== null && (
        <ConfirmSheet
          pending={pending}
          categories={config.categories}
          networkFee="about $0.01"
          busy={busy}
          error={sheetError}
          needsApproval={needsApproval}
          onCategory={(category) => setPending({ ...pending, category })}
          onConfirm={() => void onConfirm()}
          onClose={() => {
            setPending(null);
            setSheetError(null);
          }}
        />
      )}
    </>
  );
}

/**
 * The two fields as one sentence.
 *
 * A line that already carries its own "for ..." keeps it: re-stating the memo
 * would leave the parser reading "for October for October".
 */
function joinIntent(line: string, description: string): string {
  const head = line.trim();
  const tail = description.trim();
  if (tail === "" || /\sfor\s/i.test(head)) return head;
  return `${head} for ${tail}`;
}
