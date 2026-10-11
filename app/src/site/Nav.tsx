import { useEffect, useRef, useState } from "react";
import { Burger, Button, Chevron, Close, Wordmark } from "./primitives.tsx";
import { NAV, type NavItem } from "./content.ts";
import type { StoredAccount } from "../lib/account.ts";
import { signInHref } from "../lib/router.ts";
import { ThemeToggle } from "../components/ThemeToggle.tsx";

/** The black announcement strip. Dismissible, and it stays dismissed. */
export function AnnouncementBar() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="annbar">
      <div className="annbar__inner">
        <span>
          New: the Passport — every payout now writes your contractor a verifiable income record.
        </span>
        <a className="annbar__link" href="#passport">
          Learn more
        </a>
      </div>
      <button className="annbar__close" type="button" aria-label="Dismiss" onClick={() => setOpen(false)}>
        <Close />
      </button>
    </div>
  );
}

function Dropdown({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, which is what a menu that opens on
  // hover still needs for keyboard and touch users.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (item.links === undefined) {
    return (
      <div className="nav__item">
        <a className="nav__trigger" href={item.href ?? "#"}>
          {item.label}
        </a>
      </div>
    );
  }

  return (
    <div
      className="nav__item"
      data-open={open}
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className="nav__trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {item.label}
        <Chevron />
      </button>
      {open && (
        <div className="nav__panel">
          {item.links.map((link) => (
            <a key={link.label} href={link.href}>
              <strong>{link.label}</strong>
              <span>{link.blurb}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function Nav({ account }: { account: StoredAccount | null }) {
  const [stuck, setStuck] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setStuck(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="nav" data-stuck={stuck}>
      <div className="site-shell nav__inner">
        <a href="#top" aria-label="Remi home">
          <Wordmark />
        </a>

        <nav className="nav__links" aria-label="Main">
          {NAV.map((item) => (
            <Dropdown key={item.label} item={item} />
          ))}
        </nav>

        <button
          className="nav__burger"
          type="button"
          aria-expanded={mobileOpen}
          aria-label="Menu"
          onClick={() => setMobileOpen((value) => !value)}
        >
          <Burger />
        </button>

        <div className="nav__actions">
          <ThemeToggle />
          {account === null ? (
            <>
              <a className="nav__signin" href={signInHref({ mode: "signin" })}>
                Sign in
              </a>
              <Button variant="ghostdark" href="#how">
                See how it works
              </Button>
              <Button variant="dark" href={signInHref({ mode: "create" })}>
                Get started
              </Button>
            </>
          ) : (
            <>
              <span className="nav__who" title={account.address}>
                {account.label}
              </span>
              <Button variant="dark" href="#/app">
                Open dashboard
              </Button>
            </>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div className="mobilenav">
          {NAV.map((item) => (
            <a key={item.label} href={item.href ?? `#${item.label.toLowerCase()}`} onClick={() => setMobileOpen(false)}>
              {item.label}
            </a>
          ))}
          {account === null ? (
            <>
              <a href={signInHref({ mode: "signin" })} onClick={() => setMobileOpen(false)}>
                Sign in
              </a>
              <a href={signInHref({ mode: "create" })} onClick={() => setMobileOpen(false)}>
                Get started
              </a>
            </>
          ) : (
            <a href="#/app" onClick={() => setMobileOpen(false)}>
              Open dashboard
            </a>
          )}
        </div>
      )}
    </header>
  );
}
