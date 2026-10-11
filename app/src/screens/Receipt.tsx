import { useEffect, useState } from "react";
import { api, type Payout, type ServerConfig } from "../lib/api.ts";
import type { StoredAccount } from "../lib/account.ts";
import { formatDate, formatExact, formatUsd, shortAddress } from "../lib/money.ts";
import { AppHeader } from "../components/AppHeader.tsx";

/**
 * A settled payout.
 *
 * This screen is public. It is the link the payer shares, and the recipient
 * opens it with no account, no sign-in and no app install — which is the first
 * step of the loop that gets the recipient onto Remi at all.
 */
export function ReceiptScreen({
  receiptNo,
  config,
  account,
}: {
  receiptNo: number;
  config: ServerConfig | null;
  account: StoredAccount | null;
}) {
  const [receipt, setReceipt] = useState<Payout | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const load = (): void => {
      api
        .receipt(receiptNo)
        .then((result) => {
          if (cancelled) return;
          setReceipt(result.receipt);
          setVerifyUrl(result.verifyUrl);
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          // The server indexes only finalized blocks. Retry briefly so a sender
          // can still follow the immediate receipt link without a public RPC
          // trigger or presenting a provisional chain record as final.
          if (caught instanceof Error && caught.message === "no such receipt" && attempts < 15) {
            attempts += 1;
            retry = setTimeout(load, 1000);
            return;
          }
          setError(
            caught instanceof Error && caught.message === "no such receipt"
              ? "This payout is still waiting for network finality. Please try the link again shortly."
              : "That receipt could not be loaded.",
          );
        });
    };
    load();
    return () => {
      cancelled = true;
      if (retry !== null) clearTimeout(retry);
    };
  }, [receiptNo]);

  const share = async (): Promise<void> => {
    const url = `${location.origin}${location.pathname}#/r/${receiptNo}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in some contexts; the link is in the address
      // bar either way, so this is not worth an error message.
      setCopied(false);
    }
  };

  const isRecipient =
    account !== null &&
    receipt !== null &&
    account.address.toLowerCase() === receipt.payee.toLowerCase();

  return (
    <main className="shell">
      <AppHeader config={config} account={account} />

      {error !== null && <div className="notice notice-error">{error}</div>}

      {receipt === null && error === null && (
        <p className="hushed">
          <span className="spinner" /> Loading receipt…
        </p>
      )}

      {receipt !== null && (
        <div className="stack">
          <div className="receipt">
            <div className="spread" style={{ alignItems: "flex-start" }}>
              <span className="eyebrow">Receipt {String(receipt.receipt_no).padStart(4, "0")}</span>
              <span className="paid stamp-in">PAID</span>
            </div>

            <p className="receipt-amount" style={{ marginTop: "0.9rem" }}>
              {formatUsd(receipt.amount)}
            </p>
            <p className="hushed" style={{ marginTop: "0.2rem" }}>
              to {receipt.label || shortAddress(receipt.payee)}
            </p>

            <dl style={{ margin: "1.1rem 0 0" }}>
              <div className="kv">
                <dt>Settled</dt>
                <dd>{formatDate(receipt.timestamp)}</dd>
              </div>
              {receipt.memo !== "" && (
                <div className="kv">
                  <dt>For</dt>
                  <dd>{receipt.memo}</dd>
                </div>
              )}
              <div className="kv">
                <dt>Category</dt>
                <dd>{receipt.category}</dd>
              </div>
              <div className="kv">
                <dt>Exact amount</dt>
                <dd>{formatExact(receipt.amount)}</dd>
              </div>
              <div className="kv">
                <dt>From</dt>
                <dd>{shortAddress(receipt.payer)}</dd>
              </div>
            </dl>

            {verifyUrl !== null && (
              <p className="small" style={{ marginTop: "1rem" }}>
                <a href={verifyUrl} target="_blank" rel="noreferrer noopener">
                  Verify this payout
                </a>
              </p>
            )}
          </div>

          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => void share()}>
              {copied ? "Link copied" : "Share receipt"}
            </button>
            <a className="btn btn-ghost" href={`#/p/${receipt.payee}`}>
              {isRecipient ? "My Passport" : "Recipient's Passport"}
            </a>
          </div>

          {account === null && (
            <div className="panel stack-sm">
              <p className="eyebrow">For the person who was paid</p>
              <h2 style={{ color: "inherit" }}>This payout is already part of your record.</h2>
              <p className="hushed">
                Every payout you receive through Remi adds to an income history you own — across
                every client, not just this one. Set up with Face ID to claim it.
              </p>
              <a className="btn btn-accent" href="#/">
                Claim my Passport
              </a>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
