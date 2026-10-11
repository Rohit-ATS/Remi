import { useState } from "react";
import {
  createAccount,
  createDemoAccount,
  describeError,
  signIn,
  type StoredAccount,
} from "../lib/account.ts";
import type { ServerConfig } from "../lib/api.ts";
import { navigate, routeHref, signInHref } from "../lib/router.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { Check } from "../site/primitives.tsx";

/**
 * The door between the landing page and the dashboard.
 *
 * It is one screen with two modes rather than two screens, because a passkey
 * makes signing up and signing in the same gesture — the only real difference
 * is whether a name is being claimed. Which mode opens, and the email the
 * landing page already collected, both arrive in the route.
 *
 * `next` is where the person was heading before they were asked to
 * authenticate, so a link to /books does not dump them on the dashboard.
 */
export function SignIn({
  config,
  mode,
  email,
  next,
  onSignedIn,
}: {
  config: ServerConfig | null;
  mode: "create" | "signin";
  email: string | null;
  next: string;
  onSignedIn: (account: StoredAccount) => void;
}) {
  const [busy, setBusy] = useState<"create" | "signin" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An email from the hero is a reasonable first guess at the business name,
  // and a filled field is faster to correct than an empty one to complete.
  const [name, setName] = useState(email === null ? "" : businessNameFrom(email));

  const run = async (which: "create" | "signin" | "demo"): Promise<void> => {
    setBusy(which);
    setError(null);
    try {
      const account =
        which === "create"
          ? await createAccount(name.trim() || "My business")
          : which === "signin"
            ? await signIn()
            : createDemoAccount(name.trim() || "Demo business");
      onSignedIn(account);
      navigate(next);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  };

  const creating = mode === "create";

  return (
    <main className="shell">
      <AppHeader config={config} />

      <div className="stack">
        <div>
          <p className="eyebrow">{creating ? "Set up" : "Welcome back"}</p>
          <h1 style={{ marginTop: "0.5rem" }}>
            {creating ? "Pay in seconds. Prove it forever." : "Sign in with your passkey."}
          </h1>
          <p className="hushed" style={{ marginTop: "0.7rem" }}>
            {creating
              ? "Pay your contractors abroad by saying one sentence. Every payout also writes them an income record they own — one they can show a landlord or a lender without handing over their client list."
              : "The passkey on this device is the account. There is nothing else to remember."}
          </p>
        </div>

        <div className="card stack-sm">
          {creating && (
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
          )}

          <button
            type="button"
            className="btn btn-accent btn-block"
            onClick={() => void run(creating ? "create" : "signin")}
            disabled={busy !== null}
          >
            {busy === (creating ? "create" : "signin") ? (
              <span className="spinner" />
            ) : creating ? (
              "Set up with Face ID"
            ) : (
              "Continue with Face ID"
            )}
          </button>

          <a
            className="btn btn-ghost btn-block"
            href={signInHref({ mode: creating ? "signin" : "create", next })}
          >
            {creating ? "I already have an account" : "Set up a new business"}
          </a>
        </div>

        {/* The way in when Face ID is not on offer: a machine without a
            platform authenticator, a browser whose password manager has no PRF
            extension, or a demo on a borrowed laptop. It is a real account on
            the same chain — only its key sits in this browser rather than
            behind a face, which is why it says so plainly. */}
        <div className="card stack-sm">
          <button
            type="button"
            className="btn btn-soft btn-block"
            onClick={() => void run("demo")}
            disabled={busy !== null}
          >
            {busy === "demo" ? <span className="spinner" /> : "Skip Face ID — open a demo account"}
          </button>
          <p className="small faint" style={{ margin: 0 }}>
            No passkey. The key is generated here and kept in this browser, so use it to look
            around, not to hold real money.
          </p>
        </div>

        {error !== null && <div className="notice notice-error">{error}</div>}

        <ul className="signin-points">
          <li>
            <Check /> No seed phrase, no extension, no custody account
          </li>
          <li>
            <Check /> Both of your keys come back from the same Face ID on a new phone
          </li>
          <li>
            <Check /> Remi never holds a key and never takes custody of funds
          </li>
        </ul>

        <p className="small faint">
          {config === null
            ? "Checking which network this Remi is pointed at…"
            : config.network === "local"
              ? "Pointed at a local chain, so these are test dollars."
              : config.network === "testnet"
                ? "Pointed at Monad testnet, so these are test dollars."
                : "Pointed at Monad mainnet. Payouts settle in real AUSD."}
        </p>

        <p className="small">
          <a href={routeHref("/")}>Back to the home page</a>
        </p>
      </div>
    </main>
  );
}

/** "maria@vistadesign.co" -> "Vistadesign". A guess, and an editable one. */
function businessNameFrom(email: string): string {
  const domain = email.split("@")[1] ?? "";
  const label = domain.split(".")[0] ?? "";
  if (label === "" || /^(gmail|outlook|hotmail|yahoo|icloud|proton|protonmail|me|mac)$/i.test(label)) {
    return "";
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}
