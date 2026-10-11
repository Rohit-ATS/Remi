import type { ServerConfig } from "../lib/api.ts";
import type { StoredAccount } from "../lib/account.ts";
import { Wordmark } from "../site/primitives.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

/**
 * The product's top bar, once instead of five times.
 *
 * It carries the same wordmark the landing page opens with, so arriving in the
 * dashboard reads as walking further into one thing rather than landing on a
 * second website. A signed-in person's mark returns them to their dashboard; a
 * guest reading a shared receipt gets the landing page, which is the first
 * step of the loop that brings them on.
 */
export function AppHeader({
  config,
  account,
  onSignOut,
}: {
  config: ServerConfig | null;
  account?: StoredAccount | null;
  onSignOut?: (() => void) | undefined;
}) {
  const signedIn = account !== null && account !== undefined;

  return (
    <header className="topbar">
      <span className="mark">
        <a href={signedIn ? "#/app" : "#/"} aria-label="Remi home">
          <Wordmark />
        </a>
      </span>

      {config !== null && config.network !== "mainnet" && (
        <span className="chip">{config.network === "local" ? "Local" : "Testnet"}</span>
      )}

      <ThemeToggle />

      {signedIn && onSignOut !== undefined && (
        <button type="button" className="chip" onClick={onSignOut}>
          Sign out
        </button>
      )}
    </header>
  );
}
