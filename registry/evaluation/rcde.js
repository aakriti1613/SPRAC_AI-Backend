// Replay evaluation for iterative descriptors (RCDE), on module ranking for admin portals.
//
// Labelled portal requests (sparc/eval/requests.json + descriptions.json) are split into
// two halves. Feedback is learned on one half and measured on the OTHER half (and the
// other way round), so the system is never tested on requests it learned from.
//
// Simulated user: keeps the planned modules the request really needs, removes the rest,
// adds the needed ones that were missing (the same edits a person makes in the builder).
//
// Three strategies, same requests, same feedback:
//   static     no evidence (today's system)
//   one-shot   evidence learned once (from the first group), then frozen
//   iterative  evidence updated after every round; each round a NEW group of
//              training requests gives feedback (nothing is counted twice)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEmbedder } from "../retrieve/embeddings.js";
import { buildLibraryIndex } from "../retrieve/library.js";
import { detectIndustry, selectModules } from "../plan/offline.js";
import { foldEvents, requestWords } from "../evidence/model.js";
import { moduleContext, moduleItemId } from "../evidence/feedback.js";
import { mean, round } from "./metrics.js";

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const load = (f) => JSON.parse(fs.readFileSync(path.join(BACKEND, "sparc", "eval", f), "utf8"));

/** Unique labelled portal requests from both evaluation sets. */
export function portalCases() {
  const all = [...load("requests.json").requests, ...load("descriptions.json").cases];
  const seen = new Set();
  return all.filter((c) => c.type === "admin-portal" && c.mustInclude?.length && !seen.has(c.description) && seen.add(c.description)).map((c) => ({ description: c.description, mustInclude: c.mustInclude }));
}

/** What a person does in the builder, as evidence events. */
export function simulatedFeedback(c, planned, at) {
  const industry = detectIndustry(c.description);
  const ctx = moduleContext(industry);
  const need = new Set(c.mustInclude);
  const words = requestWords(c.description);
  const events = [];
  for (const id of planned) events.push(need.has(id) ? { at, itemId: moduleItemId(id), context: ctx, outcome: "kept", words } : { at, itemId: moduleItemId(id), context: ctx, outcome: "removed", words });
  for (const id of need) if (!planned.includes(id)) events.push({ at, itemId: moduleItemId(id), context: ctx, outcome: "added", words });
  return events;
}

/** Ranking and selection quality on a set of cases with a given evidence snapshot (null = static). */
export async function measure(cases, { index, snapshot }) {
  const rows = [];
  for (const c of cases) {
    const industry = detectIndustry(c.description);
    const { moduleIds, ranked } = await selectModules(c.description, { index, industry, evidence: snapshot });
    const ids = ranked.map((r) => r.id);
    const need = new Set(c.mustInclude);
    const top5 = ids.slice(0, 5);
    const first = ids.findIndex((id) => need.has(id));
    const tp = moduleIds.filter((id) => need.has(id)).length;
    rows.push({
      recallAt5: top5.filter((id) => need.has(id)).length / need.size,
      mrr: first >= 0 ? 1 / (first + 1) : 0,
      precision: moduleIds.length ? tp / moduleIds.length : 0,
      recall: tp / need.size,
      chosen: moduleIds,
    });
  }
  const p = mean(rows.map((r) => r.precision));
  const r = mean(rows.map((x) => x.recall));
  return {
    n: rows.length,
    recallAt5: round(mean(rows.map((x) => x.recallAt5))),
    mrr: round(mean(rows.map((x) => x.mrr))),
    precision: round(p),
    recall: round(r),
    f1: round(p + r ? (2 * p * r) / (p + r) : 0),
    distinctModules: new Set(rows.flatMap((x) => x.chosen)).size,
  };
}

async function learnRound(train, { index, snapshot, events, at }) {
  for (const c of train) {
    const { moduleIds } = await selectModules(c.description, { index, industry: detectIndustry(c.description), evidence: snapshot });
    events.push(...simulatedFeedback(c, moduleIds, at));
  }
  return { version: (snapshot?.version ?? 0) + 1, ...foldEvents(events, { now: at }) };
}

/** Runs the replay. Returns { cases, rounds, folds: [...], summary: {strategy: [round0..round3]} }. */
export async function runRcdeReplay({ rounds = 3, embedder = createEmbedder({ apiKey: "" }) } = {}) {
  const cases = portalCases();
  const index = await buildLibraryIndex({ embedder });
  const halves = [cases.filter((_, i) => i % 2 === 0), cases.filter((_, i) => i % 2 === 1)];
  const at = "2026-11-24T00:00:00.000Z"; // fixed clock: the replay is repeatable
  const folds = [];
  for (const [train, test] of [[halves[0], halves[1]], [halves[1], halves[0]]]) {
    const out = { static: [], oneShot: [], iterative: [] };
    const base = await measure(test, { index, snapshot: null });
    out.static = Array(rounds + 1).fill(base);
    // iterative: learn, measure, learn again with the updated evidence...
    let snap = null;
    const events = [];
    out.iterative.push(base);
    let oneShotSnap = null;
    // Each round, a NEW group of requests gives feedback (like new users over time);
    // nothing is counted twice.
    const groups = Array.from({ length: rounds }, (_, g) => train.filter((_, i) => i % rounds === g));
    for (let r = 1; r <= rounds; r += 1) {
      snap = await learnRound(groups[r - 1], { index, snapshot: snap, events, at });
      if (r === 1) oneShotSnap = snap;
      out.iterative.push(await measure(test, { index, snapshot: snap }));
    }
    const oneShot = await measure(test, { index, snapshot: oneShotSnap });
    out.oneShot = [base, ...Array(rounds).fill(oneShot)];
    folds.push(out);
  }
  const avg = (key, r, metric) => round(mean(folds.map((f) => f[key][r][metric])));
  const metrics = ["recallAt5", "mrr", "precision", "recall", "f1", "distinctModules"];
  const summary = {};
  for (const key of ["static", "oneShot", "iterative"]) summary[key] = Array.from({ length: rounds + 1 }, (_, r) => Object.fromEntries(metrics.map((m) => [m, avg(key, r, m)])));
  // Scenario 2 (upper bound): the SAME kinds of requests come back (returning users).
  // Learn from every request each round, measure on the same requests.
  const returning = [await measure(cases, { index, snapshot: null })];
  let snap2 = null;
  const events2 = [];
  for (let r = 1; r <= rounds; r += 1) {
    snap2 = await learnRound(cases, { index, snapshot: snap2, events: events2, at });
    returning.push(await measure(cases, { index, snapshot: snap2 }));
  }
  return { cases: cases.length, rounds, folds, summary, returning, ranAt: new Date().toISOString() };
}

export function renderRcdeReport(result) {
  const L = ["# Iterative descriptors (RCDE): replay results", ""];
  L.push(`Module ranking for admin portals. ${result.cases} labelled portal requests, split in two halves: feedback is learned on one half and measured on the other (both ways, averaged). The simulated user keeps needed modules, removes unneeded ones and adds missing ones. Offline embedder, fixed clock: the replay gives the same numbers every time.`, "");
  L.push("| Strategy | Round | Recall@5 | MRR | Precision | Recall | F1 | Different modules chosen |", "|---|---|---|---|---|---|---|---|");
  const names = { static: "Static (today)", oneShot: "One-shot (learned once)", iterative: "Iterative (RCDE)" };
  for (const [key, rows] of Object.entries(result.summary)) {
    rows.forEach((r, i) => {
      if (key !== "iterative" && i > 1) return; // static and one-shot do not change after round 1
      L.push(`| ${names[key]} | ${i} | ${r.recallAt5} | ${r.mrr} | ${r.precision} | ${r.recall} | ${r.f1} | ${r.distinctModules} |`);
    });
  }
  L.push("", "Round 0 is before any feedback: it must equal the static row (cold start does no harm).", "");
  if (result.returning) {
    L.push("**Returning requests (upper bound).** The same kinds of requests come back, and feedback from every request is learned each round:", "");
    L.push("| Round | Recall@5 | MRR | Precision | Recall | F1 | Different modules chosen |", "|---|---|---|---|---|---|---|");
    result.returning.forEach((r, i) => L.push(`| ${i} | ${r.recallAt5} | ${r.mrr} | ${r.precision} | ${r.recall} | ${r.f1} | ${r.distinctModules} |`));
    L.push("");
  }
  L.push("Precision = share of chosen modules the request really needs. \"Different modules chosen\" checks that evidence does not shrink the choice to a few favourites.", "");
  L.push("Limits: simulated users, not real ones; module ranking only (each room still has one standard component per style level, so component choice cannot change yet); a small labelled set.", "");
  return `${L.join("\n")}\n`;
}
