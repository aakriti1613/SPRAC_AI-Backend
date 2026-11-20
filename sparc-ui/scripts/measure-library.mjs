// Re-measures every library component (size + accessibility) and rewrites
// library/quality.size.json and library/quality.a11y.json.
// Run after adding or changing a component:  npm run library:measure
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vitest = require.resolve("vitest/vitest.mjs");
const result = spawnSync(process.execPath, [vitest, "run", "test/library-size.test.ts", "test/library-a11y.test.tsx"], {
  stdio: "inherit",
  env: { ...process.env, WRITE_QUALITY: "1" },
});
process.exit(result.status ?? 1);
