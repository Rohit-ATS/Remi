import { useState } from "react";
import { ArrowUpRight, Button, Check } from "./primitives.tsx";
import { TICKER } from "./content.ts";
import { navigate, signInHref } from "../lib/router.ts";

/**
 * The front door.
 *
 * This used to validate an address and say "noted" to a list that did not
 * exist. There is an account system one route away now, so a valid address
 * goes there instead and arrives with the name field already filled: the
 * button means what it says.
 */
function Capture() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "error">("idle");

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(trimmed)) {
      setState("error");
      return;
    }
    navigate(signInHref({ mode: "create", email: trimmed }).slice(1));
  };

  return (
    <div>
      <form className="capture" onSubmit={submit} noValidate>
        <label className="sr-only" htmlFor="email">
          Your work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="What's your work email?"
          value={email}
          autoComplete="email"
          onChange={(event) => {
            setEmail(event.target.value);
            if (state !== "idle") setState("idle");
          }}
        />
        <Button variant="accent" type="submit">
          Get started free
        </Button>
      </form>

      <p className="capture__note" data-state={state === "idle" ? undefined : state}>
        {state === "error"
          ? "That does not look like an email address."
          : "No card, no contract. Your passkey is the whole account."}
      </p>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero__dots dots" aria-hidden="true" />
      <div className="site-shell hero__inner">
        <div className="hero__copy">
          <p className="livestat">
            Global average cost to send money abroad:
            <span className="livestat__chip">6.49%</span>
          </p>

          <h1>Pay in seconds. Prove it forever.</h1>

          <p className="hero__sub">
            Payouts, books, and an income record your contractors actually{" "}
            <span className="dotted" title="They hold the key. Not you, and not Remi.">
              own
            </span>{" "}
            — settled in about a second.
          </p>

          <Capture />
        </div>

        <div className="hero-flow" aria-hidden="true">
          <div className="hero-flow__topline">
            <span>PAYMENT RAIL</span>
            <span>0.9 SEC</span>
          </div>
          <div className="hero-flow__stage">
            <div className="hero-flow__line"><i /></div>
            <div className="hero-flow__node hero-flow__node--send">
              <span className="hero-flow__node-label">01 / SEND</span>
              <b>$400.00</b>
              <small>to Maria</small>
            </div>
            <div className="hero-flow__node hero-flow__node--receipt">
              <span className="hero-flow__node-label">02 / SETTLED</span>
              <b>PAID</b>
              <small>Receipt 0001</small>
            </div>
            <div className="hero-flow__node hero-flow__node--passport">
              <span className="hero-flow__node-label">03 / KEEP</span>
              <b>+ $400</b>
              <small>Income record</small>
            </div>
          </div>
          <p className="hero-flow__caption"><i /> The payout becomes a record the worker can take anywhere.</p>
        </div>
      </div>

      <div className="site-shell">
        <div className="showcase">
          <div className="dots" aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: 0.6 }} />
          <div className="showcase__grid">
            <div className="showcase__copy">
              <p className="eyebrow" style={{ marginBottom: "0.7rem" }}>
                One sentence, one Face ID
              </p>
              <h3>&ldquo;Pay Maria four hundred dollars for October&rdquo;</h3>
              <p>
                The parser reads it, the sheet confirms it, Face ID sends it. The money lands in
                about a second and costs about a cent to move.
              </p>
              <ul className="showcase__list">
                <li>
                  <Check /> No seed phrase, no extension, no custody account
                </li>
                <li>
                  <Check /> The books write themselves from the receipt
                </li>
                <li>
                  <Check /> The worker gets a record they can take anywhere
                </li>
              </ul>
            </div>

            <div className="receiptcard">
              <div className="receiptcard__top">
                <span className="eyebrow">Receipt 0001</span>
                <span className="stamp">PAID</span>
              </div>
              <p className="receiptcard__amount">$400.00</p>
              <dl>
                <div className="rowline">
                  <dt>Recipient</dt>
                  <dd>Maria · PH</dd>
                </div>
                <div className="rowline">
                  <dt>Category</dt>
                  <dd>Contractor</dd>
                </div>
                <div className="rowline">
                  <dt>Network fee</dt>
                  <dd>$0.012</dd>
                </div>
                <div className="rowline">
                  <dt>Arrived in</dt>
                  <dd>0.9s</dd>
                </div>
              </dl>
              <p style={{ marginTop: "1rem", fontSize: "0.82rem", color: "var(--faint)" }}>
                Also written: Maria&rsquo;s 7th record, 3rd client <ArrowUpRight />
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The agents ticker. Duplicated once so the marquee loops without a seam. */
export function Ticker() {
  const items = [...TICKER, ...TICKER];
  return (
    <div className="ticker">
      <span className="ticker__label">What a payout costs</span>
      <div className="ticker__viewport">
        <div className="ticker__track">
          {items.map((item, index) => (
            <span className="ticker__item" key={`${item.label}-${index}`} aria-hidden={index >= TICKER.length}>
              {item.label}:<span className="ticker__value">{item.value}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
