// Verify an assembled project two ways:
//   1. buildProject() — actually build it with Vite (proves it compiles + bundles).
//      Reuses sparc-ui's installed Vite, so no per-project install is needed.
//   2. configChecklist() — static checks derived from the config itself: every
//      required room has a component, required fields exist, option fields have
//      options, modules have list columns. This is the "test the site against
//      what the config promised" idea, without a browser.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBlueprint, roomsOf } from "../../sparc/index.js";

const SPARC_UI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "sparc-ui");
const VITE_BIN = path.join(SPARC_UI, "node_modules", "vite", "bin", "vite.js");

/** Build the project at `dir`. Returns { ok, ms, bundleKb, chunks, error }. */
export function buildProject(dir, { timeoutMs = 180000 } = {}) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [VITE_BIN, "build"], { cwd: dir, encoding: "utf8", timeout: timeoutMs });
  const ms = Date.now() - started;
  const output = `${res.stdout || ""}\n${res.stderr || ""}`;
  if (res.status !== 0) {
    return { ok: false, ms, error: output.split("\n").filter((l) => /error|Error|failed/i.test(l)).slice(0, 8).join("\n") || output.slice(-800) };
  }
  const assetsDir = path.join(dir, "dist", "assets");
  let bundleKb = 0;
  const chunks = [];
  if (fs.existsSync(assetsDir)) {
    for (const f of fs.readdirSync(assetsDir)) {
      const kb = +(fs.statSync(path.join(assetsDir, f)).size / 1024).toFixed(1);
      bundleKb += kb;
      if (f.endsWith(".js")) chunks.push({ file: f, kb });
    }
  }
  return { ok: true, ms, bundleKb: +bundleKb.toFixed(1), chunks: chunks.sort((a, b) => b.kb - a.kb) };
}

const OPTION_TYPES = new Set(["select", "radio", "multi-select", "checkbox-group"]);
/** Site rooms the shell builds itself (no `sections` entry needed). */
const SHELL_BUILT = new Set([
  "navbar",
  "footer",
  "not-found",
  "contact-form",
  "newsletter",
  // shop and booking rooms are filled from `store` / `booking`, checked separately below
  "product-page",
  "cart",
  "checkout-payment",
  "order-confirmation",
  "services-list",
  "slot-picker",
  "booking-form",
  "booking-confirmation",
]);

/**
 * Checks derived from the config. `composition` (optional) lets us confirm every
 * required room actually has a component chosen.
 * Returns { ok, checks: [{ name, pass, detail }] }.
 */
export function configChecklist(config, composition) {
  const bp = getBlueprint(config.websiteType);
  const checks = [];
  const add = (name, pass, detail = "") => checks.push({ name, pass, detail });

  const enabled = new Set([...bp.rooms.required, ...bp.rooms.optional.filter((r) => (config.rooms?.enabled || []).includes(r))]);

  if (composition) {
    for (const room of enabled) {
      if (room === "form-field") continue;
      add(`room "${room}" has a component`, Boolean(composition.picks?.[room]), composition.picks?.[room]?.slug || "missing");
    }
  }

  if (config.websiteType === "admin-portal") {
    add("has at least one module", config.modules.length > 0);
    for (const m of config.modules) {
      add(`module "${m.id}" has a required field`, m.fields.some((f) => f.required), "");
      for (const f of m.fields) {
        if (OPTION_TYPES.has(f.type)) add(`${m.id}.${f.key} (${f.type}) has options`, Array.isArray(f.options) && f.options.length > 0);
      }
      add(`module "${m.id}" list columns are real fields`, m.listColumns.every((c) => m.fields.some((f) => f.key === c)));
    }
  } else {
    add("hero has a title", Boolean(config.sections?.hero?.title));
    for (const room of enabled) {
      if (SHELL_BUILT.has(room)) continue;
      add(`section "${room}" has content`, Boolean(config.sections?.[room]));
    }
    if (config.websiteType === "ecommerce") {
      add("store has at least one product", (config.sections?.["product-list"]?.products?.length ?? 0) > 0);
      add("store payment is set up", config.store?.payment?.mode === "test" || Boolean(config.store?.payment?.endpoint), config.store?.payment?.mode || "missing");
    }
    if (config.websiteType === "booking") {
      add("booking has at least one service", (config.booking?.services?.length ?? 0) > 0);
      add("booking has opening hours", Boolean(config.booking?.availability?.open && config.booking?.availability?.close));
    }
  }

  return { ok: checks.every((c) => c.pass), checks };
}

/** Everything about a generated project, for the report. */
export function verifyProject(dir, config, composition, { build = true } = {}) {
  const checklist = configChecklist(config, composition);
  const built = build ? buildProject(dir) : { ok: null, skipped: true };
  return { ok: checklist.ok && (built.ok || built.skipped === true), checklist, build: built };
}

export { roomsOf };
