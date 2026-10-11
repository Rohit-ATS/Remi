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

function Dropdown({
  item,
  open,
  onToggle,
  onClose,
}: {
  item: NavItem;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `nav-menu-${item.label.toLowerCase().replace(/\s+/g, "-")}`;

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
      onBlur={(event) => {
        if (!ref.current?.contains(event.relatedTarget as Node | null)) onClose();
      }}
    >
      <button
        className="nav__trigger"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            event.currentTarget.focus();
          }
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            onToggle();
            requestAnimationFrame(() => panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus());
          }
        }}
      >
        {item.label}
        <Chevron />
      </button>
      {open && (
        <div className="nav__panel" id={panelId} ref={panelRef}>
          {item.links.map((link) => (
            <a key={link.label} href={link.href} onClick={onClose}>
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
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = (): void => setStuck(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Dropdowns open deliberately on click rather than on hover: there is no
  // cursor race over the small gap to the panel, and the same interaction works
  // with touch and keyboard. Only one menu can be open at a time.
  useEffect(() => {
    if (openMenu === null) return;
    const onDown = (event: PointerEvent): void => {
      if (!navRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  return (
    <header className="nav" data-stuck={stuck}>
      <div className="site-shell nav__inner">
        <a href="#top" aria-label="Remi home">
          <Wordmark />
        </a>

        <nav className="nav__links" aria-label="Main" ref={navRef}>
          {NAV.map((item) => (
            <Dropdown
              key={item.label}
              item={item}
              open={openMenu === item.label}
              onToggle={() => setOpenMenu((current) => (current === item.label ? null : item.label))}
              onClose={() => setOpenMenu(null)}
            />
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
          {NAV.flatMap((item) =>
            item.links
              ? item.links.map((link) => (
                  <a key={link.label} href={link.href} onClick={() => setMobileOpen(false)}>
                    {link.label}
                  </a>
                ))
              : [
                  <a
                    key={item.label}
                    href={item.href ?? `#${item.label.toLowerCase()}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </a>,
                ],
          )}
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
