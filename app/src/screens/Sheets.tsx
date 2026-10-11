import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatUsd } from "../lib/money.ts";
import type { PayeeEntry } from "../lib/vault.ts";
import { unlockName } from "../lib/unlock.ts";

export function Sheet({
  children,
  label,
  dismissible = false,
  placement = "bottom",
  onClose,
}: {
  children: ReactNode;
  label?: string;
  /** Whether the backdrop dismisses. Off by default, and deliberately so. */
  dismissible?: boolean;
  /**
   * Where it sits. "bottom" rises from the edge, which is right for something
   * a thumb is about to act on. "centre" lands in the middle of the screen
   * and brings nothing of its own — no panel, no handle — so what it is
   * holding is the object itself rather than a form inside a tray.
   */
  placement?: "bottom" | "centre";
  onClose: () => void;
}) {
  // Escape always closes. The backdrop only does when the caller says so: a
  // mis-tap next to the Confirm button should never silently cancel a payout,
  // but a sheet that is only showing you something costs nothing to reopen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Through a portal, because a `transform` anywhere up the tree — `.block`
  // has one — makes that ancestor the containing block for `position: fixed`,
  // and the sheet then lays itself over the card it came from instead of over
  // the page. Nothing above body can capture it here.
  return createPortal(
    <div
      className="sheet-backdrop"
      data-placement={placement}
      role="dialog"
      aria-modal="true"
      {...(label !== undefined ? { "aria-label": label } : {})}
      onClick={dismissible ? onClose : undefined}
    >
      {/* The sheet is inside the backdrop, so a click on it would bubble out
          and close the thing it was aimed at. */}
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        {placement === "bottom" && <span className="sheet-handle" aria-hidden="true" />}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export type PendingPayout = {
  label: string;
  amount: bigint;
  memo: string;
  category: string;
  entry: PayeeEntry | null;
};

export function ConfirmSheet({
  pending,
  categories,
  networkFee,
  busy,
  error,
  needsApproval,
  onCategory,
  onConfirm,
  onClose,
}: {
  pending: PendingPayout;
  categories: string[];
  networkFee: string | null;
  busy: boolean;
  error: string | null;
  needsApproval: boolean;
  onCategory: (category: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="stack-sm">
        <p className="eyebrow">Confirm payout</p>
        <p className="receipt-amount">{formatUsd(pending.amount)}</p>
        <p className="hushed">
          to {pending.entry?.name ?? pending.label}
          {pending.entry?.country ? ` · ${pending.entry.country}` : ""}
        </p>
      </div>

      <dl style={{ margin: 0 }}>
        {pending.memo !== "" && (
          <div className="kv">
            <dt>For</dt>
            <dd>{pending.memo}</dd>
          </div>
        )}
        <div className="kv">
          <dt>Network fee</dt>
          <dd>{networkFee ?? "—"}</dd>
        </div>
        <div className="kv">
          <dt>Arrives in</dt>
          <dd>about 1 second</dd>
        </div>
      </dl>

      <div className="field">
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={pending.category}
          onChange={(event) => onCategory(event.target.value)}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {needsApproval && (
        <div className="notice notice-accent">
          First payout from this account needs a one-time approval. Confirming will ask for{" "}
          {unlockName()} twice: once to approve, once to pay.
        </div>
      )}

      {error !== null && <div className="notice notice-error">{error}</div>}

      <button
        type="button"
        className="btn btn-accent btn-block"
        onClick={onConfirm}
        disabled={busy}
      >
        {busy ? <span className="spinner" /> : `Confirm with ${unlockName()}`}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose} disabled={busy}>
        Cancel
      </button>
    </Sheet>
  );
}

/**
 * The unknown-payee path. A name the parser read but the book does not know
 * opens this rather than failing, so the payout continues in one flow.
 */
export function PayeeSheet({
  label,
  busy,
  error,
  onSave,
  onClose,
}: {
  label: string;
  busy: boolean;
  error: string | null;
  onSave: (entry: PayeeEntry) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(label);
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");

  const valid = /^0x[0-9a-fA-F]{40}$/.test(address.trim()) && name.trim() !== "";

  return (
    <Sheet onClose={onClose}>
      <div className="stack-sm">
        <p className="eyebrow">New recipient</p>
        <h2>Who is {label}?</h2>
        <p className="hushed small">
          Saved once, then {label} is just a name you can say. The name and country stay encrypted
          on this device and never reach the server.
        </p>
      </div>

      <div className="field">
        <label htmlFor="payee-name">Full name</label>
        <input
          id="payee-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Maria Santos"
        />
      </div>
      <div className="field">
        <label htmlFor="payee-address">Where to send it</label>
        <input
          id="payee-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoCapitalize="none"
        />
      </div>
      <div className="field">
        <label htmlFor="payee-country">Country</label>
        <input
          id="payee-country"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          placeholder="Philippines"
        />
      </div>

      {error !== null && <div className="notice notice-error">{error}</div>}

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!valid || busy}
        onClick={() =>
          onSave({
            label,
            name: name.trim(),
            address: address.trim(),
            country: country.trim(),
          })
        }
      >
        {busy ? <span className="spinner" /> : "Save and continue"}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose} disabled={busy}>
        Cancel
      </button>
    </Sheet>
  );
}
