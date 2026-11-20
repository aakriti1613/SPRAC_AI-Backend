// @vitest-environment node
// Size budget: each component is bundled on its own (shared runtime such as
// React, the router, lucide and @core are provided by the shell and excluded),
// minified and gzipped. It must fit its style level's budget.
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { STYLE_LEVELS } from "../../sparc/styleLevels.js";
import { discoverComponents, saveOrCompare } from "./library/quality";

const SHELL_PROVIDED = ["react", "react-dom", "react/jsx-runtime", "react-router-dom", "lucide-react", "clsx", "tailwind-merge", "@core/*", "@contracts"];

async function gzippedKb(file: string): Promise<number> {
  const result = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    external: SHELL_PROVIDED,
    logLevel: "silent",
  });
  const bytes = gzipSync(Buffer.from(result.outputFiles[0].contents), { level: 9 }).length;
  return Math.round((bytes / 1024) * 10) / 10;
}

describe("component size budgets", () => {
  const components = discoverComponents();
  const report: Record<string, { sizeKb: number; budgetKb: number }> = {};

  it.each(components)("$key fits its style budget", async ({ key, level, file }) => {
    const budgetKb = (STYLE_LEVELS as Record<string, { maxComponentKb: number }>)[level].maxComponentKb;
    const sizeKb = await gzippedKb(file);
    report[key] = { sizeKb, budgetKb };
    expect(sizeKb).toBeLessThanOrEqual(budgetKb);
  });

  it("report is saved / up to date", () => {
    expect(Object.keys(report)).toHaveLength(components.length);
    saveOrCompare("size", report);
  });
});
