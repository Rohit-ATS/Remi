import { useEffect, useState } from "react";
import { api, type Books, type ServerConfig } from "../lib/api.ts";
import type { StoredAccount } from "../lib/account.ts";
import { formatMonth, formatUsd } from "../lib/money.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { Download } from "../site/primitives.tsx";

/**
 * Books.
 *
 * Every figure here is a view over payouts that already happened. There is no
 * bookkeeping to enter and no second source of truth, because the receipt the
 * payout wrote is the ledger entry.
 */
export function BooksScreen({
  config,
  account,
  onSignOut,
}: {
  config: ServerConfig;
  account: StoredAccount;
  onSignOut: () => void;
}) {
  const [books, setBooks] = useState<Books | null>(null);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .books(account.address, month)
      .then((result) => {
        if (!cancelled) setBooks(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Books could not be loaded.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [account.address, month]);

  const largest =
    books === null
      ? 0n
      : books.byCategory.reduce((max, row) => {
          const value = BigInt(row.total);
          return value > max ? value : max;
        }, 0n);

  const delta =
    books === null
      ? null
      : BigInt(books.monthTotal) - BigInt(books.previousMonthTotal);

  return (
    <main className="shell wide">
      <AppHeader config={config} account={account} onSignOut={onSignOut} />

      {error !== null && <div className="notice notice-error">{error}</div>}
      {books === null && error === null && (
        <p className="hushed">
          <span className="spinner" /> Adding it up…
        </p>
      )}

      {books !== null && (
        <div className="stack">
          <div className="spread">
            <h1>Books</h1>
            {books.months.length > 0 && (
              <select
                aria-label="Month"
                value={books.month}
                onChange={(event) => setMonth(event.target.value)}
                style={{ width: "auto" }}
              >
                {books.months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonth(m)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="card">
            <span className="eyebrow">{formatMonth(books.month)}</span>
            <p className="receipt-amount" style={{ marginTop: "0.3rem" }}>
              {formatUsd(books.monthTotal)}
            </p>
            <p className="small hushed" style={{ marginTop: "0.3rem" }}>
              {formatUsd(books.previousMonthTotal)} in {formatMonth(books.previousMonth)}
              {delta !== null && delta !== 0n && (
                <> · {delta > 0n ? "up" : "down"} {formatUsd(delta > 0n ? delta : -delta)}</>
              )}
            </p>
          </div>

          {books.byCategory.length > 0 && (
            <section className="stack-sm">
              <h2>By category</h2>
              <div className="bars">
                {books.byCategory.map((row) => (
                  <div className="bar" key={row.category}>
                    <span className="t">{row.category}</span>
                    <span className="track">
                      <span
                        className="fill"
                        style={{
                          width:
                            largest === 0n
                              ? "0%"
                              : `${Number((BigInt(row.total) * 100n) / largest)}%`,
                        }}
                      />
                    </span>
                    <span className="a">{formatUsd(row.total)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {books.byPayee.length > 0 && (
            <section className="stack-sm">
              <h2>By recipient</h2>
              <div className="list">
                {books.byPayee.map((row) => (
                  <div className="spread" key={`${row.label}-${row.payee}`}>
                    <span>
                      <strong>{row.label}</strong>
                      <br />
                      <span className="small hushed">
                        {row.count} {row.count === 1 ? "payout" : "payouts"}
                      </span>
                    </span>
                    <span className="figure">{formatUsd(row.total)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="stack-sm">
            <h2>Contractors, {books.yearToDate.year}</h2>
            <p className="small hushed">
              A US business must file a 1099-NEC for any contractor paid $600 or more in a calendar
              year. This is that list, ready in January rather than assembled in it.
            </p>
            {books.yearToDate.contractors.length === 0 ? (
              <div className="empty">
                <p className="small">No contractor payouts this year yet.</p>
              </div>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Contractor</th>
                      <th>Payouts</th>
                      <th>Paid this year</th>
                      <th>1099</th>
                    </tr>
                  </thead>
                  <tbody>
                    {books.yearToDate.contractors.map((row) => (
                      <tr key={row.payee}>
                        <td>{row.label}</td>
                        <td className="n">{row.count}</td>
                        <td className="n">{formatUsd(row.total)}</td>
                        <td>
                          {row.over1099 ? (
                            <span className="chip chip-accent">Required</span>
                          ) : (
                            <span className="chip">Under</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="small hushed">
              Year to date, all categories: <strong>{formatUsd(books.yearToDate.total)}</strong>
            </p>
          </section>

          <a className="btn btn-ghost" href={api.csvUrl(account.address)} download>
            <Download />
            Export for my accountant
          </a>
        </div>
      )}
    </main>
  );
}
