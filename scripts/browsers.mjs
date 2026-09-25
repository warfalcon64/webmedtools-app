// Shared by the check scripts: the browsers they drive, and the running build they point at.
import {
  Browser,
  computeSystemExecutablePath,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
  resolveBuildId,
} from "@puppeteer/browsers";
import puppeteer from "puppeteer-core";

export const CHECKS_DIR = ".checks";
export const DEFAULT_URL = "http://localhost:8788";

/** Stops with the command to run when nothing answers at `url`. */
export async function requireServer(url) {
  let ok = false;
  try {
    ok = (await fetch(url)).ok;
  } catch {}
  if (!ok) {
    console.error(
      `The site is not being served at ${url}. Build and serve it first:\n  npm run build && npx wrangler dev --port 8788`,
    );
    process.exit(2);
  }
}

// Chrome is the one installed on this machine; Firefox is downloaded once into .checks/browsers (about 100 MB).
async function firefoxPath() {
  const cacheDir = `${CHECKS_DIR}/browsers`;
  const installed = (await getInstalledBrowsers({ cacheDir })).find((b) => b.browser === Browser.FIREFOX);
  if (installed) return installed.executablePath;
  const platform = detectBrowserPlatform();
  const buildId = await resolveBuildId(Browser.FIREFOX, platform, "stable");
  console.log(`Downloading Firefox ${buildId} into ${cacheDir} (once)...`);
  return (await install({ browser: Browser.FIREFOX, buildId, cacheDir })).executablePath;
}

/** Launches headless Chrome or Firefox. */
export async function launch(kind) {
  if (kind !== "chrome" && kind !== "firefox") throw new Error(`No such browser: ${kind}`);
  if (kind === "firefox") {
    return puppeteer.launch({ browser: "firefox", executablePath: await firefoxPath(), headless: true });
  }
  const executablePath = computeSystemExecutablePath({ browser: Browser.CHROME, channel: "stable" });
  return puppeteer.launch({ executablePath, headless: true });
}

/** Parses `--name value` pairs over the defaults; a flag not in the defaults, or with no value, is an error. */
export function parseFlags(argv, defaults) {
  const opts = { ...defaults };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    const value = argv[i + 1];
    if (!argv[i].startsWith("--") || !(key in defaults) || value === undefined || value.startsWith("--")) {
      throw new Error(`Unknown or incomplete flag: ${argv[i]}`);
    }
    opts[key] = value;
  }
  return opts;
}

/** Splits a comma-separated flag, trimming each item; any item not in `allowed` is an error. */
export function listFlag(value, allowed, name) {
  const items = value.split(",").map((s) => s.trim());
  const bad = items.filter((item) => !allowed.includes(item));
  if (bad.length) throw new Error(`--${name} takes ${allowed.join(", ")}; not ${bad.join(", ")}`);
  return items;
}
