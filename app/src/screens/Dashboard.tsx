import { useCallback, useEffect, useState } from "react";
import { api, type Dashboard, type ServerConfig } from "../lib/api.ts";
import type { StoredAccount } from "../lib/account.ts";
import { getBalance } from "../lib/payouts.ts";
import { formatAmount, formatDate, formatMonth, formatUsd } from "../lib/money.ts";
import { Composer } from "./Composer.tsx";
import { AppHeader } from "../components/AppHeader.tsx";

/**
 * The first screen after sign-in.
 *
 * Summary before detail: the money available, what this month cost against
 * last, and whatever needs attention — then the composer, then the activity it
 * produced. Every figure comes from one /api/dashboard call over settled
 * payouts, so nothing here can disagree with the receipts.
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

  const delta = data === null ? 0n : BigInt(data.monthDelta);
  const peak =
    data === null
      ? 0n
      : data.byMonth.reduce((max, m) => {
          const v = BigInt(m.total);
          return v > max ? v : max;
        }, 0n);

  return (
    <main className="shell">
      <AppHeader config={config} account={account} onSignOut={onSignOut} />

      <div className="dash">
        <div className="hero-figure">
          <span className="eyebrow">Available to send</span>
          <span className="amount">{balance === null ? "—" : `$${formatAmount(balance)}`}</span>
          <span className="sub">
            {account.label}
            {data !== null && data.lifetime.payouts > 0 && (
              <>
                {" · "}
                {data.lifetime.payouts} {data.lifetime.payouts === 1 ? "payout" : "payouts"} all
                time
              </>
            )}
          </span>
        </div>

        {error !== null && <div className="notice notice-error">{error}</div>}

        {config.faucet === true && (balance === null || balance === 0n) && (
          <div className="notice notice-accent">
            <strong>This is a local chain.</strong> Your passkey account starts empty — add test
            dollars and gas to try a payout.{" "}
            <button
              type="button"
              className="btn btn-accent"
              style={{ marginTop: "0.6rem" }}
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
          </div>
        )}

        <Composer config={config} account={account} onSent={() => void refresh()} />

        {data !== null && (
          <>
            <div className="factgrid">
              <div className="fact">
                <b>{formatUsd(data.monthTotal)}</b>
                <span>{formatMonth(data.month)}</span>
              </div>
              <div className="fact">
                <b className={delta > 0n ? "delta-up" : delta < 0n ? "delta-down" : undefined}>
                  {delta === 0n ? "—" : `${delta > 0n ? "+" : "−"}${formatUsd(delta > 0n ? delta : -delta)}`}
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
                  {data.needs1099.length === 1 ? "contractor needs" : "contractors need"} a 1099 for{" "}
                  {data.yearToDate.year}.
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

            {data.lifetime.payouts > 0 && (
              <section className="stack-sm">
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

            <div className="quickrow">
              <a className="quick" href="#/books">
                <b>Books</b>
                <span>Categories, totals, CSV</span>
              </a>
              <a className="quick" href="#/passport">
                <b>My Passport</b>
                <span>What I have been paid</span>
              </a>
            </div>

            <section className="stack-sm">
              <div className="sectionhead">
                <h2>Recent payouts</h2>
                {data.recent.length > 0 && <a href="#/books">All</a>}
              </div>

              {data.recent.length === 0 ? (
                <div className="empty">
                  <p>No payouts yet.</p>
                  <p className="small faint">
                    Your first one appears here, and on the recipient&rsquo;s Passport.
                  </p>
                </div>
              ) : (
                <div className="list">
                  {data.recent.map((payout) => (
                    <a className="rowlink" key={payout.receipt_no} href={`#/r/${payout.receipt_no}`}>
                      <span>
                        <span className="rowlink__name">
                          {payout.label || payout.payee.slice(0, 10)}
                        </span>
                        <span className="rowlink__meta">
                          {formatDate(payout.timestamp)} · {payout.category}
                          {payout.memo !== "" && ` · ${payout.memo}`}
                        </span>
                      </span>
                      <span className="figure">{formatUsd(payout.amount)}</span>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {data === null && error === null && (
          <p className="hushed">
            <span className="spinner" /> Loading…
          </p>
        )}
      </div>
    </main>
  );
}
