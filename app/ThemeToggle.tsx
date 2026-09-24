"use client";

import { MoonIcon, SunIcon } from "./icons";
import { THEME_KEY, type Theme } from "./theme";

// The theme lives on <html data-theme>, set before the page draws (theme.ts). The button shows the moon in light mode
// and the sun in dark mode through CSS alone, so the server's HTML and the first render always agree.
export function ThemeToggle() {
  const toggle = () => {
    const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage is blocked: the choice lasts until the page is left.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark mode"
      title="Light or dark mode"
      className="grid size-10 place-items-center rounded-full text-muted hover:bg-accent-soft hover:text-accent"
    >
      <MoonIcon className="size-5 dark:hidden" />
      <SunIcon className="hidden size-5 dark:block" />
    </button>
  );
}
