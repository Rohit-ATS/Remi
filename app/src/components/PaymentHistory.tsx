import { useState } from "react";
import type { Payout } from "../lib/api.ts";
import { formatDate, formatExact, formatUsd, shortAddress } from "../lib/money.ts";
import { routeHref } from "../lib/router.ts";
import { Sheet } from "../screens/Sheets.tsx";
import { Download } from "../site/primitives.tsx";

/**
 * Payment history, as a table.
 *
 * The shape is the billing-history pattern: a titled section, a bordered card
 * holding a header row and one row per payment, a status badge per row, an
 * action at the end of each row, and a way out to the full list. What it is
 * not is a list of invoices — every row here is a settled on-chain payout, so
 * the columns say what this product actually knows.
 *
 * The status badge only ever reports something true. A payout reaches this
 * table by being indexed from a settled transaction, so "Settled" is not a
 * state we track but a fact about every row. The one real distinction is
 * whether the payout counts toward the recipient's Passport, and that is the
 * only thing a second badge is allowed to mean.
 */
export function PaymentHistory({
  payouts,
  heading = "Payment history",
  description = "Every payout you have sent, with the receipt behind each one.",
  direction = "sent",
  viewAllUrl,
  csvUrl,
  emptyNote,
  explorer,
}: {
  payouts: Payout[];
  heading?: string;
  description?: string;
  /**
   * Which side of the payout this table is for. Sent money names the payee,
   * because that is the person the payer chose. Received money names the
   * payer — and only ever as an address, since a client's name is encrypted
   * under a key only the account holder can derive and a Passport is a
   * document made to be handed to someone else.
   */
  direction?: "sent" | "received";
  viewAllUrl?: string | undefined;
  csvUrl?: string | undefined;
  emptyNote?: string;
  /** Block explorer origin, when the network has one, for the transaction. */
  explorer?: string | null;
}) {
  const received = direction === "received";
  const [open, setOpen] = useState<Payout | null>(null);

  return (
    <section className="history" aria-label={heading}>
      <div className="history__head">
        <span className="history__badge">
          <CardIcon />
          Payments
        </span>
        <h2>{heading}</h2>
        <p className="history__desc">{description}</p>
      </div>

      {payouts.length === 0 ? (
        <div className="history__empty">
          <FileIcon />
          <p>No payments yet</p>
          <p className="small faint">
            {emptyNote ?? "Your first payout appears here, and on the recipient\u2019s Passport."}
          </p>
        </div>
      ) : (
        <div className="history__card">
          <div className="scroll">
            <table className="history__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>{received ? "From" : "Description"}</th>
                  <th className="n">Amount</th>
                  <th className="history__status">Status</th>
                  <th className="history__action">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.receipt_no}>
                    <td>
                      <span className="history__date">{formatDate(payout.timestamp)}</span>
                      <span className="history__no">
                        Receipt #{String(payout.receipt_no).padStart(4, "0")}
                      </span>
                    </td>
                    <td>
                      <span className={received ? "history__name mono" : "history__name"}>
                        {received
                          ? shortAddress(payout.payer)
                          : payout.label || `${payout.payee.slice(0, 10)}…`}
                      </span>
                      <span className="history__memo">
                        {payout.memo.trim() === "" ? payout.category : payout.memo}
                      </span>
                      {!payout.passport_eligible && (
                        <span className="history__flag">Off Passport</span>
                      )}
                    </td>
                    <td className="n figure">{formatUsd(payout.amount)}</td>
                    <td className="history__status">
                      <span className="badge badge--good">
                        <CheckIcon />
                        Settled
                      </span>
                      {!payout.passport_eligible && (
                        <span
                          className="badge badge--warn"
                          title="This payout does not count toward the recipient's Passport."
                        >
                          <ClockIcon />
                          Off Passport
                        </span>
                      )}
                    </td>
                    <td className="history__action">
                      {/* The whole receipt is already in this row's data, so
                          leaving the table to read it costs a page load and
                          the place in the list. It opens here instead, and
                          the full page stays one click further on for a link
                          worth sending someone. */}
                      <button
                        type="button"
                        className="iconbtn"
                        aria-label={`Receipt ${payout.receipt_no}`}
                        onClick={() => setOpen(payout)}
                      >
                        <ReceiptIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {payouts.length > 0 && (viewAllUrl !== undefined || csvUrl !== undefined) && (
        <div className="history__foot">
          {viewAllUrl !== undefined && (
            <a className="btn btn-ghost" href={viewAllUrl}>
              View all payments
            </a>
          )}
          {csvUrl !== undefined && (
            <a className="btn btn-ghost" href={csvUrl}>
              <Download size={14} />
              Download CSV
            </a>
          )}
        </div>
      )}
      {open !== null && (
        <ReceiptSheet
          payout={open}
          received={received}
          explorer={explorer ?? null}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

/**
 * One row's receipt, without leaving the table it was read from.
 *
 * The same card the receipt page prints — stamp, torn edge and all — because
 * a receipt is the product's native object and it should not arrive as a
 * summary of itself. It lands in the middle of the screen rather than rising
 * from the bottom edge: nothing here is waiting to be acted on, it is a thing
 * being handed over to be read.
 */
function ReceiptSheet({
  payout,
  received,
  explorer,
  onClose,
}: {
  payout: Payout;
  received: boolean;
  explorer: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const share = async (): Promise<void> => {
    const url = `${location.origin}${routeHref(`/r/${payout.receipt_no}`)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copying can be blocked; the full receipt below is still a way out.
    }
  };

  return (
    <Sheet
      label={`Receipt ${payout.receipt_no}`}
      dismissible
      placement="centre"
      onClose={onClose}
    >
      <div className="receipt">
        <div className="spread" style={{ alignItems: "flex-start" }}>
          <span className="eyebrow">
            Receipt {String(payout.receipt_no).padStart(4, "0")}
          </span>
          <span className="paid stamp-in">PAID</span>
        </div>

        <p className="receipt-amount" style={{ marginTop: "0.9rem" }}>
          {formatUsd(payout.amount)}
        </p>
        <p className="hushed" style={{ marginTop: "0.2rem" }}>
          {received ? "from" : "to"}{" "}
          {received ? shortAddress(payout.payer) : payout.label || shortAddress(payout.payee)}
        </p>

        <dl style={{ margin: "1.1rem 0 0" }}>
          <div className="kv">
            <dt>Settled</dt>
            <dd>{formatDate(payout.timestamp)}</dd>
          </div>
          {payout.memo.trim() !== "" && (
            <div className="kv">
              <dt>For</dt>
              <dd>{payout.memo}</dd>
            </div>
          )}
          <div className="kv">
            <dt>Category</dt>
            <dd>{payout.category}</dd>
          </div>
          <div className="kv">
            <dt>Exact amount</dt>
            <dd>{formatExact(payout.amount)}</dd>
          </div>
          <div className="kv">
            <dt>{received ? "From" : "To"}</dt>
            <dd>{shortAddress(received ? payout.payer : payout.payee)}</dd>
          </div>
          <div className="kv">
            <dt>Passport</dt>
            <dd>{payout.passport_eligible ? "On the record" : "Off Passport"}</dd>
          </div>
        </dl>

        {explorer !== null && (
          <p className="small" style={{ marginTop: "1rem" }}>
            <a href={`${explorer}/tx/${payout.tx_hash}`} target="_blank" rel="noreferrer noopener">
              Verify this payout
            </a>
          </p>
        )}
      </div>

      <div className="row">
        <button type="button" className="btn btn-ghost" onClick={() => void share()}>
          {copied ? "Link copied" : "Share receipt"}
        </button>
        <a className="btn btn-ghost" href={routeHref(`/r/${payout.receipt_no}`)}>
          Open the full receipt
        </a>
      </div>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Close
      </button>
    </Sheet>
  );
}

/* Same 16px grid and 1.4 stroke as the rest of the product's icons. */

function CardIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.8" y="3.6" width="12.4" height="8.8" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.8 6.6h12.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="m5.6 8.2 1.7 1.7 3.1-3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.8V8l2.2 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9 1.9H4.6a1.6 1.6 0 0 0-1.6 1.6v9a1.6 1.6 0 0 0 1.6 1.6h6.8a1.6 1.6 0 0 0 1.6-1.6V5.8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9 1.9v3.9h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.4 2.2h9.2v11.6l-1.8-1.1-1.8 1.1-1.8-1.1-1.8 1.1-1.8-1.1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 5.6h4M6 8.2h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
