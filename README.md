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

The contract stores amounts, dates and counterparty addresses. Names live
encrypted client-side under the second key, which is non-extractable and never
stored. So a worker can send a landlord a link that proves the amounts settled
without revealing who their clients are, and signing in on a new phone with the
same Face ID recovers both keys — no seed phrase, no backup file, no server.

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

## Running it

```bash
npm install
npm run compile                      # solc -> artifacts/ + generated ABIs

cp .env.example .env                 # add PRIVATE_KEY (a key holding only gas)
npm run deploy                       # testnet: deploys DemoUSD + RemiPayouts

npm run dev                          # server on :8787, app on :5173
```

Open <http://localhost:5173>. Passkeys work on `localhost`, so Face ID works in
development.

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

## Layout

```
contracts/RemiPayouts.sol   payout rail + income registry (both sides of a payout)
scripts/                    compile, deploy, verify-payment
server/src/
  indexer.ts                PaymentSent/PayeeSaved -> SQLite, chunked, idempotent
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
