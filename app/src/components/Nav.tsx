import type { CSSProperties } from "react";
import type { ServerConfig } from "../lib/api.ts";
import type { StoredAccount } from "../lib/account.ts";
import { shortAddress } from "../lib/money.ts";
import { Wordmark } from "../site/primitives.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

/**
 * The product's section navigation, in the two shapes a real app needs.
 *
 * One list of sections drives both: a bottom tab bar on a phone, where the
 * thumb is, and a rail down the side on a desktop, where a bottom bar stranded
 * three labels across two thousand pixels of empty band. Which one shows is a
 * media query, so there is no resize listener and no flash of the wrong one.
 */

export const SECTIONS = [
  { href: "#/app", name: "home", label: "Home", hint: "Pay and review", Icon: HomeIcon },
  { href: "#/books", name: "books", label: "Books", hint: "Categories and totals", Icon: BooksIcon },
  {
    href: "#/passport",
    name: "passport",
    label: "Passport",
    hint: "What you have been paid",
    Icon: PassportIcon,
  },
];

/**
 * The phone bar.
 *
 * One indicator slides between the tabs rather than a mark appearing and
 * disappearing under each: the movement is what tells you where you came from,
 * so the bar reads as one control instead of three separate links. Its position
 * is the active index handed to CSS, which keeps the animation off the main
 * thread and leaves the markup plain anchors — the bar still works, and still
 * reads correctly to a screen reader, with no JavaScript measuring anything.
 */
export function TabBar({ active }: { active: string }) {
  const index = SECTIONS.findIndex((section) => section.name === active);

  return (
    <nav className="tabs" aria-label="Sections">
      <div
        className="tabs__row"
        style={
          { "--tab-count": SECTIONS.length, "--tab-active": Math.max(index, 0) } as CSSProperties
        }
      >
        {/* Hidden until a section actually matches, so an unknown route does
            not park the indicator under Home and claim we are there. */}
        <span className="tabs__indicator" data-visible={index >= 0} aria-hidden="true" />
        {SECTIONS.map(({ href, name, label, Icon }) => (
          <a
            key={name}
            className="tab"
            href={href}
            {...(active === name ? { "aria-current": "page" as const } : {})}
          >
            <span className="tab__icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="tab__label">{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

/** The desktop rail: the same sections, plus the account chrome the top bar carries on a phone. */
export function SideNav({
  active,
  config,
  account,
  onSignOut,
}: {
  active: string;
  config: ServerConfig;
  account: StoredAccount;
  onSignOut: () => void;
}) {
  return (
    <nav className="rail" aria-label="Sections">
      <a className="rail__mark" href="#/app" aria-label="Remi home">
        <Wordmark />
      </a>

      <div className="rail__sections">
        {SECTIONS.map(({ href, name, label, hint, Icon }) => (
          <a
            key={name}
            className="railitem"
            href={href}
            {...(active === name ? { "aria-current": "page" as const } : {})}
          >
            <span className="railitem__icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="railitem__text">
              <b>{label}</b>
              <small>{hint}</small>
            </span>
          </a>
        ))}
      </div>

      <div className="rail__foot">
        <div className="railaccount">
          <span className="railaccount__label">{account.label}</span>
          <span className="railaccount__addr">{shortAddress(account.address)}</span>
        </div>
        <div className="railaccount__actions">
          {config.network !== "mainnet" && (
            <span className="chip">{config.network === "local" ? "Local" : "Testnet"}</span>
          )}
          <ThemeToggle />
          <button type="button" className="chip" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

/* Icons are drawn on the same 16px grid at the same 1.4 stroke as the theme
   toggle, so the two sets of chrome look like one hand drew them. */

function HomeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.4 7.1 8 2.5l5.6 4.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.9 6.3v7.2h8.2V6.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.6 13.5v-3.6h2.8v3.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BooksIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 4.3a2.4 2.4 0 0 0-1.7-.7H2.5v8.1h3.8A2.4 2.4 0 0 1 8 12.4a2.4 2.4 0 0 1 1.7-.7h3.8V3.6H9.7A2.4 2.4 0 0 0 8 4.3z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 4.3v8.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PassportIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="3.1"
        y="2.2"
        width="9.8"
        height="11.6"
        rx="1.7"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="6.5" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.5 11.3c.5-1.2 1.4-1.9 2.5-1.9s2 .7 2.5 1.9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
