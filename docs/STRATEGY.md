# Remi — what to do between now and submission

Written for the team building this. Blunt on purpose.

## Check this first

**The plan said "Submission Mon 13 Oct". 13 Oct 2026 is a Tuesday.** Today is
Saturday 10 Oct. So either the deadline is Monday the 12th or Tuesday the 13th,
and every gate below hangs off which one it is. Confirm it on the platform
before anything else.

Everything here is cut against **Monday 12 Oct, 17:00 PT**, the earlier of the
two. If it turns out to be Tuesday, the extra day is buffer. It is not scope.

## What changed, and why

The original plan was a well-executed version of the most-pitched crypto idea of
the last three years. Deel, Rise, Request Finance, Toku and Franklin all ship
stablecoin payroll. A Paradigm or Dragonfly judge has heard it dozens of times,
and three things were capping it:

1. **The idea was familiar.** Cleanest-version-of-a-known-thing wins a track
   placing, not a grand prize.
2. **Nothing in it needed Monad.** Transfer a stablecoin, emit an event — that
   works on Base. "Settlement is fast" is not an answer, it is true of five
   other chains.
3. **The AI layer was a wrapper.** An LLM reading your own rows is table stakes.

The reframe keeps the entire build and changes what it is for:

> Every payout mints a verifiable income record for the person who got paid.
> The business gets payroll and books. The worker gets a portable, cryptographically
> verifiable earnings history that follows them across every client.

A contractor in Manila or Lagos paid by three US clients has no way to prove
income — not to a landlord, not to a lender, not to a visa officer. That is a
real, large, genuinely underserved problem, and it is the natural byproduct of
what was already being built.

It fixes all three holes at once:

- **Two-sided.** The worker now wants their *other* clients on Remi, because a
  record with three clients is worth more than one with a single client. The
  business brings the first payout; the worker brings the next business.
- **Why Monad has a real answer.** The chain is not there to move money, it is
  there so no single employer owns the worker's history. A credential is only
  worth something if it is complete, so *every* payout gets written — which is a
  high-frequency write workload, not a value-transfer one. And the end state,
  advances priced on onchain income history, is literally on Track 01's example
  list.
- **The AI stops being a wrapper.** It no longer chats about rows. It
  underwrites: regularity, client concentration, trend, coverage and confidence
  are computed in `server/src/underwriting.ts`, and the model only narrates
  them. Same architecture as the reasoning engine in Meridian — deterministic
  core, fixed response shape, model never produces a figure.

Cost of the reframe: roughly four to six hours. The shared receipt page becomes
the worker's earnings view. Same indexer, same data, one more screen.

## The highest-leverage thing you can do

**Get three real US small businesses to send one real payout each before
submission.** You run an agency that serves exactly these people.

Not a pilot, not a letter of intent — three real transactions from three real
businesses to three real contractors, on mainnet, with the hashes in the
submission. Every other team will demo against an account they funded
themselves. You would be the only submission with users.

"We shipped and three customers used it this weekend" is the most fundable
sentence in the competition, and it costs three phone calls. The proof table in
`site/index.html` is already built and empty, waiting for those hashes.

Do this in the first hour. It is the only task on this page that cannot be
compressed later.

Two more that cost almost nothing:

- **Work the mentors.** Agora's CEO and CTO are both listed mentors and Agora's
  bounty is the one being targeted. Get in front of them with something working
  before Monday. Projects a mentor has personally seen get argued for in the
  room.
- **Build in public.** Monad's culture runs on X. Post the first real mainnet
  payout tonight, then the contractor's Passport tomorrow. Judges having already
  seen your name is free.

## Where the build actually stands

Done and verified:

- `RemiPayouts.sol` compiles at 4.1 KB. Writes both sides of a payout — a
  receipt for the payer and an `Earnings` row for the payee. `passportOf()`
  reads a worker's record in one call with no indexer in between.
- Backend: Fastify, chunked idempotent indexer, books, 1099 list, CSV,
  deterministic underwriting, read-only assistant with a local fallback.
  No native dependencies.
- Frontend: Mera-only account layer, the second PRF key over the payee book,
  full preflight before any Face ID prompt, Home/Confirm/Receipt/Books/Passport,
  voice as progressive enhancement.
- Public receipt and public Passport routes that open with no account.
- 36 tests. Books, Passport, assistant and CSV verified end to end against a
  seeded index.

Not done, in priority order:

1. **Mainnet deploy + real AUSD address.** Needs a funded key. Blocks
   everything that counts as proof. `npm run deploy` with `NETWORK=mainnet`
   refuses to run until `TOKEN_ADDRESS` is set and reads `decimals()` before
   trusting it.
2. **The three real payouts.** See above.
3. **PWA shell.** No manifest, no icons, no service worker. Agora's bounty says
   "mobile app" — ask them in Discord whether an installable PWA qualifies. That
   answer decides whether React Native is even a question, and it is a
   Sunday-morning decision, not a Monday one.
4. **Envio.** The indexer here is our own SQLite one, which is simpler to run and
   enough for the demo, but it is not the Envio bounty. Porting `indexer.ts` to
   HyperIndex is roughly three hours and worth $1,000 — do it only after rung 1
   and 2 are green.
5. **Kimi key.** Unset, so the assistant answers from computed figures. It works
   and is honest about it, but the Kimi bounty needs the real model in the loop.

### One known gap worth deciding on

A contractor can only claim a Passport at the address they were actually paid
at, so today the ordering is: contractor sets up Remi, gives the business their
address, then gets paid. The receipt page invites them to claim, but it cannot
retroactively bind a payout sent to an address whose passkey nobody holds.

For the demo this is fine — have the contractor set up first. Do not try to fix
it by Monday. If asked, the honest answer is that claiming a payout sent to an
address you do not control requires a binding step (a signed claim, or paying to
a deterministic address derived from a contact), and it is the first thing after
the hackathon.

## The sequence

| When | What | Gate |
| --- | --- | --- |
| **Sat, now → midnight** | Register, select Track 02 and all bounties. Confirm the deadline day. Settle community-supporter eligibility. Ask Agora about PWA. Deploy to mainnet, buy ~$50 AUSD, push one real payout. | **A real AUSD payment lands on mainnet.** Nothing else matters until this is green. |
| **Sun 09:00–18:00** | The three phone calls, first thing. Then: mainnet wiring, real payee data, PWA shell, the loop working on an actual phone. | **Full path works on a real phone.** If voice is not working by 18:00, cut it — typed input was always the primary path. |
| **Sun 18:00–23:00** | Passport polish, the shared-record demo on a second device, Envio port if and only if everything above is green. | Everyone off by 23:00. A tired Monday loses more than a long Sunday gains. |
| **Mon 09:00–11:00** | Kimi key in, assistant on camera, empty states, error copy, the PAID stamp. | **11:00 feature freeze.** Including the idea that arrives at 11:05 and would only take twenty minutes. |
| **Mon 11:00–14:00** | Deploy to a public URL. Test on a phone that has never seen the app. Record the demo. Submit. | **Submit by 14:00, not 17:00.** Platforms fall over at deadlines. |

## The demo

Open on the money landing. Never on architecture.

1. **0:00–0:60** Phone in hand. Face ID, the sentence, confirm, receipt stamped
   PAID, settlement time on screen, a link proving AUSD moved on mainnet.
2. **0:60–1:30** The turn that makes it a company. Open the recipient's Passport
   on a *second phone*: their earnings across three clients, the stability score,
   the advance figure. Then say the line — "the business got payroll, the worker
   got a balance sheet."
3. **1:30–2:30** Three real businesses used this weekend, with hashes. The
   two-key privacy model in one sentence. Why Monad. What is next: advances
   priced on this record.

The judges are mostly VCs — Paradigm, Pantera, Dragonfly, Electric Capital,
CoinFund, Galaxy. They are buying a company, not a repository.

## Questions you will be asked

**"Why not Base, or Solana?"** Remi doesn't use the chain to move money, it uses
it so no employer owns the worker's history. That requires every payout to be
written, not just the big ones, which is a write-volume problem rather than a
transfer problem — plus AUSD and passkey accounts with no custody backend are
already native here.

**"Isn't a public income history a privacy disaster?"** The chain holds amounts,
dates and addresses. Names are encrypted client-side under a second key derived
from the same passkey under a different salt. The worker shares a link, not their
client list. Nobody — not Remi, not a server — can read a book they have not
shared.

**"What stops the model from moving money?"** It has no path to. The assistant
module imports nothing that can sign or write and exposes no tool-calling
interface. Payouts are started only by a deterministic parser. There is a test
for it.

**"Is the score real or is it an LLM guess?"** Computed in code from settled
payouts, with a confidence factor that holds down a record too thin to judge.
The model only puts the numbers into a sentence.

**"How is this different from Deel?"** Deel gives the business payroll. Remi
gives the business payroll and gives the worker an asset. That asset is why the
worker brings their next client, and it is what you would eventually lend
against.

## What does not ship

On-ramp, off-ramp, KYC. Multi-currency. Recurring payroll, batch payments, CSV
import. Invoices, bill scanning, Quickbooks sync. An assistant that can do
anything except answer. Admin dashboards, team roles. Actual lending. Native iOS
or Android unless Agora rules a PWA out.

Every one of these will feel essential around 2 AM Sunday. None of them ships.

## The risk that actually loses this

Scope. Five surfaces in seventy-two hours only works because Books, Passport and
the score are all views over records the payout already writes. The moment
anyone starts building bookkeeping that does not come from a receipt, the plan is
broken.

If the payout loop is not green by Sunday evening, the Passport does not get
polished and Envio does not get started. A working payout app with a thin
Passport beats a half-built credential system that cannot send money.
