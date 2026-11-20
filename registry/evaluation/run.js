// Runs the Phase 8 evaluation and keeps the results in docs/eval/results.json.
// It saves after every request, so a stopped run can be continued (--resume).
//
// Anything that needs Gemini is checked first with one tiny call. If Gemini cannot be used
// (quota used up, bad key, outage) those parts are SKIPPED and reported as "not measured",
// never counted as failures of the system under test. Run again with --resume later.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleConfig } from "../plan/assemble.js";
import { createEmbedder } from "../retrieve/embeddings.js";
import { createFileStore } from "../store/file.js";
import { assembleProject } from "../assemble/project.js";
import { verifyProject } from "../assemble/verify.js";
import { evaluatePlanner, evaluateSearch } from "../evaluate.js";
import { createMeteredGemini, isGeminiUnavailable } from "./gemini.js";
import { EVAL_DIR, aiRepeatability, distSizes, geminiPlanRepeatability, isUnavailableRow, removeDir, runAi, runSparc, runTemplates, sparcRepeatability } from "./systems.js";

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_OUT = path.join(BACKEND, "docs", "eval", "results.json");
export const REQUESTS = JSON.parse(fs.readFileSync(path.join(BACKEND, "sparc", "eval", "requests.json"), "utf8")).requests;

/** Same site at every style level it allows: how big does the build get? */
export const LEVEL_PLAN = [
  { websiteType: "portfolio", industry: "generic", levels: ["basic", "good", "amazing", "astonishing"], brandName: "Aditi Verma" },
  { websiteType: "landing", industry: "healthcare", levels: ["basic", "good", "amazing", "astonishing"], brandName: "Sunrise Clinic" },
  { websiteType: "admin-portal", industry: "healthcare", levels: ["basic", "good", "amazing"], brandName: "Sunrise Clinic", moduleIds: ["patients", "appointments"] },
  { websiteType: "ecommerce", industry: "generic", levels: ["basic", "good", "amazing"], brandName: "Chai and Co" },
  { websiteType: "booking", industry: "healthcare", levels: ["basic", "good", "amazing"], brandName: "Sunrise Clinic" },
];

/**
 * The sites shown to people in the user study: the same content at every style level.
 * Built into sparc-ui/.generated/study/<type>-<level>/ (each has a dist/ ready to host or preview).
 */
export function buildStudySites({ records, outDir = path.join(EVAL_DIR, "..", "study") }) {
  const rows = [];
  for (const spec of LEVEL_PLAN.filter((s) => s.websiteType !== "admin-portal")) {
    for (const styleLevel of spec.levels) {
      const { config, ok, errors } = assembleConfig({ ...spec, styleLevel, moduleIds: [] });
      if (!ok) {
        rows.push({ site: spec.websiteType, styleLevel, ok: false, errors });
        continue;
      }
      const assembled = assembleProject(config, { name: `${spec.websiteType}-${styleLevel}`, records, outDir });
      const verify = verifyProject(assembled.dir, config, assembled.composition, { build: true });
      rows.push({ site: spec.websiteType, styleLevel, ok: verify.ok, dir: assembled.dir, ...distSizes(assembled.dir) });
    }
  }
  return rows;
}

export function loadResults(file = DEFAULT_OUT) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function save(file, results) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
}

async function pool(items, size, worker) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      while (queue.length) await worker(queue.shift());
    })
  );
}

export async function levelBenchmark({ records }) {
  const rows = [];
  for (const spec of LEVEL_PLAN) {
    for (const styleLevel of spec.levels) {
      const { config, ok, errors } = assembleConfig({ ...spec, styleLevel, moduleIds: spec.moduleIds ?? [] });
      if (!ok) {
        rows.push({ websiteType: spec.websiteType, styleLevel, ok: false, errors });
        continue;
      }
      const name = `level-${spec.websiteType}-${styleLevel}`;
      const assembled = assembleProject(config, { name, records, outDir: path.join(EVAL_DIR, "levels") });
      const verify = verifyProject(assembled.dir, config, assembled.composition, { build: true });
      rows.push({ websiteType: spec.websiteType, styleLevel, ok: verify.ok, buildMs: verify.build.ms, ...distSizes(assembled.dir), components: Object.keys(assembled.composition.picks).length });
      removeDir(assembled.dir);
    }
  }
  return rows;
}

/** One tiny call: can Gemini be used right now? Returns { available, reason? }. */
export async function probeGemini(makeGemini = () => createMeteredGemini({ retries: 1 })) {
  if (!process.env.GEMINI_API_KEY) return { available: false, reason: "no GEMINI_API_KEY" };
  try {
    await makeGemini().callText("Reply with the single word OK.");
    return { available: true };
  } catch (e) {
    if (isGeminiUnavailable(e)) return { available: false, reason: String(e.message ?? e).slice(0, 200) };
    return { available: false, reason: `unexpected error: ${String(e.message ?? e).slice(0, 160)}` };
  }
}

/**
 * options: { limit?, engines?, skipAi?, skipRepeat?, skipLevels?, resume?, out?, log?, liveEmbeddings?, probe? }
 * Search and planning use the offline embedder (deterministic, free) unless liveEmbeddings is set.
 */
export async function runEvaluation(options = {}) {
  const out = options.out || DEFAULT_OUT;
  const log = options.log || ((m) => console.log(m));
  const requests = REQUESTS.slice(0, options.limit || REQUESTS.length);

  const previous = options.resume ? loadResults(out) : null;
  const results = previous || { meta: {}, templates: {}, sparc: {}, ai: {}, repeat: {}, levels: null, search: null, planner: null };
  const flush = () => save(out, results);

  // Earlier rows that only failed because Gemini was unusable are forgotten, so they get measured now.
  for (const engine of Object.keys(results.sparc ?? {})) for (const [id, row] of Object.entries(results.sparc[engine])) if (isUnavailableRow(row)) delete results.sparc[engine][id];
  for (const [id, row] of Object.entries(results.ai ?? {})) if (isUnavailableRow(row)) delete results.ai[id];

  const wantGemini = (options.engines || ["offline", "gemini"]).includes("gemini") || !options.skipAi;
  const probe = wantGemini ? await (options.probe || probeGemini)() : { available: false, reason: "not requested" };
  const geminiUp = probe.available;
  const engines = (options.engines || ["offline", "gemini"]).filter((e) => e === "offline" || geminiUp);
  if (!geminiUp && wantGemini) log(`Gemini is not usable (${probe.reason}). Gemini parts are skipped and reported as not measured.`);

  results.meta = {
    ...results.meta,
    startedAt: results.meta.startedAt || new Date().toISOString(),
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    requests: requests.length,
    engines,
    embedder: options.liveEmbeddings ? "gemini-embedding" : "offline hashing embedder",
    gemini: geminiUp ? { available: true } : { available: false, reason: probe.reason },
  };
  flush();

  const records = await createFileStore(path.join(BACKEND, "registry", "data")).list();
  const embedder = options.liveEmbeddings ? createEmbedder() : createEmbedder({ apiKey: "" });
  let geminiDown = !geminiUp;
  const stopIfDown = (row) => {
    if (row.unavailable) {
      geminiDown = true;
      results.meta.gemini = { available: false, reason: row.reason };
    }
    return row.unavailable;
  };

  // (a) templates only: instant
  for (const req of requests) results.templates[req.id] = runTemplates(req);
  flush();

  // (b) SPARC
  for (const engine of engines) {
    results.sparc[engine] ??= {};
    for (const req of requests) {
      if (results.sparc[engine][req.id]) continue;
      if (engine === "gemini" && geminiDown) break;
      const gemini = engine === "gemini" ? createMeteredGemini() : null;
      const row = await runSparc(req, { engine, gemini, embedder, records });
      if (engine === "gemini" && stopIfDown(row)) {
        log(`sparc-gemini stopped at ${req.id}: ${row.reason}`);
        break;
      }
      results.sparc[engine][req.id] = row;
      flush();
      log(`sparc-${engine} ${req.id} ${row.ok ? "ok" : "FAILED"} ${row.totalMs}ms ${row.tokens.total} tokens`);
    }
  }

  // (c) AI writes all the code
  if (!options.skipAi && !geminiDown) {
    await pool(
      requests.filter((r) => !results.ai[r.id]),
      3,
      async (req) => {
        if (geminiDown) return;
        const row = await runAi(req, { gemini: createMeteredGemini() });
        if (stopIfDown(row)) return void log(`ai stopped at ${req.id}: ${row.reason}`);
        results.ai[req.id] = row;
        flush();
        log(`ai ${req.id} ${row.buildOk ? "builds" : "does NOT build"} ${row.totalMs}ms ${row.tokens.total} tokens`);
      }
    );
  }

  // repeatability: same request three times
  if (!options.skipRepeat) {
    if (!results.repeat.sparcOffline?.length) {
      results.repeat.sparcOffline = [];
      for (const req of requests) results.repeat.sparcOffline.push(await sparcRepeatability(req, { runs: 3, embedder, records }));
      log("repeatability: sparc offline done");
      flush();
    }
    const tryGemini = async (name, work) => {
      if (geminiDown || results.repeat[name]) return;
      try {
        results.repeat[name] = await work();
        log(`repeatability: ${name} done`);
      } catch (e) {
        if (!isGeminiUnavailable(e)) throw e;
        geminiDown = true;
        results.meta.gemini = { available: false, reason: String(e.message ?? e).slice(0, 200) };
      }
      flush();
    };
    await tryGemini("geminiPlan", async () => {
      const list = [];
      for (const req of requests.slice(0, 6)) list.push(await geminiPlanRepeatability(req, { runs: 3, makeGemini: () => createMeteredGemini(), embedder }));
      return list;
    });
    await tryGemini("ai", async () => {
      const list = [];
      for (const req of [requests[0], requests[Math.floor(requests.length / 2)], requests[requests.length - 1]]) list.push(await aiRepeatability(req, { runs: 3, makeGemini: () => createMeteredGemini() }));
      return list;
    });
  }

  // speed and size per style level
  if (!options.skipLevels && !results.levels) {
    results.levels = await levelBenchmark({ records });
    log("style-level sizes done");
    flush();
  }

  // search and planner quality (the Phase 4 sets)
  if (!results.search) {
    results.search = await evaluateSearch({ embedder });
    results.planner = await evaluatePlanner({ embedder });
    flush();
  }

  results.meta.finishedAt = new Date().toISOString();
  flush();
  return results;
}
