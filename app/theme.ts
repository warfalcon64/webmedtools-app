export type Theme = "light" | "dark";

/** The key in localStorage that holds the viewer's choice, once they have used the toggle. */
export const THEME_KEY = "theme";

/** The saved choice when it is a theme, otherwise the device's setting. */
export function pickTheme(saved: string | null, prefersDark: boolean): Theme {
  return saved === "light" || saved === "dark" ? saved : prefersDark ? "dark" : "light";
}

// Runs in <head> before the page draws, so the first paint is already in the right theme. Reading storage can throw
// (blocked cookies, some private modes); the device's setting is used then.
export const themeScript = `(function(){var pick=${pickTheme.toString()};var saved=null;
try{saved=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}
document.documentElement.dataset.theme=pick(saved,matchMedia("(prefers-color-scheme: dark)").matches)})()`;
