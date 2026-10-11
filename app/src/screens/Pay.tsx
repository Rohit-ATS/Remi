import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Dashboard, type ServerConfig } from "../lib/api.ts";
import type { StoredAccount } from "../lib/account.ts";
import { getBalance } from "../lib/payouts.ts";
import { formatAmount, formatUsd, shortAddress } from "../lib/money.ts";
import { Composer } from "./Composer.tsx";
import { AppHeader } from "../components/AppHeader.tsx";
import { DueDates } from "../components/DueDates.tsx";
import { routeHref } from "../lib/router.ts";

/**
 * Payments: both directions in one place.
 *
 * Sending and receiving are the same event seen from either end, so they live
 * behind one switch rather than on two screens. Sending is the composer and
 * the people most recently paid. Receiving is an address and the ways to hand
 * it over — there is nothing to fill in, because a payment arrives when
 * somebody else sends it, and pretending otherwise with a "request" button
 * that only copies a link would be a promise the product cannot keep.
 *
 * What the composer starts with comes from the URL, so a shortcut on another
 * screen is an ordinary link and the result can be pasted or reloaded.
 */
export function PayScreen({
  config,
  account,
  onSignOut,
  to,
  amount,
  memo,
}: {
  config: ServerConfig;
  account: StoredAccount;
  onSignOut: () => void;
  to: string | null;
  amount: string | null;
  memo: string | null;
}) {
  const [tab, setTab] = useState<"send" | "receive" | "due">("send");
  const [data, setData] = useState<Dashboard | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const [draft, setDraft] = useState<{ text: string; memo: string; nonce: number } | undefined>(
    undefined,
  );

  const refresh = useCallback(async (): Promise<void> => {
    const [dash, bal] = await Promise.allSettled([
      api.dashboard(account.address),
      getBalance(config, account.address),
    ]);
    if (dash.status === "fulfilled") setData(dash.value);
    else setError("Could not load your payments. The Remi server may not be running.");
    if (bal.status === "fulfilled") setBalance(bal.value);
  }, [account.address, config]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A link that arrives with someone named opens on Send with the line already
  // written. The URL is the only input, so landing here from a shortcut and
  // landing here from a pasted link behave identically.
  useEffect(() => {
    if (to === null && amount === null && memo === null) return;
    const line = `Pay ${to ?? ""}${amount === null ? "" : ` ${amount}`}`.trimEnd();
    setTab("send");
    setDraft((previous) => ({
      text: to === null && amount === null ? "Pay " : `${line} `,
      memo: memo ?? "",
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  }, [to, amount, memo]);

  const compose = useCallback((text: string, description = "") => {
    setTab("send");
    setDraft((previous) => ({ text, memo: description, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  const payees = useMemo(() => {
    if (data === null) return [];
    const seen = new Map<string, { label: string; amount: string }>();
    for (const payout of data.recent) {
      const label = payout.label.trim();
      if (label === "" || seen.has(label.toLowerCase())) continue;
      seen.set(label.toLowerCase(), { label, amount: payout.amount });
    }
    return [...seen.values()].slice(0, 6);
  }, [data]);

  const last = data?.recent[0] ?? null;

  const copy = async (what: "address" | "link", value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Copying is blocked in this browser. Select the text and copy it by hand.");
    }
  };

  const passportLink = `${location.origin}${routeHref(`/p/${account.address}`)}`;

  return (
    <main className="shell shell--home">
      <AppHeader config={config} account={account} onSignOut={onSignOut} />

      {/* This screen is reached from the button on Home rather than from the
          section navigation, so it carries its own way back. */}
      <header className="homehead">
        <div>
          <a className="backlink" href={routeHref("/app")}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 3.2 5.2 8l4.8 4.8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Home
          </a>
          <h1>Send and receive</h1>
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
            {account.label} · {shortAddress(account.address)}
          </span>
        </div>

        {config.faucet === true && (
          <div className="balance__actions">
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
          </div>
        )}
      </section>

      {/* One switch, two directions. The indicator slides for the same reason
          the section bar's does: it shows which way you just moved. */}
      <div className="segmented" role="tablist" aria-label="Payments">
        <span className="segmented__indicator" data-at={tab} aria-hidden="true" />
        {(["send", "receive", "due"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className="segmented__tab"
            onClick={() => setTab(name)}
          >
            {name === "due" ? "Due dates" : name}
          </button>
        ))}
      </div>

      <div className="homegrid">
        <div className="homemain">
          {tab === "due" && (
            <section className="block" aria-label="Due dates">
              <div className="sectionhead">
                <h2>Due dates</h2>
              </div>
              <DueDates
                account={account}
                onPay={(occurrence) =>
                  compose(
                    `Pay ${occurrence.reminder.label}${
                      occurrence.reminder.amount === null
                        ? ""
                        : ` ${formatAmount(occurrence.reminder.amount)}`
                    } `,
                    occurrence.reminder.note,
                  )
                }
              />
            </section>
          )}

          {tab === "send" ? (
            <section className="block" aria-label="Send a payment">
              <div className="sectionhead">
                <h2>Send</h2>
                {payees.length > 0 && <a href={routeHref("/books")}>Everyone</a>}
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

              <Composer
                config={config}
                account={account}
                draft={draft}
                onSent={() => void refresh()}
              />
            </section>
          ) : tab === "receive" ? (
            <section className="block" aria-label="Receive a payment">
              <div className="sectionhead">
                <h2>Receive</h2>
              </div>

              {/* Two things to hand out, and the difference between them is the
                  only thing worth saying: one takes money in, the other proves
                  what came in. The paragraph that used to open this panel said
                  it a third time, before either field had been seen. */}
              <div className="field">
                <label htmlFor="receive-address">Your address</label>
                <div className="inputrow">
                  <input id="receive-address" value={account.address} readOnly className="mono" />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void copy("address", account.address)}
                  >
                    {copied === "address" ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="field__hint">Give this to whoever is paying you.</p>
              </div>

              <div className="field">
                <label htmlFor="receive-link">Your Passport link</label>
                <div className="inputrow">
                  <input id="receive-link" value={passportLink} readOnly />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void copy("link", passportLink)}
                  >
                    {copied === "link" ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="field__hint">
                  Proof of what you have been paid. Amounts and dates only, never your
                  clients&rsquo; names.
                </p>
              </div>

              <div className="quickrow">
                <a className="quick" href={routeHref("/passport")}>
                  <b>My Passport</b>
                </a>
                {config.explorer !== null && (
                  <a
                    className="quick"
                    href={`${config.explorer}/address/${account.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <b>View on explorer</b>
                  </a>
                )}
              </div>
            </section>
          ) : null}

        </div>

        <aside className="homeside">
          {/* Where an opened calendar day lands. It is filled from Due dates,
              and while it holds something the summary below steps aside —
              the column is one column, and the day is what was just asked
              for. */}
          <div id="day-detail" />

          <div className="homeside__summary">
          {data !== null && (
            <div className="factgrid">
              <div className="fact">
                <b>{formatUsd(data.monthTotal)}</b>
                <span>Sent this month</span>
              </div>
              <div className="fact">
                <b>{data.people.payees}</b>
                <span>People paid</span>
              </div>
              <div className="fact">
                <b>{data.lifetime.payouts}</b>
                <span>Payouts all time</span>
              </div>
              <div className="fact">
                <b>{formatUsd(data.lifetime.total)}</b>
                <span>Sent all time</span>
              </div>
            </div>
          )}

          <div className="quickrow">
            <a className="quick" href={routeHref("/books")}>
              <b>Books</b>
              <span>Categories, totals, CSV</span>
            </a>
            <a className="quick" href={routeHref("/passport")}>
              <b>Payment history</b>
              <span>Sent and received</span>
            </a>
            <a className="quick" href={routeHref("/app")}>
              <b>Home</b>
              <span>Balance and summary</span>
            </a>
          </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
