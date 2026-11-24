// Iterative descriptors (RCDE: Requirement-Conditioned Descriptor Evolution).
//
// Every library item (a module or a component) keeps its FACTS (the CDL label,
// written once at ingestion) and gains EVIDENCE: what happened when it was used,
// per context (website type + industry + room + style level). Evidence is folded
// from feedback events and can only nudge the ranking score. It never changes a
// fact and never makes anything verified.
//
// Fair-chance rules (SPARC_AI_PLAN.md section 5.1):
//   - the nudge is capped (WEIGHT) and is zero for an item without enough evidence;
//   - new items start neutral, not low;
//   - an exploration bonus (UCB) helps less-tried items, but only for suggestions;
//   - evidence is per context, and old events fade (half-life).
// Pure functions: no files, no network.
import { tokenize } from "../retrieve/text.js";

export const SETTINGS = Object.freeze({
  weight: 0.2, // most evidence can move a score: +/- 0.2 x (value - neutral)
  minEvents: 3, // weighted events in a context before evidence counts at all
  halfLifeDays: 90, // an event loses half its weight every 90 days
  explore: 0.3, // size of the "not tried yet" bonus (suggestions only)
  wordShare: 0.5, // part of the evidence value that depends on THIS request's words
  maxWords: 40, // learned words kept per item and context
});

/** How much one event of each kind counts. A person's choice says more than "it compiled". */
export const OUTCOME = Object.freeze({
  pass: { sign: 1, weight: 0.5 }, // built and passed every check
  fail: { sign: -1, weight: 1 }, // a check or the build failed with this item
  kept: { sign: 1, weight: 1 }, // planned, and the user kept it
  added: { sign: 1, weight: 1.5 }, // not planned, the user added it
  removed: { sign: -1, weight: 1.5 }, // planned, the user removed it
  chosen: { sign: 1, weight: 1.5 }, // the user picked it from the suggestions
});

const DAY = 24 * 3600 * 1000;

/** "admin-portal|healthcare|module|any". The same item has separate evidence per context. */
export function contextKey({ websiteType, industry, room, styleLevel } = {}) {
  return [websiteType || "any", industry || "generic", room || "any", styleLevel || "any"].join("|");
}

/** Problems with one event (empty list = valid). */
export function validateEvent(e) {
  const p = [];
  if (!e || typeof e !== "object") return ["event must be an object"];
  if (typeof e.itemId !== "string" || !/^(module|component):/.test(e.itemId)) p.push("itemId must start with module: or component:");
  if (!OUTCOME[e.outcome]) p.push(`outcome must be one of ${Object.keys(OUTCOME).join(", ")}`);
  if (!e.context || typeof e.context !== "object") p.push("context is required");
  if (Number.isNaN(Date.parse(e.at))) p.push("at must be an ISO date");
  if (e.words !== undefined && !Array.isArray(e.words)) p.push("words must be a list");
  return p;
}

/** Plain words worth learning from a request (stop words removed, synonyms merged). */
export function requestWords(text) {
  return [...new Set(tokenize(text))].filter((w) => w.length > 2 && !/^\d+$/.test(w));
}

/**
 * Fold events into evidence. Returns { items: {itemId: {ctx: stats}}, totals: {ctx: weighted events} }.
 * stats = { n, good, bad, words: {word: weight}, negWords: {word: weight}, reasons: {reason: count}, last }
 * words    = request words of events where the item was kept / added / passed
 * negWords = request words of events where it was removed or failed (requirement-conditioned:
 *            a removal only counts against requests that share its words)
 */
export function foldEvents(events, { now = new Date(), settings = SETTINGS } = {}) {
  const items = {};
  const totals = {};
  const nowMs = new Date(now).getTime();
  for (const e of events) {
    if (validateEvent(e).length) continue; // bad lines are skipped, never trusted
    const ageDays = Math.max(0, (nowMs - Date.parse(e.at)) / DAY);
    const w = OUTCOME[e.outcome].weight * 0.5 ** (ageDays / settings.halfLifeDays);
    const ctx = contextKey(e.context);
    const byCtx = (items[e.itemId] ??= {});
    const s = (byCtx[ctx] ??= { n: 0, good: 0, bad: 0, words: {}, negWords: {}, reasons: {}, last: e.at });
    s.n += w;
    if (OUTCOME[e.outcome].sign > 0) {
      s.good += w;
      for (const word of e.words ?? []) s.words[word] = (s.words[word] ?? 0) + w;
    } else {
      s.bad += w;
      for (const word of e.words ?? []) s.negWords[word] = (s.negWords[word] ?? 0) + w;
      if (e.reason) s.reasons[e.reason] = (s.reasons[e.reason] ?? 0) + 1;
    }
    if (e.at > s.last) s.last = e.at;
    totals[ctx] = (totals[ctx] ?? 0) + w;
  }
  // Keep only the strongest learned words, and round numbers so snapshots stay small and stable.
  const r = (x) => Math.round(x * 1000) / 1000;
  for (const byCtx of Object.values(items)) {
    for (const s of Object.values(byCtx)) {
      const top = (o) =>
        Object.fromEntries(
          Object.entries(o)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, settings.maxWords)
            .map(([k, v]) => [k, r(v)])
        );
      s.words = top(s.words);
      s.negWords = top(s.negWords ?? {});
      s.n = r(s.n);
      s.good = r(s.good);
      s.bad = r(s.bad);
    }
  }
  for (const k of Object.keys(totals)) totals[k] = r(totals[k]);
  return { items, totals };
}

export const EMPTY_SNAPSHOT = Object.freeze({ version: 0, items: {}, totals: {} });

/** Evidence of one item in one context (or null) and how much evidence the context has overall. */
export function lookup(snapshot, itemId, context) {
  const ctx = contextKey(context);
  return { stats: snapshot?.items?.[itemId]?.[ctx] ?? null, total: snapshot?.totals?.[ctx] ?? 0 };
}

/** The value of an item with no usable evidence. Every such item gets exactly this, so it cannot change the order. */
export const NEUTRAL = 0.5;

/**
 * Evidence value of one item for one request, 0..1.
 *   fit        = Beta(1,1) posterior mean of good vs bad (0.5 with no evidence)
 *   wordMatch  = -1..1: (request words it was kept for) minus (request words it was removed for),
 *                as a share of the request's words. This is what makes it requirement-conditioned.
 *   bonus      = UCB "not tried yet" bonus, only when explore is true
 */
export function evidenceValue({ stats, total }, { queryWords = [], explore = false, settings = SETTINGS } = {}) {
  const n = stats?.n ?? 0;
  const confident = n >= settings.minEvents;
  const fit = confident ? (1 + stats.good) / (2 + stats.good + stats.bad) : 0.5;
  let wordMatch = 0;
  if (confident && queryWords.length) {
    const pos = stats.words ?? {};
    const neg = stats.negWords ?? {};
    const hit = (o, w) => ((o[w] ?? 0) >= 1 ? 1 : 0);
    wordMatch = queryWords.reduce((sum, w) => sum + hit(pos, w) - hit(neg, w), 0) / queryWords.length;
  }
  const bonus = explore ? settings.explore * Math.sqrt(Math.log(1 + total) / (1 + n)) : 0;
  const value = Math.max(0, Math.min(1, (1 - settings.wordShare) * fit + settings.wordShare * (0.5 + 0.5 * wordMatch) + bonus));
  return { value, fit, wordMatch, bonus, n, confident };
}

/**
 * How much evidence moves a ranking score. Zero for every item without enough evidence,
 * so with no evidence at all the ranking is exactly the static one.
 */
export function evidenceDelta(ev, settings = SETTINGS) {
  return settings.weight * (ev.value - NEUTRAL);
}

/** Top learned words and failure reasons of an item, for explanations and reports. */
export function describeEvidence(stats, limit = 5) {
  if (!stats) return { events: 0, words: [], problems: [] };
  return {
    events: stats.n,
    successRate: stats.n ? Math.round((stats.good / stats.n) * 100) / 100 : null,
    words: Object.keys(stats.words ?? {}).slice(0, limit),
    problems: Object.entries(stats.reasons ?? {}).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([r]) => r),
  };
}
