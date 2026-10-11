import { useEffect, type ReactNode } from "react";
import { Wordmark, ArrowUpRight, ArrowRight } from "../site/primitives.tsx";
import { ThemeToggle } from "../components/ThemeToggle.tsx";
import "../styles/docs.css";

const REPO = "https://github.com/Rohit-ATS/Remi";
const pages = [
  { id: "overview", group: "GETTING STARTED", title: "Introduction", description: "Payments that leave a record.", subtitle: "A guide to Remi: contractor payouts, readable books, and an income history that travels with the worker." },
  { id: "payouts", group: "THE PRODUCT", title: "Sending a payout", description: "From a sentence to settlement.", subtitle: "Understand what happens when you pay a contractor, and what you need before your first payment." },
  { id: "books", group: "THE PRODUCT", title: "Books & receipts", description: "A clear view of money sent.", subtitle: "Turn settled transactions into a useful payment history, with receipts you can share and records you can export." },
  { id: "passport", group: "THE PRODUCT", title: "The Passport", description: "An income history of your own.", subtitle: "A recipient’s view of settled payments across clients, with a distinction between activity and attested income." },
  { id: "privacy", group: "UNDER THE HOOD", title: "Privacy & accounts", description: "Public settlement. Private context.", subtitle: "What goes on chain, what stays on your device, and how your passkey keeps the two apart." },
  { id: "local", group: "BUILD WITH REMI", title: "Run locally", description: "Your first local environment.", subtitle: "Run the interface, API, and a local chain together. Start with demo dollars before connecting a live network." },
  { id: "deployment", group: "BUILD WITH REMI", title: "Deployment", description: "Connect the three pieces.", subtitle: "Remi combines a static frontend, a read-side API, and contracts deployed on the selected network." },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="docs-section"><h2>{title}</h2>{children}</section>;
}
function Note({ children }: { children: ReactNode }) {
  return <aside className="docs-note"><span aria-hidden="true">↳</span><div>{children}</div></aside>;
}
function Code({ children }: { children: string }) {
  return <pre className="docs-code"><code>{children}</code></pre>;
}

function Article({ id }: { id: string }) {
  switch (id) {
    case "payouts": return <>
      <Section title="Before you start"><p>Create or sign in to your Remi account with a supported passkey. Your account needs the configured payment token and enough native currency for network fees. The API must point to deployed contracts on the same network.</p><Note>Local mode includes a test faucet. Testnet tokens are demo assets, not real dollars.</Note></Section>
      <Section title="Make a payment"><ol className="docs-steps"><li><strong>Choose the recipient.</strong><p>Open the payment screen and select a recipient or enter their address. Check the address carefully.</p></li><li><strong>Enter the amount.</strong><p>Use the payment form or a sentence such as “send $250 to Maria”. A deterministic parser interprets the instruction.</p></li><li><strong>Review and confirm.</strong><p>Check the recipient and amount in the confirmation screen. Your passkey authorizes the transaction; token approval may be required first.</p></li><li><strong>Wait for settlement.</strong><p>The contract emits a payment event. The API indexes it so the payment appears in your history and the recipient’s activity.</p></li></ol></Section>
      <Note>The assistant cannot send money. Text interpretation is not authorization: you still review and sign the payment.</Note>
    </>;
    case "books": return <>
      <Section title="Your payment history"><p>Books summarizes indexed payouts for the payer: totals, monthly activity, and payments by recipient. Amounts are calculated in code from settled records, not estimated by a language model.</p></Section>
      <Section title="A receipt anyone can open"><p>Receipt links use <code>#/r/RECEIPT_NUMBER</code>. A recipient can open one without creating an account. The API must be reachable and must have indexed the payment for the receipt to load.</p></Section>
      <Section title="Exporting records"><p>CSV export gives you a portable view of the indexed records. Private names, categories, and memos are not published on chain; the server cannot reconstruct that private context from payment events.</p><Note>Bookkeeping summaries reflect available data. They are not tax filings or a determination of your reporting obligations.</Note></Section>
    </>;
    case "passport": return <>
      <Section title="Activity across clients"><p>The Passport groups payments received by a wallet across clients. A public view can be shared through <code>#/p/WALLET_ADDRESS</code>, without requiring the viewer to sign in.</p></Section>
      <Section title="Settlement is not proof of employment"><p>An ordinary payment still settles, but does not automatically become an income credential. Passport eligibility requires a one-time administrator signature bound to the payer, recipient, amount, deadline, chain, and contract. The operator must independently verify that relationship before issuing it.</p></Section>
      <Section title="What an advance preview means"><p>Eligible records can be assessed for regularity, concentration, trend, and coverage. These figures are computed deterministically. Remi does not lend, and a preview is not a credit offer.</p><Note>Local and testnet activity uses freely mintable demo tokens. Credit-facing scores and advance figures are disabled on those networks.</Note></Section>
    </>;
    case "privacy": return <>
      <Section title="One passkey, two jobs"><p>The account layer uses a passkey to derive signing material through Mera. A separate derivation is used for AES-GCM encryption of the local payee book. The API does not hold a production signing key.</p></Section>
      <div className="docs-boundary"><div><span className="docs-eyebrow">ON CHAIN</span><h3>Settlement details</h3><p>Wallet addresses, amounts, and public transaction history. These records are visible to anyone.</p></div><div><span className="docs-eyebrow">ON YOUR DEVICE</span><h3>Personal context</h3><p>Private payee information stays in the encrypted local book. Names and memos are not sent in payout calldata.</p></div></div>
      <Section title="Understand the boundary"><p>Wallet addresses are pseudonymous, not anonymous. A shared Passport reveals activity for that address. Clearing browser storage can remove your local payee data; do not assume it is backed up by the server.</p></Section>
      <Section title="The assistant reads, it does not sign"><p>The assistant explains figures computed by the server. Remote narration is opt-in; the local fallback works without a model API key. Neither path can authorize a payout.</p></Section>
    </>;
    case "local": return <>
      <Section title="01 / Install"><p>Use Node.js 24 or newer. Clone the repository and install its workspaces.</p><Code>{`git clone https://github.com/Rohit-ATS/Remi.git\ncd Remi\nnpm ci\nnpm run compile`}</Code></Section>
      <Section title="02 / Start a local chain"><p>Keep this running in its own terminal.</p><Code>{`npm run chain`}</Code></Section>
      <Section title="03 / Deploy and run"><p>In a second terminal, deploy the demo contracts, seed payment history, and start the API and frontend.</p><Code>{`NETWORK=local npm run deploy\nNETWORK=local npm run demo\nnpm run dev`}</Code><p>Open <a href="http://localhost:5173">localhost:5173</a>. The API runs on port 8787. Local accounts can use the dashboard’s test funding action.</p></Section>
      <Note>Keep the local chain running. Its funded development accounts are for local testing only.</Note>
    </>;
    case "deployment": return <>
      <Section title="The architecture"><div className="docs-flow"><span>Browser<small>Interface + signing</small></span><span>API<small>Index + summaries</small></span><span>Monad<small>Settlement records</small></span></div><p>The browser signs payments directly. The API reads chain events into SQLite and serves the interface. Static hosting alone cannot run the API.</p></Section>
      <Section title="Frontend on GitHub Pages"><p>The Pages workflow reads the repository Actions variable <code>API_BASE</code> and passes it into the frontend build. Set it to your API origin, then run the Pages workflow again.</p><Code>{`API_BASE=https://your-api.onrender.com`}</Code></Section>
      <Section title="API on Render"><p>Use the repository root as the working directory. Install development dependencies during the build so TypeScript is available.</p><Code>{`# Build command\nnpm ci --include=dev && npm run build --workspace server\n\n# Start command\nnpm run start --workspace server`}</Code><p>Set <code>CORS_ORIGINS</code> to the frontend origin, without a path. For example, <code>https://rohit-ats.github.io</code>. Set <code>HOST=0.0.0.0</code> and use Node 24.</p></Section>
      <Section title="Contracts and storage"><p>Configure <code>NETWORK</code>, <code>PAYOUTS_ADDRESS</code>, <code>TOKEN_ADDRESS</code>, and <code>START_BLOCK</code> from your deployment. Without contract addresses the server can respond, but indexing stays idle. Receipts are published only after <code>INDEX_FINALITY_BLOCKS</code> confirmations and recent canonical block hashes are replay-checked.</p><p>For persistent SQLite storage, mount a disk and set <code>DB_PATH</code> to a file on it. A relative path such as <code>remi.db</code> works for an ephemeral demo; that database can disappear when the service is replaced.</p><Note>Check <code>/api/health</code> for contract addresses, indexer state, and errors. A healthy HTTP response alone does not mean payments are configured. Never add your deployment private key to the production API.</Note></Section>
    </>;
    default: return <>
      <div className="docs-intro-label"><span /> THE REMI GUIDE</div>
      <Section title="One payment. Two useful records."><p>Remi helps businesses pay contractors on Monad. Each settled payout becomes a receipt for the payer and payment history for the recipient. Books organizes the business side; the Passport brings the recipient’s activity together.</p></Section>
      <div className="docs-cards"><a href="#/docs/payouts"><span className="docs-eyebrow">01 / USE REMI</span><h3>Make your first payout <ArrowRight /></h3><p>Accounts, confirmation, and settlement.</p></a><a href="#/docs/local"><span className="docs-eyebrow">02 / BUILD WITH REMI</span><h3>Start on a local chain <ArrowRight /></h3><p>From a fresh clone to a running demo.</p></a></div>
      <Section title="A small stack, with clear responsibilities"><p>The React interface handles accounts and payment confirmation. A Fastify API indexes payment events into SQLite. The Solidity payout contract settles tokens and records eligibility for the Passport.</p><p>Payment amounts use a token with six decimals. Local and testnet environments use DemoUSD; mainnet is intended for a configured AUSD deployment.</p></Section>
      <Note>Remi is a hackathon project. A running website is not the same as a configured payment system: contract deployment, account funding, and indexing must all be ready.</Note>
    </>;
  }
}

export function Docs({ section }: { section: string }) {
  const page = pages.find((item) => item.id === section) ?? pages[0];
  const index = pages.indexOf(page);
  const next = pages[index + 1];
  useEffect(() => {
    const previous = document.title;
    document.title = `${page.title} — Remi Docs`;
    return () => { document.title = previous; };
  }, [page.title]);
  return <div className="docs">
    <a className="docs-skip" href="#docs-article" onClick={(event) => { event.preventDefault(); document.getElementById("docs-article")?.focus(); }}>Skip to content</a>
    <header className="docs-header"><div className="docs-brand"><a href="#/" aria-label="Remi home"><Wordmark /></a><span className="docs-brand-divider" /><a href="#/docs">Docs</a></div><div className="docs-header-actions"><ThemeToggle /><a className="docs-repo" href={REPO}>GitHub <ArrowUpRight /></a><a className="btn" data-variant="dark" href="#/app">Open app <ArrowRight /></a></div></header>
    <div className="docs-layout"><aside className="docs-sidebar"><span className="docs-sidebar-caption">DOCUMENTATION</span><nav aria-label="Documentation">{pages.map((item, i) => <div key={item.id}>{(i === 0 || pages[i - 1]?.group !== item.group) && <p className="docs-nav-group">{item.group}</p>}<a href={`#/docs/${item.id}`} aria-current={item.id === page.id ? "page" : undefined}>{item.title}</a></div>)}</nav><a className="docs-source" href={REPO}>Explore the source <ArrowUpRight /></a></aside>
    <main className="docs-article" id="docs-article" tabIndex={-1}><div className="docs-breadcrumb">Documentation <span>/</span> {page.title}</div><header className="docs-title"><span className="docs-eyebrow">{page.title}</span><h1>{page.description}</h1><p>{page.subtitle}</p></header><Article id={page.id} /><footer className="docs-bottom"><a href={`${REPO}/tree/main/app/src/screens/Docs.tsx`}>View this guide on GitHub <ArrowUpRight /></a>{next && <a className="docs-next" href={`#/docs/${next.id}`}><small>UP NEXT</small><span>{next.title} <ArrowRight /></span></a>}</footer></main>
    <aside className="docs-margin"><span className="docs-eyebrow">GOOD TO KNOW</span><p>Start with a local demo. Follow the complete payment from confirmation to receipt.</p><a href="#/docs/local">Local setup <ArrowRight /></a><div className="docs-margin-rule" /><span className="docs-eyebrow">OPEN SOURCE</span><p>Read the implementation behind the guide.</p><a href={REPO}>Rohit-ATS / Remi <ArrowUpRight /></a></aside></div>
  </div>;
}
