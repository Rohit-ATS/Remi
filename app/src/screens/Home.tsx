import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AssistantAnswer, type Payout, type ServerConfig } from "../lib/api.ts";
import { describeError, type StoredAccount } from "../lib/account.ts";
import { parsePaymentIntent } from "../lib/intent.ts";
import { formatAmount, formatDate, formatUsd } from "../lib/money.ts";
import { enablePayouts, preflight, savePayee, sendPayout, getBalance } from "../lib/payouts.ts";
import { useSpeech } from "../lib/speech.ts";
import {
  findEntry,
  savePayeeBook,
  unlockPayeeBook,
  upsertEntry,
  hasPayeeBook,
  type PayeeEntry,
} from "../lib/vault.ts";
import { ConfirmSheet, PayeeSheet, type PendingPayout } from "./Sheets.tsx";
import { navigate } from "../lib/router.ts";

export function Home({
  config,
  account,
  onSignOut,
}: {
  config: ServerConfig;
  account: StoredAccount;
  onSignOut: () => void;
}) {
  const [text, setText] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
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

  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const [balanceResult, payoutsResult] = await Promise.allSettled([
      getBalance(config, account.address),
      api.payouts(account.address),
    ]);
    if (balanceResult.status === "fulfilled") setBalance(balanceResult.value);
    if (payoutsResult.status === "fulfilled") setPayouts(payoutsResult.value.payouts);
  }, [config, account.address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const speech = useSpeech((transcript) => {
    setText(transcript);
    void route(transcript);
  });

  /** The composer's one decision: a payout, or a question. */
  const route = useCallback(
    async (input: string): Promise<void> => {
      const parsed = parsePaymentIntent(input);
      setAnswer(null);

      if (!parsed.ok) {
        setParseReason(parsed.reason);
        setAsking(true);
        try {
          setAnswer(await api.ask(account.address, input));
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

      // Unlocking the book costs a Face ID prompt, so it is only opened when a
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
      if (entry === undefined) {
        setPending({
          label: parsed.intent.payee,
          amount: parsed.intent.amount,
          memo: parsed.intent.memo,
          category: "Contractor",
          entry: null,
        });
        setUnknownLabel(parsed.intent.payee);
        return;
      }

      openConfirm({
        label: parsed.intent.payee,
        amount: parsed.intent.amount,
        memo: parsed.intent.memo,
        category: "Contractor",
        entry,
      });
    },
    [account, book],
  );

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

  const onSavePayee = async (entry: PayeeEntry): Promise<void> => {
    setBusy(true);
    setSheetError(null);
    try {
      const next = upsertEntry(book ?? [], entry);
      await savePayeeBook(account, next);
      setBook(next);
      await savePayee(config, entry.label, entry.address as `0x${string}`, entry.country);
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
        label: pending.label,
        payeeAddress: pending.entry.address as `0x${string}`,
        amount: pending.amount,
        memo: pending.memo,
        category: pending.category,
        labelIsSaved: true,
      });

      setPending(null);
      setText("");
      // The indexer polls, but a nudge makes the receipt appear immediately.
      await api.reindex().catch(() => undefined);
      await refresh();

      if (sent.receiptNo !== null) {
        navigate(`/r/${sent.receiptNo}`);
      } else {
        setNotice(`Sent in ${(sent.confirmedInMs / 1000).toFixed(1)}s.`);
      }
    } catch (caught) {
      setSheetError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (text.trim() !== "") void route(text);
  };

  return (
    <main className="shell">
      <header className="topbar">
        <span className="mark">
          <a href="#/">Remi</a>
        </span>
        {config.network === "testnet" && <span className="chip">Testnet</span>}
        <button type="button" className="chip" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <div className="stack">
        <div className="balance">
          <span className="eyebrow">Available</span>
          <span className="amount">{balance === null ? "—" : `$${formatAmount(balance)}`}</span>
        </div>

        <form className="composer" onSubmit={onSubmit}>
          <div className="inputrow">
            <input
              ref={inputRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Pay Maria four hundred dollars for October"
              aria-label="Pay someone, or ask about your books"
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
          <button type="submit" className="btn btn-primary btn-block" disabled={text.trim() === ""}>
            {asking ? <span className="spinner" /> : "Go"}
          </button>
          <p className="small faint">
            Say who and how much to pay, or ask a question about your books.
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

        <section className="stack-sm">
          <div className="spread">
            <h2>Recent payouts</h2>
            <a className="small" href="#/books">
              Books
            </a>
          </div>

          {payouts.length === 0 ? (
            <div className="empty">
              <p>No payouts yet.</p>
              <p className="small faint">
                Your first one will appear here, and on the recipient&rsquo;s Passport.
              </p>
            </div>
          ) : (
            <div className="list">
              {payouts.slice(0, 8).map((payout) => (
                <a
                  key={payout.receipt_no}
                  href={`#/r/${payout.receipt_no}`}
                  className="spread"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <span>
                    <strong>{payout.label || payout.payee.slice(0, 10)}</strong>
                    <br />
                    <span className="small hushed">
                      {formatDate(payout.timestamp)} · {payout.category}
                    </span>
                  </span>
                  <span className="figure">{formatUsd(payout.amount)}</span>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>

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
    </main>
  );
}
