// Hybrid search over a set of "search documents".
//
// Each document: { id, text, facets:{...}, quality:{...}, embedding?:number[], payload }
// Scoring = keyword + semantic + quality + usage, after hard filters. Every
// result carries the matched words and score parts, so choices are explainable.
import { buildIdf, keywordScore, termFreq, tokenize } from "./text.js";
import { cosine } from "./embeddings.js";

export const DEFAULT_WEIGHTS = { semantic: 0.45, keyword: 0.3, quality: 0.15, usage: 0.1 };

/** quality.* -> a 0..1 number (downloads/stars are popularity; our own parts score high). */
function qualityScore(q = {}) {
  if (q.score !== undefined) return Math.max(0, Math.min(1, q.score));
  let s = 0.5;
  if (q.hasTypes) s += 0.1;
  if (q.hasTests) s += 0.1;
  if (q.downloads) s = Math.max(s, Math.min(1, 0.4 + Math.log10(q.downloads + 1) / 10));
  if (q.stars) s = Math.max(s, Math.min(1, 0.4 + Math.log10(q.stars + 1) / 8));
  if (q.a11yViolations) s -= 0.2 * q.a11yViolations;
  return Math.max(0, Math.min(1, s));
}

/** Build a reusable index from documents (computes idf; keeps token freqs). */
export function buildIndex(documents) {
  const docs = documents.map((d) => ({ ...d, tokens: tokenize(`${d.text} ${Object.values(d.facets || {}).flat().join(" ")}`) }));
  const idf = buildIdf(docs.map((d) => d.tokens));
  for (const d of docs) d.tf = termFreq(d.tokens);
  return { docs, idf };
}

/**
 * Search the index.
 *   query       plain text
 *   queryVector optional embedding of the query (same embedder as the docs)
 *   filters     facet -> value | value[] ; a doc must match every given facet
 *   weights, limit
 * Returns ranked [{ id, score, parts, matched, payload }].
 */
export function search(index, { query = "", queryVector = null, filters = {}, weights = DEFAULT_WEIGHTS, limit = 10 } = {}) {
  const qTokens = tokenize(query);
  const qSet = new Set(qTokens);
  const results = [];

  for (const doc of index.docs) {
    if (!passesFilters(doc.facets || {}, filters)) continue;
    const keyword = keywordScore(qTokens, doc.tf, index.idf);
    const semantic = queryVector && doc.embedding ? Math.max(0, cosine(queryVector, doc.embedding)) : keyword; // fall back to keyword when no vectors
    const quality = qualityScore(doc.quality);
    const usage = Math.max(0, Math.min(1, (doc.quality?.picks ?? 0) / 20));
    const parts = {
      semantic: +(semantic * weights.semantic).toFixed(4),
      keyword: +(keyword * weights.keyword).toFixed(4),
      quality: +(quality * weights.quality).toFixed(4),
      usage: +(usage * weights.usage).toFixed(4),
    };
    const score = +(parts.semantic + parts.keyword + parts.quality + parts.usage).toFixed(4);
    if (score <= 0) continue;
    const matched = [...qSet].filter((t) => doc.tf.has(t));
    results.push({ id: doc.id, score, parts, matched, payload: doc.payload });
  }
  results.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  return results.slice(0, limit);
}

function passesFilters(facets, filters) {
  for (const [key, want] of Object.entries(filters)) {
    if (want === undefined || want === null) continue;
    const have = facets[key];
    const haveList = Array.isArray(have) ? have.map(String) : have === undefined ? [] : [String(have)];
    const wantList = (Array.isArray(want) ? want : [want]).map(String);
    if (!wantList.some((w) => haveList.includes(w))) return false;
  }
  return true;
}
