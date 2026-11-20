// The three ways of building a website that Phase 8 compares, all measured with
// the same checks:
//   (a) templates only  - how the prototype worked: fixed templates and industry presets
//   (b) SPARC           - plan -> compose verified components -> assemble -> verify
//   (c) AI writes all   - one model call writes the whole site as code
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { getBlueprint } from "../../sparc/index.js";
import { MODULE_LIBRARY } from "../../sparc/modules.js";
import { assembleProject, GENERATED_DIR } from "../assemble/project.js";
import { buildProject, verifyProject } from "../assemble/verify.js";
import { composeSite } from "../retrieve/compose.js";
import { planSite } from "../plan/index.js";
import { isGeminiUnavailable } from "./gemini.js";
import { keywordCoverage, countCodeLines, extractCode, moduleRecall, round, scanSource, sha, share } from "./metrics.js";

export const EVAL_DIR = path.join(GENERATED_DIR, "eval");

const STYLE_TEXT = {
  basic: "plain and minimal, fast to load, no animation",
  good: "clean and professional with soft shadows and smooth hover effects",
  amazing: "modern and polished with smooth animations",
  astonishing: "stunning, with bold visuals and impressive animated effects",
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
export function readFiles(dir, { skip = ["node_modules", "dist"] } = {}) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx?|tsx?|json|css|html)$/.test(e.name)) out.push({ path: path.relative(dir, p).replace(/\\/g, "/"), content: fs.readFileSync(p, "utf8") });
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/** Raw and gzip size (KB) of everything the build produced. */
export function distSizes(dir) {
  const assets = path.join(dir, "dist", "assets");
  let raw = 0;
  let gz = 0;
  if (fs.existsSync(assets)) {
    for (const f of fs.readdirSync(assets)) {
      const buf = fs.readFileSync(path.join(assets, f));
      raw += buf.length;
      gz += zlib.gzipSync(buf, { level: 9 }).length;
    }
  }
  return { rawKb: round(raw / 1024, 1), gzipKb: round(gz / 1024, 1) };
}

export function removeDir(dir) {
  for (let i = 0; i < 4; i += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      /* Windows can keep a file busy for a moment */
    }
  }
}

const tokensOf = (gemini) => (gemini ? { calls: gemini.usage.calls, input: gemini.usage.inputTokens, output: gemini.usage.outputTokens, total: gemini.usage.totalTokens, retries: gemini.usage.retries } : { calls: 0, input: 0, output: 0, total: 0, retries: 0 });

// ---------------------------------------------------------------------------
// (b) SPARC
// ---------------------------------------------------------------------------
/**
 * engine: "offline" (no key) or "gemini" (pass a metered `gemini`).
 * Returns one flat result row.
 */
export async function runSparc(req, { engine, gemini, embedder, records, keep = false }) {
  const t0 = Date.now();
  const row = { id: req.id, system: `sparc-${engine}`, type: req.type, style: req.style };
  try {
    const plan = await planSite(req.description, { embedder, styleLevel: req.style, callGemini: engine === "gemini" ? gemini.callJson : null });
    row.planMs = Date.now() - t0;
    row.engineUsed = plan.engine;
    row.fallback = Boolean(plan.fallbackReason);
    // The Gemini planner did not run (quota, key, outage): this is not a result for it, so do not measure or build.
    if (engine === "gemini" && plan.fallbackReason) {
      return { id: req.id, system: row.system, type: req.type, style: req.style, unavailable: true, reason: String(plan.fallbackReason).slice(0, 200), tokens: tokensOf(gemini), totalMs: Date.now() - t0 };
    }
    row.typeGot = plan.config.websiteType;
    row.typeCorrect = plan.config.websiteType === req.type;
    row.planOk = plan.ok;
    row.modules = plan.modulesUsed.map((m) => m.id);
    row.moduleRecall = round(moduleRecall(req.mustInclude, row.modules));
    if (!plan.ok) {
      row.ok = false;
      row.errors = plan.errors;
      row.totalMs = Date.now() - t0;
      row.tokens = tokensOf(gemini);
      return row;
    }

    const name = `sparc-${engine}-${req.id}`;
    const outDir = path.join(EVAL_DIR, "sparc");
    const assembled = assembleProject(plan.config, { name, records, outDir });
    if (!assembled.ok) throw new Error(assembled.errors.join("; "));
    const verify = verifyProject(assembled.dir, plan.config, assembled.composition, { build: true });

    const files = readFiles(path.join(assembled.dir, "src"));
    const configText = JSON.stringify(plan.config, null, 2);
    const totalLines = countCodeLines(files) + configText.split("\n").length;
    const newLines = configText.split("\n").length;
    const scan = scanSource(files);
    row.checks = { passed: verify.checklist.checks.filter((c) => c.pass).length, total: verify.checklist.checks.length };
    row.buildOk = verify.build.ok === true;
    row.buildMs = verify.build.ms;
    Object.assign(row, distSizes(assembled.dir));
    row.ok = verify.ok && plan.ok;
    row.components = Object.keys(assembled.composition.picks).length;
    row.newCodeLines = assembled.lock.reuse.newCode; // lines of hand-written code: always 0
    row.newConfigLines = newLines;
    row.totalLines = totalLines;
    row.reusePct = round(share(totalLines - newLines, totalLines) * 100, 1);
    row.scan = { total: scan.total, byKind: scan.byKind, byRule: scan.byRule };
    row.keywordCoverage = round(keywordCoverage(configText, req.keywords));
    row.configHash = sha({ config: plan.config, components: assembled.lock.components });
    row.errors = verify.ok ? [] : verify.checklist.checks.filter((c) => !c.pass).map((c) => c.name);
    if (!keep) removeDir(assembled.dir);
  } catch (e) {
    row.ok = false;
    row.errors = [String(e.message ?? e).slice(0, 300)];
  }
  row.totalMs = Date.now() - t0;
  row.tokens = tokensOf(gemini);
  return row;
}

// ---------------------------------------------------------------------------
// (c) AI writes all the code
// ---------------------------------------------------------------------------
export function aiPrompt(req) {
  return `You are building a complete website as ONE React file.

Request: "${req.description}"
Style: ${STYLE_TEXT[req.style] ?? STYLE_TEXT.good}

Rules:
- Output ONLY one code block with the full contents of src/App.jsx. No explanation.
- React 19 function component with a default export named App. Style it with Tailwind CSS utility classes (already set up).
- You may import only from "react", "react-router-dom" (App is already inside a BrowserRouter) and "lucide-react". No other packages.
- No images from the internet and no API calls. Keep all data inline in the file, with realistic sample data.
- The site must really work: every button and form does something, using React state.
- Make it responsive, accessible (labels, alt text, headings) and professional.`;
}

const AI_VITE = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({ plugins: [react(), tailwindcss()], build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1100 } });
`;

/** Wrap a generated App.jsx in the smallest project that can build it. */
export function scaffoldAiProject(dir, appCode, title = "Generated site") {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: path.basename(dir), private: true, type: "module" }, null, 2));
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title.replace(/[<>&"]/g, "")}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>\n`);
  fs.writeFileSync(path.join(dir, "vite.config.js"), AI_VITE);
  fs.writeFileSync(path.join(dir, "src", "index.css"), '@import "tailwindcss";\n');
  fs.writeFileSync(
    path.join(dir, "src", "main.jsx"),
    'import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport { BrowserRouter } from "react-router-dom";\nimport App from "./App.jsx";\nimport "./index.css";\ncreateRoot(document.getElementById("root")).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);\n'
  );
  fs.writeFileSync(path.join(dir, "src", "App.jsx"), `${appCode}\n`);
}

export async function runAi(req, { gemini, keep = false }) {
  const t0 = Date.now();
  const row = { id: req.id, system: "ai-code", type: req.type, style: req.style };
  try {
    const reply = await gemini.callText(aiPrompt(req));
    row.generateMs = Date.now() - t0;
    const code = extractCode(reply);
    row.codeHash = sha(code);
    if (!code) {
      row.ok = false;
      row.buildOk = false;
      row.errors = ["the model did not return code"];
    } else {
      const dir = path.join(EVAL_DIR, "ai", `ai-${req.id}`);
      scaffoldAiProject(dir, code, req.description.slice(0, 60));
      const build = buildProject(dir);
      const files = [{ path: "src/App.jsx", content: code }];
      const scan = scanSource(files);
      row.buildOk = build.ok;
      row.buildMs = build.ms;
      if (build.ok) Object.assign(row, distSizes(dir));
      else row.errors = [String(build.error).slice(0, 300)];
      row.newCodeLines = countCodeLines(files);
      row.totalLines = row.newCodeLines;
      row.newConfigLines = 0;
      row.reusePct = 0;
      row.scan = { total: scan.total, byKind: scan.byKind, byRule: scan.byRule };
      row.keywordCoverage = round(keywordCoverage(code, req.keywords));
      row.ok = build.ok;
      if (!keep) removeDir(dir);
    }
  } catch (e) {
    if (isGeminiUnavailable(e)) {
      return { id: req.id, system: "ai-code", type: req.type, style: req.style, unavailable: true, reason: String(e.message ?? e).slice(0, 200), tokens: tokensOf(gemini), totalMs: Date.now() - t0 };
    }
    row.ok = false;
    row.buildOk = false;
    row.errors = [String(e.message ?? e).slice(0, 300)];
  }
  row.totalMs = Date.now() - t0;
  row.tokens = tokensOf(gemini);
  return row;
}

/** Rows from an earlier run that only failed because Gemini could not be used. They are dropped so a resume measures them again. */
export function isUnavailableRow(row) {
  if (!row) return false;
  if (row.unavailable) return true;
  if (row.system === "sparc-gemini" && row.fallback) return true;
  return (row.errors ?? []).some((e) => /exceeded your current quota|RESOURCE_EXHAUSTED|"code":\s*429|quota exhausted/i.test(String(e)));
}

// ---------------------------------------------------------------------------
// (a) templates only
// ---------------------------------------------------------------------------
/**
 * The prototype could serve a request only if a template exists for its website
 * type. For a portal it offers the picked industry's preset modules and nothing
 * else. Nothing is generated by AI; anything missing is manual work.
 */
export function runTemplates(req) {
  const bp = getBlueprint(req.type);
  const served = bp.existingTemplates.length > 0;
  const row = { id: req.id, system: "templates", type: req.type, style: req.style, served, templates: bp.existingTemplates };
  if (!served) {
    row.ok = false;
    row.errors = [`no template exists for "${req.type}"`];
    row.tokens = { calls: 0, input: 0, output: 0, total: 0, retries: 0 };
    row.totalMs = 0;
    row.keywordCoverage = 0;
    row.moduleRecall = req.mustInclude.length ? 0 : 1;
    row.newCodeLines = 0;
    row.reusePct = 100;
    return row;
  }
  const preset = req.type === "admin-portal" ? MODULE_LIBRARY.filter((m) => m.industries[0] === req.industry).map((m) => m.id) : [];
  const names = req.type === "admin-portal" ? MODULE_LIBRARY.filter((m) => preset.includes(m.id)).map((m) => `${m.singularName} ${m.pluralName}`).join(" ") : "";
  row.preset = preset;
  row.moduleRecall = round(moduleRecall(req.mustInclude, preset));
  row.missingModules = req.mustInclude.filter((id) => !preset.includes(id));
  // Portfolio templates are filled with the user's own text, so only the type counts.
  row.keywordCoverage = req.type === "admin-portal" ? round(keywordCoverage(names, req.keywords)) : 0;
  row.ok = req.type === "admin-portal" ? row.moduleRecall === 1 : true;
  row.errors = row.ok ? [] : [`preset is missing: ${row.missingModules.join(", ")}`];
  row.tokens = { calls: 0, input: 0, output: 0, total: 0, retries: 0 };
  row.totalMs = 0;
  row.newCodeLines = 0;
  row.reusePct = 100;
  return row;
}

// ---------------------------------------------------------------------------
// repeatability
// ---------------------------------------------------------------------------
/** Same request, `runs` times, no AI: how many different sites come out? (SPARC offline: expected 1.) */
export async function sparcRepeatability(req, { runs = 3, embedder, records }) {
  const hashes = [];
  for (let i = 0; i < runs; i += 1) {
    const plan = await planSite(req.description, { embedder, styleLevel: req.style });
    const c = composeSite(records, { websiteType: plan.config.websiteType, styleLevel: plan.config.styleLevel, enabledOptional: plan.config.rooms.enabled });
    hashes.push(sha({ config: plan.config, picks: Object.fromEntries(Object.entries(c.picks).map(([r, p]) => [r, p.slug])) }));
  }
  return { id: req.id, runs, distinct: new Set(hashes).size };
}

/** Same request through the Gemini planner `runs` times: how many different plans? */
export async function geminiPlanRepeatability(req, { runs = 3, makeGemini, embedder }) {
  const keys = [];
  for (let i = 0; i < runs; i += 1) {
    const gemini = makeGemini();
    const plan = await planSite(req.description, { embedder, styleLevel: req.style, callGemini: gemini.callJson });
    keys.push(sha({ type: plan.config.websiteType, industry: plan.signals.industry, modules: [...plan.signals.moduleIds].sort() }));
  }
  return { id: req.id, runs, distinct: new Set(keys).size };
}

/** Same request to the code-writing model `runs` times: how many different programs? */
export async function aiRepeatability(req, { runs = 3, makeGemini }) {
  const hashes = [];
  for (let i = 0; i < runs; i += 1) hashes.push(sha(extractCode(await makeGemini().callText(aiPrompt(req)))));
  return { id: req.id, runs, distinct: new Set(hashes).size };
}
