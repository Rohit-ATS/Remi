// Page content, kept out of the components so copy can be edited without
// touching layout.

export type NavItem = {
  label: string;
  href?: string;
  links?: { label: string; blurb: string; href: string }[];
};

export const NAV: NavItem[] = [
  {
    label: "Product",
    links: [
      { label: "Payouts", blurb: "Say it, confirm with Face ID, it lands", href: "#payouts" },
      { label: "Books", blurb: "Categories, month totals, 1099 figures", href: "#payouts" },
      { label: "Passport", blurb: "The income record your contractor owns", href: "#passport" },
      { label: "Advances", blurb: "Underwriting priced on settled history", href: "#advances" },
    ],
  },
  {
    label: "Built on",
    links: [
      { label: "Monad", blurb: "Where per-payout writes stay near free", href: "#why" },
      { label: "AUSD", blurb: "Settlement currency, 6 decimals", href: "#why" },
      { label: "Passkeys", blurb: "The whole account layer, no custody", href: "#privacy" },
    ],
  },
  { label: "Privacy", href: "#privacy" },
  { label: "Why Monad", href: "#why" },
  { label: "Docs", href: "/docs" },
  { label: "GitHub ↗", href: "https://github.com/Rohit-ATS/Remi" },
];

/** The agents ticker. Figures are illustrative of the unit economics, not usage claims. */
export const TICKER: { label: string; value: string }[] = [
  { label: "Settlement time", value: "~1s" },
  { label: "Network fee per payout", value: "$0.012" },
  { label: "Wire fee replaced", value: "$26.00" },
  { label: "Token decimals", value: "6" },
  { label: "Chain", value: "Monad 143" },
  { label: "Custody backends", value: "0" },
  { label: "Seed phrases", value: "0" },
  { label: "Keys per passkey", value: "2" },
  { label: "1099 threshold", value: "$600" },
  { label: "Records per payout", value: "2" },
];

export const STACK: { name: string; role: string; href: string }[] = [
  { name: "Monad", role: "Settlement", href: "#why" },
  { name: "AUSD", role: "Currency", href: "#why" },
  { name: "Mera", role: "Passkey accounts", href: "#privacy" },
  { name: "WebAuthn PRF", role: "Second key", href: "#privacy" },
  { name: "viem", role: "Chain client", href: "#why" },
  { name: "Fastify", role: "Index + API", href: "#payouts" },
  { name: "SQLite", role: "Payout index", href: "#payouts" },
  { name: "Kimi", role: "Narration only", href: "#advances" },
  { name: "React", role: "Interface", href: "#payouts" },
  { name: "AES-GCM", role: "Payee book", href: "#privacy" },
  { name: "Vite", role: "Build", href: "#payouts" },
  { name: "Solidity", role: "RemiPayouts", href: "#why" },
];

export const TILES: { title: string; body: string; foot: string; wide?: boolean }[] = [
  {
    title: "Payouts",
    body: "Say who and how much. A deterministic parser reads the sentence, a confirm sheet shows the amount, Face ID sends it. No model sits between the words and the money.",
    foot: "Core",
  },
  {
    title: "Books",
    body: "Categories, month totals, totals by contractor, a CSV for the accountant, and each worker's annual figure against the $600 threshold that matters in January.",
    foot: "Core",
  },
  {
    title: "Passport",
    body: "The worker's side. Every payout they have received, across every client, with a shareable view they hold the key to.",
    foot: "The differentiator",
  },
  {
    title: "Advance preview",
    body: "Income stability scored from settled records — regularity, client concentration, trend, months active — computed in code, then explained in plain language. The figure is never the model's opinion.",
    foot: "What comes next",
    wide: true,
  },
  {
    title: "Shared receipts",
    body: "A link the recipient opens with no account, no sign-in and no install. It is the first step of the loop that brings them on.",
    foot: "Core",
  },
];

export const FOOTER: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Payouts", href: "#payouts" },
      { label: "Books", href: "#payouts" },
      { label: "Passport", href: "#passport" },
      { label: "Advances", href: "#advances" },
    ],
  },
  {
    heading: "How it works",
    links: [
      { label: "Why Monad", href: "#why" },
      { label: "Privacy model", href: "#privacy" },
      { label: "The assistant", href: "#advances" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "Source", href: "https://github.com/Rohit-ATS/Remi" },
      { label: "Documentation", href: "/docs" },
      { label: "Strategy", href: "https://github.com/Rohit-ATS/Remi/blob/main/docs/STRATEGY.md" },
    ],
  },
];
