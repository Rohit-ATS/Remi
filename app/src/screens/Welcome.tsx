import { useState } from "react";
import { createAccount, describeError, signIn, type StoredAccount } from "../lib/account.ts";
import type { ServerConfig } from "../lib/api.ts";

export function Welcome({
  config,
  onSignedIn,
}: {
  config: ServerConfig;
  onSignedIn: (account: StoredAccount) => void;
}) {
  const [busy, setBusy] = useState<"create" | "signin" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const run = async (mode: "create" | "signin"): Promise<void> => {
    setBusy(mode);
    setError(null);
    try {
      const account =
        mode === "create" ? await createAccount(name.trim() || "My business") : await signIn();
      onSignedIn(account);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <span className="mark">Remi</span>
        {config.network === "testnet" && <span className="chip">Testnet</span>}
      </header>

      <div className="stack">
        <div>
          <h1>Pay in seconds. Prove it forever.</h1>
          <p className="hushed" style={{ marginTop: "0.7rem" }}>
            Pay your contractors abroad by saying one sentence. Every payout also writes them
            an income record they own — one they can show a landlord or a lender without handing
            over their client list.
          </p>
        </div>

        <div className="card stack-sm">
          <div className="field">
            <label htmlFor="business-name">Your business name</label>
            <input
              id="business-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Vista Design Studio"
              autoComplete="organization"
            />
          </div>
          <button
            type="button"
            className="btn btn-accent btn-block"
            onClick={() => void run("create")}
            disabled={busy !== null}
          >
            {busy === "create" ? <span className="spinner" /> : "Set up with Face ID"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => void run("signin")}
            disabled={busy !== null}
          >
            {busy === "signin" ? <span className="spinner" /> : "I already have an account"}
          </button>
        </div>

        {error !== null && <div className="notice notice-error">{error}</div>}

        <div className="receipt" aria-hidden="true">
          <p className="eyebrow">Your payouts appear here</p>
          <p className="receipt-amount faint" style={{ marginTop: "0.4rem" }}>
            $0.00
          </p>
          <p className="small faint" style={{ marginTop: "0.6rem" }}>
            No account number, no seed phrase, no password. The passkey on this device is the
            account.
          </p>
        </div>

        <p className="small faint">
          {config.network === "testnet"
            ? "Pointed at Monad testnet, so these are test dollars."
            : "Pointed at Monad mainnet. Payouts settle in real AUSD."}
        </p>
      </div>
    </main>
  );
}
