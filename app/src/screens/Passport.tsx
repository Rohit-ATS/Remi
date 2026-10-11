import { useEffect, useState } from "react";
import { api, type Assessment, type Payout, type ServerConfig } from "../lib/api.ts";
import type { StoredAccount } from "../lib/account.ts";
import { formatDate, formatMonth, formatUsd, shortAddress } from "../lib/money.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { PaymentHistory } from "../components/PaymentHistory.tsx";

/**
 * The Passport: a worker's own income record.
 *
 * This is the half of a payout that no payroll product ships. The business got
 * a receipt and a bookkeeping entry; the worker gets a verifiable earnings
 * history that spans every client who has ever paid them, which is the thing a
 * landlord, a lender or a visa officer actually asks for and the thing a bank
 * statement in the wrong currency cannot provide.
 *
 * Every figure comes from `assess()` on the server, computed from settled
 * payouts. Nothing here is a model's opinion.
 */
export function PassportScreen({
  address,
  config,
  account,
  shared = false,
  onSignOut,
}: {
  address: string;
  config: ServerConfig | null;
  account: StoredAccount | null;
  shared?: boolean;
  /** Absent on a shared Passport, which has no session to end. */
  onSignOut?: (() => void) | undefined;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .passport(address)
      .then((result) => {
        if (cancelled) return;
        setAssessment(result.assessment);
        setPayouts(result.payouts);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "That record could not be loaded.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const share = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/p/${address}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const isOwn = account !== null && account.address.toLowerCase() === address.toLowerCase();
  const isProductionCredential = config?.network === "mainnet";
  const peak =
    assessment === null
      ? 0n
      : assessment.byMonth.reduce((max, row) => {
          const value = BigInt(row.total);
          return value > max ? value : max;
        }, 0n);

  return (
    <main className="shell wide">
      <AppHeader config={config} account={shared ? null : account} onSignOut={onSignOut} />

      {error !== null && <div className="notice notice-error">{error}</div>}
      {assessment === null && error === null && (
        <p className="hushed">
          <span className="spinner" /> Reading the record…
        </p>
      )}

      {assessment !== null && (
        <div className="stack">
          <div>
            <h1>{isOwn ? "Your income record" : "Income record"}</h1>
            <p className="hushed small mono" style={{ marginTop: "0.4rem" }}>
              {shortAddress(address)}
            </p>
          </div>

          {assessment.payoutCount === 0 ? (
            <div className="empty">
              <p>No payouts have been received at this address yet.</p>
              <p className="small faint">
                A record starts with the first payout and grows with every client who pays into it.
              </p>
            </div>
          ) : (
            <>
              <div className="notice notice-accent">
                {isProductionCredential
                  ? "This Passport includes settlements only from administrator-attested payers. Transfers from other wallets still settle, but cannot be used to create an income credential."
                  : "This is a test record. Testnet and local payments, including DemoUSD, cannot be used for underwriting."}
              </div>
              <div className="panel stack">
                <div className="spread">
                  <span className="eyebrow">
                    {isProductionCredential ? "Verified earnings" : "Testnet activity"}
                  </span>
                  <span className="chip chip-accent">
                    {assessment.payoutCount} {assessment.payoutCount === 1 ? "record" : "records"}
                  </span>
                </div>

                <p className="receipt-amount">{formatUsd(assessment.totalEarned)}</p>

                <dl style={{ margin: 0 }}>
                  <div className="kv">
                    <dt>Clients</dt>
                    <dd>{assessment.clientCount}</dd>
                  </div>
                  <div className="kv">
                    <dt>Months active</dt>
                    <dd>
                      {assessment.monthsActive} of {assessment.monthsObserved}
                    </dd>
                  </div>
                  <div className="kv">
                    <dt>Median month</dt>
                    <dd>{formatUsd(assessment.medianMonthly)}</dd>
                  </div>
                  {assessment.firstPaidAt !== null && (
                    <div className="kv">
                      <dt>First paid</dt>
                      <dd>{formatDate(assessment.firstPaidAt)}</dd>
                    </div>
                  )}
                </dl>

                {assessment.byMonth.length > 0 && (
                  <div className="bars">
                    {assessment.byMonth.slice(-6).map((row) => (
                      <div className="bar" key={row.month}>
                        <span className="t">{row.month}</span>
                        <span className="track">
                          <span
                            className="fill"
                            style={{
                              width:
                                peak === 0n
                                  ? "0%"
                                  : `${Number((BigInt(row.total) * 100n) / peak)}%`,
                            }}
                          />
                        </span>
                        <span className="a">{formatUsd(row.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isProductionCredential && <section className="card stack-sm">
                <span className="eyebrow">Income stability</span>
                <div className="score">
                  <b>{assessment.stabilityScore}</b>
                  <span className="hushed small">/ 100</span>
                </div>
                <p className="small hushed">
                  Steadiness of this income, not its size. Computed from settled payouts —
                  regularity, attested clients, how much of the period was covered, and how long
                  the record runs.
                </p>
                <ul className="small hushed" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {assessment.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>

                {assessment.signals.confidence >= 1 && (
                  <div className="notice notice-accent" style={{ marginTop: "0.4rem" }}>
                    An advance of up to{" "}
                    <strong>{formatUsd(assessment.advanceCeiling)}</strong> would be supportable
                    against this record. Remi does not lend — this is what the record is worth to
                    someone who does.
                  </div>
                )}
              </section>}

              {assessment.byClient.length > 0 && (
                <section className="stack-sm">
                  <h2>Where it came from</h2>
                  <div className="list">
                    {assessment.byClient.map((client) => (
                      <div className="spread" key={client.payer}>
                        <span>
                          <strong className="mono">{shortAddress(client.payer)}</strong>
                          <br />
                          <span className="small hushed">
                            {client.count} {client.count === 1 ? "payout" : "payouts"} ·{" "}
                            {Math.round(client.share * 100)}% of earnings
                          </span>
                        </span>
                        <span className="figure">{formatUsd(client.total)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="small faint">
                    Clients appear as addresses. Their names are encrypted under a key only the
                    account holder can derive, so a record can be shown without exposing who it
                    was shown about.
                  </p>
                </section>
              )}

              <PaymentHistory
                payouts={payouts}
                direction="received"
                heading="Payment history"
                description={
                  shared
                    ? "Every payment received at this address, each one backed by a receipt that can be checked against the chain."
                    : "Everything you have been paid, each one backed by a receipt anyone you show it to can verify."
                }
                emptyNote="Payments received at this address appear here."
              />

              {!shared && (
                <div className="stack-sm">
                  <button type="button" className="btn btn-primary" onClick={() => void share()}>
                    {copied ? "Link copied" : "Share this record"}
                  </button>
                  <p className="small faint">
                    Anyone with the link can check the amounts and dates against the chain. They
                    cannot see your clients&rsquo; names, and nothing on the link reveals who you
                    work for.
                  </p>
                </div>
              )}

              {shared && (
                <p className="small faint">
                  Every figure on this page traces to a settled payout that anyone can verify
                  independently.{assessment.byMonth[0]?.month ? ` ${formatMonth(assessment.byMonth[0].month)} onward.` : ""}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
