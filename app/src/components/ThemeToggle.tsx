import { useState } from "react";
import { activeTheme, toggleTheme, type Theme } from "../lib/theme.ts";

/**
 * One control, placed in both navs.
 *
 * It writes an attribute on <html>, so the landing page and the dashboard
 * change together and stay changed across the move between them.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => activeTheme());

  return (
    <button
      className="themetoggle"
      type="button"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      onClick={() => setTheme(toggleTheme())}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

function Moon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 9.6A5.8 5.8 0 016.4 2.5a5.8 5.8 0 107.1 7.1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Sun() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2L3.1 3.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
