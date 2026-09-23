import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // scripts/ holds the peer-review tool, whose tests run under `node --test`; Webmedtools/ is the legacy app.
    exclude: [...configDefaults.exclude, "scripts/**", "Webmedtools/**"],
  },
});
