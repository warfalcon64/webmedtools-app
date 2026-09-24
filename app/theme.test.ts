import { describe, expect, it } from "vitest";
import { pickTheme, themeScript } from "./theme";

// Runs the inline script as the browser would, with the storage and device setting given.
function run(storage: { getItem: (key: string) => string | null }, prefersDark: boolean) {
  const documentElement = { dataset: {} as Record<string, string> };
  new Function("localStorage", "matchMedia", "document", themeScript)(storage, () => ({ matches: prefersDark }), {
    documentElement,
  });
  return documentElement.dataset.theme;
}

describe("pickTheme", () => {
  it("keeps a saved theme over the device's setting", () => {
    expect(pickTheme("light", true)).toBe("light");
    expect(pickTheme("dark", false)).toBe("dark");
  });

  it("follows the device when nothing valid is saved", () => {
    expect(pickTheme(null, true)).toBe("dark");
    expect(pickTheme(null, false)).toBe("light");
    expect(pickTheme("purple", true)).toBe("dark");
    expect(pickTheme("", false)).toBe("light");
  });
});

describe("themeScript", () => {
  it("sets the theme from storage, then from the device", () => {
    expect(run({ getItem: () => "dark" }, false)).toBe("dark");
    expect(run({ getItem: () => null }, true)).toBe("dark");
    expect(run({ getItem: () => "junk" }, false)).toBe("light");
  });

  it("still sets a theme when storage throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(run(blocked, true)).toBe("dark");
  });
});
