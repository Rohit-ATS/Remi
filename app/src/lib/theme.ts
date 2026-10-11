// Light or dark, chosen once and applied to every surface.
//
// The OS preference is the default, and tokens.css already honours it. This is
// only the override: a choice is written to <html data-theme> so the same
// attribute governs the landing page, the sign-in screen and the dashboard,
// and remembered so it survives the trip between them.

const STORAGE_KEY = "remi.theme.v1";

export type Theme = "light" | "dark";

/** The chosen theme, or null when the OS preference is being followed. */
export function storedTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    // A private window still gets a working toggle; it just forgets.
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** What the page is actually showing right now. */
export function activeTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme | null): void {
  if (theme === null) {
    document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
    return;
  }
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The attribute is set either way, so this session is correct regardless.
  }
}

/** Called once at startup, before first paint, so there is no flash. */
export function initTheme(): void {
  const stored = storedTheme();
  if (stored !== null) document.documentElement.setAttribute("data-theme", stored);
}

export function toggleTheme(): Theme {
  const next: Theme = activeTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
