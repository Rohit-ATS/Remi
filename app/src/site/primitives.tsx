// Small shared pieces: the icon set and the two link/button shapes every
// section reuses. Icons are inline SVG rather than a font or a package, so the
// page ships with no icon dependency and each glyph inherits currentColor.

import type { ReactNode } from "react";

export function Chevron({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRight({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowUpRight({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5 11L11 5M11 5H6M11 5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Close({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Burger({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Check({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** An arrow dropping into a tray: the thing that is about to be on your disk. */
export function Download({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.4v7.2M5.2 7l2.8 2.8L10.8 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 11.8v.6a1.4 1.4 0 0 0 1.4 1.4h7.6a1.4 1.4 0 0 0 1.4-1.4v-.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** The Remi mark: a receipt edge, which is the product's native object. */
export function Wordmark() {
  return (
    <span className="wordmark">
      remi
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3 1.6h10v12.8l-2.5-1.9-2.5 1.9-2.5-1.9-2.5 1.9z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M5.6 5.2h4.8M5.6 7.8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: "accent" | "dark" | "ghost" | "ghostdark" | "onnight";
  size?: "md" | "lg";
  href?: string;
  type?: "button" | "submit";
  onClick?: () => void;
};

export function Button({
  children,
  variant = "dark",
  size = "md",
  href,
  type = "button",
  onClick,
}: ButtonProps) {
  if (href !== undefined) {
    return (
      <a className="btn" data-variant={variant} data-size={size} href={href}>
        {children}
      </a>
    );
  }
  return (
    <button className="btn" data-variant={variant} data-size={size} type={type} onClick={onClick}>
      {children}
    </button>
  );
}

export function ArrowLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a className="arrowlink" href={href}>
      {children}
      <ArrowRight />
    </a>
  );
}
