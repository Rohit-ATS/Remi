import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Dashboard, type ServerConfig } from "../lib/api.ts";
import type { StoredAccount } from "../lib/account.ts";
import { getBalance } from "../lib/payouts.ts";
import { formatAmount, formatMonth, formatUsd } from "../lib/money.ts";
import { Composer } from "./Composer.tsx";
import { AppHeader } from "../components/AppHeader.tsx";
import { PaymentHistory } from "../components/PaymentHistory.tsx";

/**
 * Home.
 *
 * Money first, then the ways to move it, then what moving it produced. The
 * balance and the pay shortcuts are the top of the screen because paying
 * someone is the one thing this app is for; the figures, the chart and the
 * activity below answer the questions that follow a payout rather than
 * competing with it.
 *
 * Every shortcut here writes a line into the composer instead of opening a
 * form of its own. The composer's parser is the only thing that turns words
 * into a payout, so a shortcut that bypassed it would be a second, weaker way
 * to spend money. Filling the box leaves the person reading the sentence they
 * are about to send, and the confirm sheet still stands between it and money.
 *
 * Every figure comes from one /api/dashboard call over settled payouts, so
 * nothing here can disagree with the receipts.
 */
export function DashboardScreen({
  config,
  account,
  onSignOut,
}: {
  config: ServerConfig;
  account: StoredAccount;
  onSignOut: () => void;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [draft, setDraft] = useState<{ text: string; memo: string; nonce: number } | undefined>(
    undefined,
  );

  const refresh = useCallback(async (): Promise<void> => {
    const [dash, bal] = await Promise.allSettled([
      api.dashboard(account.address),
      getBalance(config, account.address),
    ]);
    if (dash.status === "fulfilled") setData(dash.value);
    else setError("Could not load your dashboard. The Remi server may not be running.");
    if (bal.status === "fulfilled") setBalance(bal.value);
  }, [account.address, config]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The counter, not the text, is what tells the composer a new line arrived —
  // picking the same payee twice has to fill the box twice.
  const compose = useCallback((text: string, memo = "") => {
    setDraft((previous) => ({ text, memo, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  const delta = data === null ? 0n : BigInt(data.monthDelta);
  const peak =
    data === null
      ? 0n
      : data.byMonth.reduce((max, m) => {
          const v = BigInt(m.total);
          return v > max ? v : max;
        }, 0n);

  // The people paid most recently, each once. Paying the same contractor again
  // next month is the common case, so they are the shortcuts worth having.
  const payees = useMemo(() => {
    if (data === null) return [];
    const seen = new Map<string, { label: string; amount: string }>();
    for (const payout of data.recent) {
      const label = payout.label.trim();
      if (label === "" || seen.has(label.toLowerCase())) continue;
      seen.set(label.toLowerCase(), { label, amount: payout.amount });
    }
    return [...seen.values()].slice(0, 4);
  }, [data]);

  const last = data?.recent[0] ?? null;
  const empty = data !== null && data.lifetime.payouts === 0;

  return (
    <main className="shell shell--home">
      <AppHeader config={config} account={account} onSignOut={onSignOut} />

      <header className="homehead">
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1>{account.label}</h1>
        </div>
      </header>

      {error !== null && <div className="notice notice-error">{error}</div>}

      <section className="balance" aria-label="Balance">
        <div className="balance__main">
          <span className="eyebrow">Available to send</span>
          <span className="balance__amount figure" data-pending={balance === null}>
            {balance === null ? "—" : `$${formatAmount(balance)}`}
          </span>
          <span className="balance__meta">
            {config.network === "mainnet" ? "Mainnet" : config.network === "local" ? "Local chain" : "Testnet"}
            {data !== null && data.lifetime.payouts > 0 && (
              <>
                {" · "}
                {data.lifetime.payouts} {data.lifetime.payouts === 1 ? "payout" : "payouts"} all time
                {" · "}
                {formatUsd(data.lifetime.total)} sent
              </>
            )}
          </span>
        </div>

        <div className="balance__actions">
          <button type="button" className="btn btn-primary" onClick={() => compose("Pay ")}>
            Pay someone
          </button>
          {config.faucet === true && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={funding}
              onClick={() => {
                setFunding(true);
                api
                  .fund(account.address)
                  .then(() => refresh())
                  .catch((caught: unknown) =>
                    setError(
                      caught instanceof Error ? caught.message : "Could not add test dollars.",
                    ),
                  )
                  .finally(() => setFunding(false));
              }}
            >
              {funding ? <span className="spinner" /> : "Add test dollars"}
            </button>
          )}
        </div>
      </section>

      {config.faucet === true && (balance === null || balance === 0n) && (
        <div className="notice notice-accent">
          <strong>This is a local chain.</strong> Your passkey account starts empty — add test
          dollars and gas above to try a payout.
        </div>
      )}

      <div className="homegrid">
        <div className="homemain">
          <section className="block" aria-label="Pay">
            <div className="sectionhead">
              <h2>Pay</h2>
              {payees.length > 0 && <a href="#/books">Everyone</a>}
            </div>

            {payees.length > 0 && (
              <div className="payrow">
                {last !== null && last.label.trim() !== "" && (
                  <button
                    type="button"
                    className="paytile paytile--repeat"
                    onClick={() =>
                      compose(
                        `Pay ${last.label} ${formatAmount(last.amount)}`,
                        last.memo.trim() || last.category,
                      )
                    }
                  >
                    <span className="paytile__top">Repeat</span>
                    <span className="paytile__name">{last.label}</span>
                    <span className="paytile__sub">{formatUsd(last.amount)}</span>
                  </button>
                )}
                {payees.map(({ label }) => (
                  <button
                    key={label}
                    type="button"
                    className="paytile"
                    onClick={() => compose(`Pay ${label} `)}
                  >
                    <span className="paytile__avatar" aria-hidden="true">
                      {label.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="paytile__name">{label}</span>
                    <span className="paytile__sub">Pay again</span>
                  </button>
                ))}
              </div>
            )}

            <Composer config={config} account={account} draft={draft} onSent={() => void refresh()} />
          </section>

          <section className="block" aria-label="Payment history">
            {data === null && error === null ? (
              <p className="hushed">
                <span className="spinner" /> Loading…
              </p>
            ) : (
              <PaymentHistory
                payouts={data?.recent ?? []}
                heading="Payment history"
                description="Your most recent payouts, each one backed by a receipt the recipient can verify."
                viewAllUrl={data !== null && data.recent.length > 0 ? "#/books" : undefined}
                csvUrl={data !== null && data.recent.length > 0 ? api.csvUrl(account.address) : undefined}
              />
            )}
          </section>
        </div>

        <aside className="homeside">
          {data !== null && (
            <>
              <div className="factgrid">
                <div className="fact">
                  <b>{formatUsd(data.monthTotal)}</b>
                  <span>{formatMonth(data.month)}</span>
                </div>
                <div className="fact">
                  <b className={delta > 0n ? "delta-up" : delta < 0n ? "delta-down" : undefined}>
                    {delta === 0n
                      ? "—"
                      : `${delta > 0n ? "+" : "−"}${formatUsd(delta > 0n ? delta : -delta)}`}
                  </b>
                  <span>vs {formatMonth(data.previousMonth ?? "")}</span>
                </div>
                <div className="fact">
                  <b>{data.people.contractors}</b>
                  <span>Contractors paid</span>
                </div>
                <div className="fact">
                  <b>{formatUsd(data.yearToDate.total)}</b>
                  <span>{data.yearToDate.year} to date</span>
                </div>
              </div>

              {data.needs1099.length > 0 && (
                <div className="notice notice-accent">
                  <strong>
                    {data.needs1099.length}{" "}
                    {data.needs1099.length === 1 ? "contractor needs" : "contractors need"} a 1099
                    for {data.yearToDate.year}.
                  </strong>{" "}
                  {data.needs1099.map((c) => `${c.label} (${formatUsd(c.total)})`).join(", ")}.{" "}
                  <a href="#/books">Open Books</a>
                </div>
              )}

              {data.approaching1099.length > 0 && (
                <div className="notice">
                  Close to the $600 filing threshold:{" "}
                  {data.approaching1099
                    .map((c) => `${c.label} needs ${formatUsd(c.remaining)} more`)
                    .join(", ")}
                  .
                </div>
              )}

              {!empty && (
                <section className="block">
                  <div className="sectionhead">
                    <h2>Last six months</h2>
                    <a href="#/books">Books</a>
                  </div>
                  <div className="chart">
                    {data.byMonth.map((m) => {
                      const value = BigInt(m.total);
                      const height = peak === 0n ? 0 : Number((value * 100n) / peak);
                      return (
                        <div
                          className="chart__col"
                          key={m.month}
                          data-empty={value === 0n}
                          data-current={m.month === data.month}
                          title={`${formatMonth(m.month)}: ${formatUsd(m.total)}`}
                        >
                          <span className="chart__track">
                            <span
                              className="chart__bar"
                              style={{ height: `${Math.max(height, value === 0n ? 2 : 6)}%` }}
                            />
                          </span>
                          <span className="chart__label">{m.month.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}

          <div className="quickrow">
            <a className="quick" href="#/books">
              <b>Books</b>
              <span>Categories, totals, CSV</span>
            </a>
            <a className="quick" href="#/passport">
              <b>My Passport</b>
              <span>What I have been paid</span>
            </a>
            {!empty && (
              <a className="quick" href={api.csvUrl(account.address)}>
                <b>Export CSV</b>
                <span>Every settled payout</span>
              </a>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
