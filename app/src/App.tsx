import { useCallback, useEffect, useState } from "react";
import { api, apiIsUnconfigured, type ServerConfig } from "./lib/api.ts";
import { getStoredAccount, signOut, type StoredAccount } from "./lib/account.ts";
import { GATED, navigate, signInHref, useRoute, useScrollReset, type Route } from "./lib/router.ts";
import { AppHeader } from "./components/AppHeader.tsx";
import { SideNav, TabBar } from "./components/Nav.tsx";
import { Landing } from "./screens/Landing.tsx";
import { Docs } from "./screens/Docs.tsx";
import { SignIn } from "./screens/SignIn.tsx";
import { DashboardScreen } from "./screens/Dashboard.tsx";
import { PayScreen } from "./screens/Pay.tsx";
import { BooksScreen } from "./screens/Books.tsx";
import { PassportScreen } from "./screens/Passport.tsx";
import { ReceiptScreen } from "./screens/Receipt.tsx";

/**
 * One app: landing page, sign-in and product behind a single router.
 *
 * The ordering below is the whole access model, and it reads top to bottom.
 * The public surfaces come first, because a shared receipt and a shared
 * Passport are the links a contractor is sent and asking them to sign up to
 * read one would defeat the point. The landing page is next, and it renders
 * whether or not the server is reachable. Only then does the config gate apply,
 * because only the product needs a server to mean anything.
 */
export function App() {
  const route = useRoute();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [account, setAccount] = useState<StoredAccount | null>(() => getStoredAccount());

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch(() =>
        setConfigError(
          apiIsUnconfigured()
            ? "static"
            : "The Remi server is not reachable. Start it with `npm run dev`.",
        ),
      );
  }, []);

  useScrollReset(route);

  const onSignOut = useCallback(() => {
    signOut();
    setAccount(null);
    navigate("/");
  }, []);

  /*
   * Two redirects, decided here and performed in an effect rather than during
   * render: a gated route with no account sends you to sign in and remembers
   * where you were going, and the sign-in screen itself is pointless once you
   * have an account.
   */
  const redirect =
    account === null && GATED.has(route.name)
      ? signInHref({ mode: "signin", next: pathOf(route) }).slice(1)
      : account !== null && route.name === "signin"
        ? route.next
        : null;

  useEffect(() => {
    if (redirect !== null) navigate(redirect);
  }, [redirect]);

  // ---- public, no account and no server-side session

  if (route.name === "receipt") {
    return <ReceiptScreen receiptNo={route.receiptNo} config={config} account={account} />;
  }

  if (route.name === "public-passport") {
    return <PassportScreen address={route.address} config={config} account={null} shared />;
  }

  if (route.name === "landing") {
    return <Landing account={account} />;
  }
  if (route.name === "docs") return <Docs section={route.section} />;

  if (redirect !== null) {
    return <Loading config={config} account={account} />;
  }

  if (route.name === "signin") {
    return (
      <SignIn
        config={config}
        mode={route.mode}
        email={route.email}
        next={route.next}
        onSignedIn={setAccount}
      />
    );
  }

  // ---- everything below needs an account and a server

  if (configError !== null) {
    return <ServerMissing reason={configError} config={config} account={account} />;
  }

  if (config === null || account === null) {
    return <Loading config={config} account={account} />;
  }

  // One frame around every signed-in screen: a rail on a desktop, a tab bar on
  // a phone, and the screen itself in between. CSS decides which navigation is
  // showing, so both are always in the markup and neither needs measuring.
  return (
    <div className="appframe">
      <SideNav active={route.name} config={config} account={account} onSignOut={onSignOut} />
      <div className="appframe__body">
        {route.name === "home" && (
          <DashboardScreen config={config} account={account} onSignOut={onSignOut} />
        )}
        {route.name === "pay" && (
          <PayScreen
            config={config}
            account={account}
            onSignOut={onSignOut}
            to={route.to}
            amount={route.amount}
            memo={route.memo}
          />
        )}
        {route.name === "books" && (
          <BooksScreen config={config} account={account} onSignOut={onSignOut} />
        )}
        {route.name === "passport" && (
          <PassportScreen
            address={account.address}
            config={config}
            account={account}
            onSignOut={onSignOut}
          />
        )}
      </div>
      <TabBar active={route.name} />
    </div>
  );
}

/** The hash path a route came from, so sign-in can return to it. */
function pathOf(route: Route): string {
  switch (route.name) {
    case "home":
      return "/app";
    case "pay":
      return "/pay";
    case "books":
      return "/books";
    case "passport":
      return "/passport";
    default:
      return "/app";
  }
}

function Loading({
  config,
  account,
}: {
  config: ServerConfig | null;
  account?: StoredAccount | null;
}) {
  return (
    <main className="shell">
      <AppHeader config={config} account={account ?? null} />
      <p className="hushed">
        <span className="spinner" /> Connecting…
      </p>
    </main>
  );
}

/**
 * What the product shows when there is no server behind it.
 *
 * This is the normal state of a GitHub Pages build, where the landing page is
 * fully functional and the dashboard cannot be — so it says which half is
 * missing and how to supply it, rather than failing as though something broke.
 */
function ServerMissing({
  reason,
  config,
  account,
}: {
  reason: string;
  config: ServerConfig | null;
  account: StoredAccount | null;
}) {
  return (
    <main className="shell">
      <AppHeader config={config} account={account} />
      {reason === "static" ? (
        <div className="stack">
          <h1>Remi needs its server.</h1>
          <p className="hushed">
            The landing page is static and this one is not. The part of Remi that reads the chain
            and adds up the books is not running behind this build, and payouts, Books and
            Passports all need it.
          </p>
          <div className="notice">
            Run the whole thing locally with <code>npm run dev</code>, or build this app with{" "}
            <code>VITE_API_BASE</code> pointed at a hosted Remi server.
          </div>
          <div className="row">
            <a className="btn btn-ghost" href="https://github.com/Rohit-ATS/Remi">
              How to run it
            </a>
            <a className="btn btn-soft" href="#/">
              Back to the home page
            </a>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="notice notice-error">{reason}</div>
          <a className="btn btn-ghost" href="#/">
            Back to the home page
          </a>
        </div>
      )}
    </main>
  );
}

