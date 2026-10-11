# Remi

**Pay contractors abroad in seconds. Give them an income record they own.**

Remi is payroll for US small businesses paying people overseas. The owner says
one sentence, the contractor is paid in AUSD on Monad, and the books write
themselves.

That is the wedge, not the product.

## The problem nobody is solving

Sending money across borders costs a global average of **6.49%** of the amount
sent, against a G20 target of 5% that the industry has missed for a decade
([World Bank, Remittance Prices Worldwide, Q1 2025][rpw]). Fast stablecoin
payroll fixes that, and it is a crowded idea — Deel, Rise, Request Finance and
Toku all ship a version of it.

Here is the half that nobody ships. A contractor in Manila paid by three US
clients has **no way to prove what they earn**. Their bank statement is in the
wrong currency, their client list is spread across three dashboards, and a
screenshot proves nothing. They are invisible to every landlord, lender and visa
officer who asks the simplest question about a working adult.

Remi answers that question as a byproduct of getting paid.

## What it does

Every payout writes two records in one call:

- **For the business** — a receipt and a bookkeeping entry. Categories, monthly
  totals, a CSV for the accountant, and each contractor's annual figure against
  the $600 threshold that matters in January.
- **For the worker** — one line in a verifiable earnings history that follows
  them across every client they ever invoice. This is the Passport.

The Passport is what turns a one-sided tool into a network: a worker with three
clients on their record has a reason to bring the next business on.

## Why this needs a chain

Transferring a stablecoin and emitting an event works anywhere, and "settlement
is fast" is true of several chains. That is not the argument.

**Remi does not use the chain to move money. It uses the chain so that no single
employer owns a worker's income history.** If these records live in Remi's
database they are Remi's records and the worker is a tenant. As public state, a
lender can underwrite them without Remi's permission and the worker keeps them if
Remi disappears. Portability is the product, and that is what a shared ledger is
for.

The cost of that choice is what picks the chain. A credential is only worth
something if it is *complete*, so every payout must be written, not just the
large ones — weekly payouts across millions of workers, each one a state write.
Writes have to stay near-free or the product quietly starts skipping records.
Monad is where per-payout writes at that volume stay cheap, and where the two
pieces Remi depends on — AUSD and passkey accounts with no custody backend — are
already native.

## Privacy: one passkey, two keys

A public income history attached to a named person would be worse than a bank
statement. So the record and the identity are split, and the worker holds the key
that joins them.

| Salt | Key | Job |
| --- | --- | --- |
| Mera default | secp256k1 | Signs payouts. Derived per call, zeroed after. |
| `sha256("remi.payeebook.v1")` | AES-GCM | Encrypts names and countries. Never signs. |

The contract stores only amounts, dates and counterparty addresses. Names,
countries, labels, categories and memos do not enter transaction calldata or
events; the payer's name-and-country book stays encrypted client-side under the
second key. A worker can send a landlord a link that proves administrator-attested
amounts settled without revealing who their clients are.

## Passport integrity

An ordinary wallet transfer is settlement, not an income credential. A Passport
credit now requires an administrator's one-time EIP-712 attestation bound to the
specific payer, recipient, amount, nonce, deadline, chain, and Remi contract.
That prevents a previously reviewed business from crediting an arbitrary wallet
it controls, or replaying a prior approval. The operator must verify the real
payment relationship before issuing an attestation; no smart contract can prove
that two off-chain identities are independent. Use a dedicated protected
attestation signer with a documented rotation process. The older
`setTrustedPayer` registry remains operator metadata and does not by itself
make a payout Passport-eligible.

Local and testnet records use freely mintable DemoUSD and are explicitly demo
data: Remi displays their settlement activity but never a credit-facing score
or advance figure. Only mainnet, administrator-attested payouts are eligible
for those calculations.

## The assistant is not a wrapper

An LLM reading your own rows is table stakes. In Remi, **every figure is computed
in code** by [`server/src/underwriting.ts`](server/src/underwriting.ts) —
regularity, client concentration, trend, coverage, and a confidence factor that
holds down a record too thin to judge. The model is handed those numbers and only
puts them into a sentence. It is never asked what someone earns or what they can
borrow.

The boundary is structural, not a prompt instruction:
[`server/src/assistant.ts`](server/src/assistant.ts) imports nothing that can
sign or write and exposes no tool-calling interface, so there is no path from a
model output to a state change. Payouts are started only by the deterministic
parser in [`app/src/lib/intent.ts`](app/src/lib/intent.ts). When the model is
unreachable the endpoint answers from the computed figures instead of failing or
inventing.

## Running it locally

Everything runs offline against a local chain. No faucet, no testnet, no keys
to set up.

```bash
npm install
npm run compile                 # solc -> artifacts/ + generated ABIs

npm run chain                   # terminal 1: local EVM on :8545, funded accounts
NETWORK=local npm run deploy    # terminal 2: DemoUSD + RemiPayouts, writes .env
NETWORK=local npm run demo      # six months of real payouts, on chain
npm run dev                     # server on :8787, app on :5173
```

Open <http://localhost:5173>. Passkeys work on `localhost`, so Face ID works in
development.

A fresh passkey account starts with no gas and no balance, so on a local chain
the dashboard offers **Add test dollars** — 1 ETH for gas and 5,000 dUSD, from
the same faucet `npm run demo` uses. It exists only when `NETWORK=local`.

The chain deliberately boots seven months in the past. Block timestamps can only
move forward, so a node starting at "now" could never be given a history, and
Books, the Passport and the income score are all worth nothing without one.
`npm run demo` walks the clock forward to today.

To settle on a real network instead, set `NETWORK=testnet` (chain 10143) with a
funded `PRIVATE_KEY` in `.env`, or `NETWORK=mainnet` with `TOKEN_ADDRESS` set to
AUSD's real address. Set `PAYOUTS_ADMIN` to a dedicated multisig before deploy;
the deployer is attested automatically only when that variable is omitted.

To prove a payout end to end:

```bash
npm run verify-payment -- 0xRecipientAddress 1
```

It sends the payout, decodes `PaymentSent`, prints both sides of the record it
wrote, and measures wall-clock seconds from submit to confirmation.

For mainnet, set `NETWORK=mainnet` and `TOKEN_ADDRESS` to AUSD's real address.
The deploy script reads `decimals()` off that token before writing it anywhere —
an 18-decimal token would misprice every payout by 10^12.

## Deployed

| | |
| --- | --- |
| Marketing site | <https://rohit-ats.github.io/Remi/> |
| App | <https://rohit-ats.github.io/Remi/app/> |

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) compiles the
contracts, runs the tests, and publishes both on every push to `main`.

The marketing site is complete and standalone. **The app is a shell until a
server is hosted** — GitHub Pages cannot run the backend that reads the chain
and adds up the books, so with no API configured the app says so instead of
failing with a fetch error. To make it live, host `server/` anywhere and set a
repository variable `API_BASE` to its origin (Settings → Secrets and variables →
Actions → Variables); the next deploy picks it up.

Routing is hash-based, so a shared receipt (`#/r/12`) or Passport (`#/p/0x…`)
link opens from a static host with no rewrite rules.

## Deploying on Render

[`render.yaml`](render.yaml) creates an API service and a static app. The API
uses a paid persistent disk because SQLite's cursor and indexed receipts must
survive restarts. During Blueprint setup provide the deployed contract values
for `PAYOUTS_ADDRESS`, `TOKEN_ADDRESS`, and `START_BLOCK`; set `CORS_ORIGINS`
to the exact public URL Render assigns to `remi-app`; then set `VITE_API_BASE`
to the exact public URL of `remi-api` and deploy the static app again.

Do not configure `PRIVATE_KEY` on the API. It cannot and must not sign payouts.
The optional Kimi integration is disabled by default even with a key. Retain the
local assistant unless an authenticated edge rate-limits callers and injects a
secret `ASSISTANT_EDGE_TOKEN`; then configure `KIMI_API_KEY`,
`KIMI_DAILY_REQUEST_LIMIT`, and `KIMI_REMOTE_ENABLED=true`. The API rejects
remote use without that secret and enforces the daily ceiling in its persistent
SQLite volume. Direct browser requests continue to receive the local computed
answer. Also set `INDEX_FINALITY_BLOCKS` (2 on testnet, 12 default on mainnet)
and keep the persistent disk: receipts are shown only after the confirmation
horizon and the indexer checks recent block hashes for reorganizations.
`REORG_LOOKBACK_BLOCKS` may not be set below the confirmation horizon; a reorg
deeper than the selected chain-finality policy is an operator incident, not a
record the API can safely continue to treat as canonical.

## Layout

```
contracts/RemiPayouts.sol   payout rail + income registry (both sides of a payout)
scripts/                    compile, deploy, verify-payment
server/src/
  indexer.ts                PaymentSent -> SQLite, chunked, idempotent
  underwriting.ts           deterministic income assessment
  books.ts                  payer-side totals, 1099 list, CSV
  assistant.ts              read-only narration of computed figures
app/src/
  lib/account.ts            the whole account layer, Mera only
  lib/vault.ts              the second key: AES-GCM over the payee book
  lib/intent.ts             the only code that can begin a payment
  screens/Passport.tsx      the worker's income record
frontend/src/               marketing site (React, its own design system)
```

Node's built-in SQLite and a hand-rolled `.env` reader keep the server free of
native dependencies, so `npm install` cannot fail on a missing build toolchain.

## Tests

```bash
npm test
```

36 tests over the parts where being wrong costs money: the money arithmetic, the
$600 1099 boundary, CSV escaping, the scoring edges, and the parser. One of them
exists because it caught a real bug — `"how much did I pay contractors in 2026"`
parsed as a $2,026 payout to "Contractors In", and a confirm sheet is the last
place to discover that.

## What is not built

No lending. The Passport is the credential underwriting needs, and the app shows
the figure a lender would price against, but Remi does not originate advances.
No on-ramp, no off-ramp, no KYC, no recurring payroll, no CSV import.

[rpw]: https://remittanceprices.worldbank.org/

---

MIT. Built by [Rohit Maruri](https://github.com/Rohit-ATS).
