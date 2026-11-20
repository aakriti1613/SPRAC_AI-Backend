// Analysis for the style-level user study (see docs/eval/USER_STUDY.md).
// Input: a CSV of ratings. Output: mean, spread and a 95% interval per style level,
// and a paired comparison of every pair of levels (same person, same site), with
// Holm's correction because six comparisons are made at once.
//
//   node registry/evaluation/ratings.js ratings.csv
//
// CSV columns: participant,site,style_level,rating[,comment]   rating = whole number 1..5
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mean, round, sd } from "./metrics.js";

export const LEVELS = ["basic", "good", "amazing", "astonishing"];

/** Parse one CSV line (supports "quoted, fields" and "" for a quote). */
export function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Returns { ratings: [{participant, site, level, rating, comment}], problems: [string] }. */
export function parseRatings(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  const problems = [];
  if (!lines.length) return { ratings: [], problems: ["the file is empty"] };
  const head = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name) => head.indexOf(name);
  for (const need of ["participant", "site", "style_level", "rating"]) if (col(need) < 0) problems.push(`missing column "${need}"`);
  if (problems.length) return { ratings: [], problems };

  const ratings = [];
  const seen = new Set();
  lines.slice(1).forEach((line, i) => {
    const row = parseCsvLine(line);
    const where = `line ${i + 2}`;
    const participant = row[col("participant")];
    const site = row[col("site")];
    const level = row[col("style_level")]?.toLowerCase();
    const rating = Number(row[col("rating")]);
    if (!participant || !site) return void problems.push(`${where}: participant and site are required`);
    if (!LEVELS.includes(level)) return void problems.push(`${where}: style_level must be one of ${LEVELS.join(", ")}`);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return void problems.push(`${where}: rating must be a whole number from 1 to 5`);
    const key = `${participant}|${site}|${level}`;
    if (seen.has(key)) return void problems.push(`${where}: ${participant} rated ${site} at ${level} twice`);
    seen.add(key);
    ratings.push({ participant, site, level, rating, comment: col("comment") >= 0 ? row[col("comment")] : "" });
  });
  return { ratings, problems };
}

// ---------------------------------------------------------------------------
// Student's t distribution (two-sided p-value) without any library
// ---------------------------------------------------------------------------
function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const ci of c) ser += ci / (y += 1);
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betaContinuedFraction(a, b, x) {
  const TINY = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b). */
function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(a, b, x)) / a : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided p-value for a t statistic with `df` degrees of freedom. */
export function tTwoSidedP(t, df) {
  if (!Number.isFinite(t)) return 0;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Critical t for a 95% interval (two-sided), by bisection on the p-value. */
export function tCritical95(df) {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (tTwoSidedP(mid, df) > 0.05) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Holm's step-down correction: returns adjusted p-values in the original order. */
export function holm(ps) {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(ps.length);
  let running = 0;
  order.forEach(([p, i], rank) => {
    running = Math.max(running, Math.min(1, p * (ps.length - rank)));
    out[i] = running;
  });
  return out;
}

// ---------------------------------------------------------------------------
// The study analysis
// ---------------------------------------------------------------------------
export function analyze(ratings) {
  const perLevel = LEVELS.map((level) => {
    const xs = ratings.filter((r) => r.level === level).map((r) => r.rating);
    const n = xs.length;
    const m = mean(xs);
    const s = sd(xs);
    const half = n > 1 ? tCritical95(n - 1) * (s / Math.sqrt(n)) : 0;
    return { level, n, mean: round(m, 2), sd: round(s, 2), ci95: [round(m - half, 2), round(m + half, 2)] };
  });

  // Paired by (participant, site): everyone who rated both levels of the same site.
  const key = (r) => `${r.participant}|${r.site}`;
  const pairs = [];
  for (let i = 0; i < LEVELS.length; i += 1) {
    for (let j = i + 1; j < LEVELS.length; j += 1) {
      const A = new Map(ratings.filter((r) => r.level === LEVELS[i]).map((r) => [key(r), r.rating]));
      const diffs = ratings.filter((r) => r.level === LEVELS[j] && A.has(key(r))).map((r) => r.rating - A.get(key(r)));
      const n = diffs.length;
      const m = mean(diffs);
      const s = sd(diffs);
      const t = n > 1 && s > 0 ? m / (s / Math.sqrt(n)) : m === 0 ? 0 : Infinity * Math.sign(m);
      pairs.push({ from: LEVELS[i], to: LEVELS[j], n, meanDiff: round(m, 2), effectSize: s > 0 ? round(m / s, 2) : null, t: Number.isFinite(t) ? round(t, 2) : null, p: n > 1 ? tTwoSidedP(t, n - 1) : 1 });
    }
  }
  const adjusted = holm(pairs.map((p) => p.p));
  pairs.forEach((p, i) => {
    p.p = round(p.p, 4);
    p.pHolm = round(adjusted[i], 4);
  });

  return { participants: new Set(ratings.map((r) => r.participant)).size, ratings: ratings.length, perLevel, pairs };
}

export function renderRatingsReport(result) {
  const L = ["# Style-level user study: results", ""];
  L.push(`${result.participants} people gave ${result.ratings} ratings (1 = poor, 5 = excellent).`, "");
  L.push("| Style level | Ratings | Average | Spread (SD) | 95% interval |", "|---|---|---|---|---|");
  for (const r of result.perLevel) L.push(`| ${r.level} | ${r.n} | ${r.mean} | ${r.sd} | ${r.ci95[0]} to ${r.ci95[1]} |`);
  L.push("", "Is one level really rated higher than another? (same person, same site; p is adjusted for 6 comparisons)", "");
  L.push("| Comparison | Pairs | Average difference | Effect size | p | p (adjusted) |", "|---|---|---|---|---|---|");
  for (const p of result.pairs) L.push(`| ${p.to} minus ${p.from} | ${p.n} | ${p.meanDiff} | ${p.effectSize ?? "n/a"} | ${p.p} | ${p.pHolm} |`);
  L.push("", "A level is rated reliably higher when the adjusted p is below 0.05. With few people, a real difference can still look \"not significant\": say how many people took part.", "");
  return `${L.join("\n")}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.log("usage: node registry/evaluation/ratings.js ratings.csv");
    process.exit(1);
  }
  const { ratings, problems } = parseRatings(fs.readFileSync(file, "utf8"));
  if (problems.length) {
    console.log(`Problems in ${file}:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  process.stdout.write(renderRatingsReport(analyze(ratings)));
}
