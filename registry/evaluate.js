// Measures the search and the planner against the hand-labelled sets in
// sparc/eval/. Reports standard numbers for the research write-up:
//   search  - Recall@5, MRR
//   planner - website-type accuracy, industry accuracy, module precision/recall/F1,
//             config-valid %, reuse ratio
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLibraryIndex, embedQuery } from "./retrieve/library.js";
import { search } from "./retrieve/search.js";
import { planSite } from "./plan/index.js";

const EVAL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sparc", "eval");
const load = (name) => JSON.parse(fs.readFileSync(path.join(EVAL_DIR, name), "utf8"));
const round = (x) => Math.round(x * 1000) / 1000;

export async function evaluateSearch({ embedder } = {}) {
  const { queries } = load("search-queries.json");
  const index = await buildLibraryIndex({ embedder });
  let recallHits = 0;
  let mrrSum = 0;
  const misses = [];
  for (const { q, relevant } of queries) {
    const qv = await embedQuery(index, q);
    const ranked = search(index, { query: q, queryVector: qv, filters: { kind: "module" }, limit: 5 }).map((r) => r.payload.id);
    const relSet = new Set(relevant);
    if (ranked.slice(0, 5).some((id) => relSet.has(id))) recallHits += 1;
    else misses.push({ q, got: ranked, want: relevant });
    const firstRank = ranked.findIndex((id) => relSet.has(id));
    if (firstRank >= 0) mrrSum += 1 / (firstRank + 1);
  }
  const n = queries.length;
  return { n, recallAt5: round(recallHits / n), mrr: round(mrrSum / n), misses };
}

export async function evaluatePlanner({ embedder, callGemini } = {}) {
  const { cases } = load("descriptions.json");
  let typeOk = 0;
  let industryOk = 0;
  let configValid = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let reuseSum = 0;
  const problems = [];
  for (const c of cases) {
    const plan = await planSite(c.description, { embedder, callGemini });
    if (plan.config.websiteType === c.type) typeOk += 1;
    if (plan.signals.industry === c.industry) industryOk += 1;
    if (plan.ok) configValid += 1;
    const got = new Set(plan.modulesUsed.map((m) => m.id));
    const want = new Set(c.mustInclude);
    for (const id of want) (got.has(id) ? (tp += 1) : (fn += 1));
    for (const id of got) if (!want.has(id) && want.size > 0) fp += 1; // extra modules only count when some were expected
    reuseSum += plan.reuse.ratio;
    if (plan.config.websiteType !== c.type || [...want].some((id) => !got.has(id))) {
      problems.push({ description: c.description, wantType: c.type, gotType: plan.config.websiteType, wantModules: c.mustInclude, gotModules: [...got] });
    }
  }
  const n = cases.length;
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  return {
    n,
    websiteTypeAccuracy: round(typeOk / n),
    industryAccuracy: round(industryOk / n),
    configValidPct: round(configValid / n),
    modulePrecision: round(precision),
    moduleRecall: round(recall),
    moduleF1: round(precision + recall ? (2 * precision * recall) / (precision + recall) : 0),
    avgReuseRatio: round(reuseSum / n),
    problems,
  };
}
