import { useCallback, useEffect, useState } from "react";
import { api, type ServerConfig } from "./lib/api.ts";
import { getStoredAccount, signOut, type StoredAccount } from "./lib/account.ts";
import { useRoute, navigate } from "./lib/router.ts";
import { Welcome } from "./screens/Welcome.tsx";
import { Home } from "./screens/Home.tsx";
import { BooksScreen } from "./screens/Books.tsx";
import { PassportScreen } from "./screens/Passport.tsx";
import { ReceiptScreen } from "./screens/Receipt.tsx";

export function App() {
  const route = useRoute();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [account, setAccount] = useState<StoredAccount | null>(() => getStoredAccount());

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch((error: unknown) =>
        setConfigError(
          error instanceof Error
            ? `The Remi server is not reachable (${error.message}). Start it with \`npm run dev:server\`.`
            : "The Remi server is not reachable.",
        ),
      );
  }, []);

  const onSignOut = useCallback(() => {
    signOut();
    setAccount(null);
    navigate("/");
  }, []);

  // A shared receipt opens for anyone, with no account and no server-side
  // session. It is checked before the signed-in gate on purpose: this is the
  // link a contractor is sent, and asking them to sign up to read it would
  // defeat the point.
  if (route.name === "receipt") {
    return <ReceiptScreen receiptNo={route.receiptNo} config={config} account={account} />;
  }

  if (route.name === "public-passport") {
    return <PassportScreen address={route.address} config={config} account={null} shared />;
  }

  if (configError !== null) {
    return (
      <main className="shell">
        <Header account={null} />
        <div className="notice notice-error">{configError}</div>
      </main>
    );
  }

  if (config === null) {
    return (
      <main className="shell">
        <Header account={null} />
        <p className="hushed">
          <span className="spinner" /> Connecting…
        </p>
      </main>
    );
  }

  if (account === null) {
    return <Welcome config={config} onSignedIn={setAccount} />;
  }

  return (
    <>
      {route.name === "home" && (
        <Home config={config} account={account} onSignOut={onSignOut} />
      )}
      {route.name === "books" && <BooksScreen config={config} account={account} />}
      {route.name === "passport" && (
        <PassportScreen address={account.address} config={config} account={account} />
      )}
      <TabBar active={route.name} />
    </>
  );
}

function Header({ account }: { account: StoredAccount | null }) {
  return (
    <header className="topbar">
      <span className="mark">
        <a href="#/">Remi</a>
      </span>
      {account !== null && <span className="chip">{account.label}</span>}
    </header>
  );
}

function TabBar({ active }: { active: string }) {
  const tabs = [
    { href: "#/", name: "home", label: "Pay" },
    { href: "#/books", name: "books", label: "Books" },
    { href: "#/passport", name: "passport", label: "Passport" },
  ];

  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map((tab) => (
        <a
          key={tab.name}
          href={tab.href}
          {...(active === tab.name ? { "aria-current": "page" as const } : {})}
        >
          <span className="pip" aria-hidden="true" />
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
