import { useCallback, useEffect, useState } from "react";
import { api, type Dashboard, type ServerConfig } from "../lib/api.ts";
import type { StoredAccount } from "../lib/account.ts";
import { getBalance } from "../lib/payouts.ts";
import { formatAmount, formatMonth, formatUsd } from "../lib/money.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { DueDates } from "../components/DueDates.tsx";
import { navigate, routeHref } from "../lib/router.ts";

/**
 * Home.
 *
 * Money first, then what is owed, then what moving it produced. The balance
 * is the top of the screen because paying someone is the one thing this app
 * is for; the figures, the chart and the activity below answer the questions
 * that follow a payout rather than competing with it.
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

  // The payee shortcuts that used to live here went with the Pay card. They
  // are on the payments screen, next to the composer that consumes them.
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
          <a className="btn btn-primary" href={routeHref("/pay")}>
            Pay someone
          </a>
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
          {/* The calendar, not the Pay card. Paying starts from the button on
              the balance above, and the payee shortcuts this card used to
              hold are on the payments screen beside the composer that uses
              them. What Home was missing was the other half: what is coming,
              and when. */}
          <section className="block" aria-label="Due dates">
            <div className="sectionhead">
              <h2>Due dates</h2>
              <a href={routeHref("/pay")}>Pay someone</a>
            </div>
            <DueDates
              account={account}
              network={config.network}
              onPay={(occurrence) =>
                navigate(
                  payHref({
                    to: occurrence.reminder.label,
                    ...(occurrence.reminder.amount === null
                      ? {}
                      : { amount: formatAmount(occurrence.reminder.amount) }),
                    memo: occurrence.reminder.note,
                  }),
                )
              }
            />
          </section>

        </div>

        <aside className="homeside">
          {/* Where an opened calendar day lands, in place of the summary. */}
          <div id="day-detail" />

          <div className="homeside__summary">
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
                  <a href={routeHref("/books")}>Open Books</a>
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
                    <a href={routeHref("/books")}>Books</a>
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
            <a className="quick" href={routeHref("/books")}>
              <b>Books</b>
              <span>Categories, totals, CSV</span>
            </a>
            <a className="quick" href={routeHref("/passport")}>
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

/** A link into the payments screen with the composer already started. */
function payHref(seed: { to: string; amount?: string; memo?: string }): string {
  const query = new URLSearchParams({ to: seed.to });
  // Group separators are for reading, not for URLs; the parser is happy either
  // way, but the link people see and paste should be plain.
  if (seed.amount !== undefined) query.set("amount", seed.amount.replace(/,/g, ""));
  if (seed.memo !== undefined && seed.memo !== "") query.set("memo", seed.memo);
  return routeHref(`/pay?${query.toString()}`);
}
