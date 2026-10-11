import type { Payout } from "../lib/api.ts";
import { formatDate, formatUsd, shortAddress } from "../lib/money.ts";
import { routeHref } from "../lib/router.ts";

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
}) {
  const received = direction === "received";

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
                      <a
                        className="iconbtn"
                        href={routeHref(`/r/${payout.receipt_no}`)}
                        aria-label={`Open receipt ${payout.receipt_no}`}
                      >
                        <ReceiptIcon />
                      </a>
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
              <DownloadIcon />
              Download CSV
            </a>
          )}
        </div>
      )}
    </section>
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

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.4v7.2M5.2 7l2.8 2.8L10.8 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 11.8v.6a1.4 1.4 0 0 0 1.4 1.4h7.6a1.4 1.4 0 0 0 1.4-1.4v-.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
