import { ArrowLink, ArrowUpRight, Button, Check } from "./primitives.tsx";
import { FOOTER, STACK, TILES } from "./content.ts";
import type { StoredAccount } from "../lib/account.ts";
import { signInHref } from "../lib/router.ts";

/**
 * The bordered cell grid. Ramp fills this with customer logos; Remi has no
 * customers to name yet, so it holds the stack each piece actually runs on.
 * Inventing logos here would be claiming endorsements that do not exist.
 */
export function StackGrid() {
  return (
    <section className="section site-shell" id="how">
      <h2 className="section__head">
        Built on five pieces, <em>each doing one job well.</em>
      </h2>
      <p className="section__lead">
        No custody backend, no second auth provider, no database of record. The payout writes the
        ledger, and everything else is a view over it.
      </p>
      <div className="section__after" style={{ marginTop: "2.4rem" }}>
        <div className="gridwrap">
          <div className="cells">
            {STACK.map((entry) => (
              <a className="cell" key={entry.name} href={entry.href}>
                <span>
                  <span className="cell__name">{entry.name}</span>
                  <span className="cell__role">{entry.role}</span>
                </span>
                <span className="cell__arrow">
                  <ArrowUpRight />
                </span>
              </a>
            ))}
          </div>

          <a className="spotlight" href="#why">
            <span className="spotlight__arrow">
              <ArrowUpRight />
            </span>
            <span className="spotlight__brand">Cost per payout</span>
            <span className="spotlight__figure">$0.012</span>
            <span className="spotlight__caption">
              against a $26 average on $400 sent the ordinary way.
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

export function Numbers() {
  return (
    <section className="section--tight site-shell">
      <div className="statrow">
        <div>
          <b>6.49%</b>
          <p>Global average cost of sending money across borders.</p>
          <small>World Bank, Remittance Prices Worldwide, Q1 2025</small>
        </div>
        <div>
          <b>5%</b>
          <p>The G20 target the industry has missed for a decade.</p>
          <small>Same report. The digital-only average is 3.29%</small>
        </div>
        <div>
          <b>0</b>
          <p>
            Ways a contractor paid by three foreign clients can prove that income to a landlord or
            a lender.
          </p>
          <small>This is the part nobody is building</small>
        </div>
      </div>
    </section>
  );
}

export function Tiles() {
  return (
    <section className="section site-shell" id="payouts">
      <h2 className="section__head">
        One platform for the whole payout. <em>Four surfaces over one stream of records.</em>
      </h2>
      <div className="section__after" style={{ marginTop: "2.4rem" }}>
        <div className="tiles">
          {TILES.map((tile) => (
            <article className={`tile${tile.wide ? " tile--wide" : ""}`} key={tile.title}>
              <span className="tile__icon">
                <Check size={16} />
              </span>
              <h3>{tile.title}</h3>
              <p>{tile.body}</p>
              <span className="tile__foot">{tile.foot}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Passport() {
  return (
    <section className="section site-shell" id="passport">
      <div className="split">
        <div>
          <h2>Every payout writes an income record the worker owns.</h2>
          <p>
            The business sees a receipt and a bookkeeping entry. The contractor sees one line in a
            verifiable earnings history that follows them across every client they ever invoice.
          </p>
          <p>
            That is what turns a one-sided tool into a network. A worker with three clients on their
            record has a reason to bring the next business on.
          </p>
          <div style={{ marginTop: "1.6rem" }}>
            <ArrowLink href="#advances">See what it unlocks</ArrowLink>
          </div>
        </div>

        <div className="split__media">
          <div style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "1.2rem",
              }}
            >
              <strong style={{ fontFamily: "var(--display)", fontSize: "1.2rem" }}>Maria S.</strong>
              <span className="eyebrow">Verified · 7 records</span>
            </div>
            <div className="sitebars">
              {[
                { month: "Jun", width: 62, amount: "$600" },
                { month: "Jul", width: 98, amount: "$950" },
                { month: "Aug", width: 98, amount: "$950" },
                { month: "Sep", width: 100, amount: "$975" },
                { month: "Oct", width: 41, amount: "$400" },
              ].map((row) => (
                <div className="sitebar" key={row.month}>
                  <span className="sitebar__t">{row.month}</span>
                  <span className="sitebar__track">
                    <span className="sitebar__fill" style={{ width: `${row.width}%` }} />
                  </span>
                  <span className="sitebar__a">{row.amount}</span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: "1.1rem", fontSize: "0.82rem", color: "var(--faint)" }}>
              Example figures. Every line traces to a settled payout anyone can check, and Maria
              decides who gets the link.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Privacy() {
  return (
    <section className="section site-shell" id="privacy">
      <div className="split split--flip">
        <div>
          <h2>One passkey. Two keys. The worker holds the second.</h2>
          <p>
            A public income history attached to a named person would be worse than a bank statement.
            So the record and the identity are split, and the worker keeps the key that joins them.
          </p>
          <p>
            Sign in on a new phone with the same Face ID and both keys come back. No seed phrase, no
            backup file, no recovery email.
          </p>
        </div>

        <div className="split__media">
          <div style={{ width: "100%" }}>
            <div className="keycard">
              <h4>The key that gets paid</h4>
              <span className="keycard__salt">salt: mera default</span>
              <p>
                Signs payouts. Derived fresh for each confirmation and zeroed the moment it is used.
              </p>
            </div>
            <div className="keycard">
              <h4>The key that unlocks the record</h4>
              <span className="keycard__salt">salt: sha256(&quot;remi.payeebook.v1&quot;)</span>
              <p>
                Encrypts names and countries client-side. Never signs. Without it the settled records
                are amounts and dates attached to nobody.
              </p>
            </div>
            <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--faint)", textAlign: "center" }}>
              both derived from the same Face ID · neither is ever stored
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function WhyMonad() {
  return (
    <section className="section site-shell" id="why">
      <div className="why__heading">
        <span className="eyebrow">WHY A CHAIN</span>
        <h2>
          Why this needs a chain at all. <em>Not the reason you expect.</em>
        </h2>
      </div>

      <div className="why__layout">
        <article className="why__claim">
          <span className="why__number">01 / THE RECORD</span>
          <p className="why__opening">
            Moving a stablecoin and emitting an event works on any chain. Fast settlement is real —
            and beside the point.
          </p>
          <p className="why__statement">
            The chain is not where Remi moves money. It is where a worker keeps an income history
            that no single employer can own.
          </p>
          <p className="why__detail">
            In a company database, the worker is a tenant. As public state, a lender can verify the
            record without Remi&rsquo;s permission — and the worker keeps it if Remi disappears.
          </p>
          <span className="why__outcome">Portable by default <b>↗</b></span>
        </article>

        <div className="why__logic">
          <div className="why__logic-intro">
            <span className="why__number">02 / THE CONSTRAINT</span>
            <p>That choice has a cost. The cost is what picks the chain.</p>
          </div>
          <ol className="why__steps">
            <li>
              <span>01</span>
              <p><strong>Every payout must be written.</strong> A credential only means something when its history is complete — weekly, across millions of workers.</p>
            </li>
            <li>
              <span>02</span>
              <p><strong>Writes must stay close to free.</strong> Otherwise the product quietly starts skipping the very records that make it useful.</p>
            </li>
            <li>
              <span>03</span>
              <p><strong>Monad is the fit.</strong> Cheap high-volume writes, AUSD and passkey accounts are already native to the same place.</p>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

export function Advances() {
  return (
    <section className="section site-shell" id="advances">
      <div className="split">
        <div>
          <h2>The assistant does not guess. It underwrites.</h2>
          <p>
            An LLM reading your own rows is table stakes. Here every figure is computed in code —
            regularity, client concentration, trend, coverage, and a confidence factor that holds
            down a record too thin to judge. The model only puts those numbers into a sentence.
          </p>
          <p>
            The boundary is structural: the assistant imports nothing that can sign or write and
            exposes no tool-calling interface, so there is no path from a model output to a state
            change.
          </p>
        </div>
        <div className="split__media">
          <div className="stability-card">
            <header className="stability-card__head">
              <span className="eyebrow">Income stability</span>
              <span className="stability-card__verified"><i /> Verified record</span>
            </header>

            <div className="stability-card__body">
              <div className="stability-score">
                <div className="stability-score__ring">
                  <strong>84</strong>
                  <span>out of 100</span>
                </div>
                <div>
                  <b>Consistent income</b>
                  <p>Settled payments have a dependable rhythm.</p>
                </div>
              </div>

              <div className="stability-evidence">
                <p className="stability-evidence__label">What the record shows</p>
                <div className="stability-evidence__facts">
                  <div><b>10</b><span>settled payouts</span></div>
                  <div><b>2</b><span>attested clients</span></div>
                  <div><b>5</b><span>active months</span></div>
                </div>
                <div className="stability-evidence__signal">
                  <span>Monthly pattern</span>
                  <b>Regular</b>
                  <i><i /></i>
                </div>
              </div>
            </div>

            <footer className="stability-card__foot">
              <span>Record-backed capacity</span>
              <strong>Up to $399</strong>
              <small>Not a loan offer</small>
            </footer>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CTA({ account }: { account: StoredAccount | null }) {
  return (
    <section className="section--tight site-shell">
      <div className="cta">
        <div className="cta__grid">
          <div className="cta__copy">
            <span className="eyebrow" style={{ color: "var(--on-night-soft)" }}>
              Remi
            </span>
            <h2>
              Payroll that leaves the worker better off than a receipt.
            </h2>
            <p>
              The payout is the wedge. The income record is the product. The underwriting is the company.
            </p>
            <div className="cta__actions">
              <Button variant="accent" size="lg" href={account === null ? signInHref({ mode: "create" }) : "#/app"}>
                {account === null ? "Set up with Face ID" : "Open your dashboard"}
              </Button>
              <Button variant="onnight" size="lg" href="https://github.com/Rohit-ATS/Remi">
                Read the source
              </Button>
            </div>
          </div>

          <aside className="cta-record" aria-label="Example verified income record">
            <header className="cta-record__head">
              <span>REMI PASSPORT</span>
              <b><i /> Verified</b>
            </header>
            <div className="cta-record__amount">
              <span>Income received</span>
              <strong>$4,870<small>.00</small></strong>
              <p>10 settled payouts · 2 attested clients</p>
            </div>
            <div className="cta-record__rows">
              <div><span>Sep</span><i><i style={{ width: "89%" }} /></i><b>$975</b></div>
              <div><span>Aug</span><i><i style={{ width: "86%" }} /></i><b>$950</b></div>
              <div><span>Jul</span><i><i style={{ width: "86%" }} /></i><b>$950</b></div>
            </div>
            <footer className="cta-record__foot">
              <span>Portable income history</span>
              <b>Owned by the worker ↗</b>
            </footer>
          </aside>
        </div>
      </div>
    </section>
  );
}

export function Footer({ account }: { account: StoredAccount | null }) {
  return (
    <footer className="footer">
      <div className="site-shell">
        <div className="footer__cols">
          <div className="footer__col">
            <a href="#top" aria-label="Remi home">
              <span className="wordmark">remi</span>
            </a>
            <p className="footer__blurb">
              Payroll for contractors abroad that writes them an income record they own. Settles in
              AUSD on Monad. Remi never holds a key and never takes custody of funds.
            </p>
            <div style={{ marginTop: "1.2rem" }}>
              <ArrowLink href={account === null ? signInHref({ mode: "create" }) : "#/app"}>
                {account === null ? "Get started" : "Open your dashboard"}
              </ArrowLink>
            </div>
          </div>

          {FOOTER.map((col) => (
            <div className="footer__col" key={col.heading}>
              <h5>{col.heading}</h5>
              <ul>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="footer__base">
          <span>© {new Date().getFullYear()} Remi. MIT licensed.</span>
          <span>
            Figures on this page are examples except the cited World Bank average. Remi does not
            lend.
          </span>
        </div>
      </div>
    </footer>
  );
}
