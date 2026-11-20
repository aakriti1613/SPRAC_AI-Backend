// Small, pure helpers for the Phase 8 evaluation: statistics, the checks every
// system's output goes through, and hashing. No network, no files, so they are easy to test.
import crypto from "node:crypto";

export const round = (x, digits = 3) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

export const sha = (value) =>
  crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Percentile with linear interpolation, p in 0..100. */
export function percentile(xs, p) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = ((s.length - 1) * p) / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (xs) => percentile(xs, 50);

/** { n, mean, median, p90, min, max } of a list of numbers (undefined and NaN are ignored). */
export function summarize(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!xs.length) return { n: 0, mean: 0, median: 0, p90: 0, min: 0, max: 0 };
  return { n: xs.length, mean: round(mean(xs), 2), median: round(median(xs), 2), p90: round(percentile(xs, 90), 2), min: round(Math.min(...xs), 2), max: round(Math.max(...xs), 2) };
}

/** Share of `part` in `whole`, as 0..1 (0 when whole is 0). */
export const share = (part, whole) => (whole > 0 ? part / whole : 0);

/** Fraction of the keywords found (case-insensitive) in the text. Empty keyword list counts as 1. */
export function keywordCoverage(text, keywords) {
  if (!keywords?.length) return 1;
  const t = String(text).toLowerCase();
  return keywords.filter((k) => t.includes(k.toLowerCase())).length / keywords.length;
}

// ---------------------------------------------------------------------------
// The same static checks for every system's code (so the comparison is fair)
// ---------------------------------------------------------------------------
const CODE_FILE = /\.(jsx?|tsx?)$/;

function lineOf(content, index) {
  return content.slice(0, index).split("\n").length;
}

/** Every `<tag ...>` in the text (the tag may span lines). */
function tags(content, name) {
  const out = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m;
  while ((m = re.exec(content))) {
    // Walk to the closing ">" that is not inside braces or quotes.
    let depth = 0;
    let quote = "";
    let i = m.index + m[0].length;
    for (; i < content.length; i += 1) {
      const c = content[i];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ text: content.slice(m.index, i + 1), index: m.index });
  }
  return out;
}

/** Blank out comments (same length, so line numbers stay right). A "//" inside a URL string is left alone. */
export function stripComments(content) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  return content.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[\s;{}(,])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const RULES = [
  { id: "img-without-alt", kind: "accessibility", find: (c) => tags(c, "img").filter((t) => !/\balt\s*=/.test(t.text)).map((t) => t.index) },
  {
    id: "input-without-label",
    kind: "accessibility",
    find: (c) => {
      const wrapped = [...c.matchAll(/<label\b[\s\S]*?<\/label>/g)].map((m) => [m.index, m.index + m[0].length]);
      return tags(c, "input")
        .filter((t) => !wrapped.some(([from, to]) => t.index > from && t.index < to))
        // hidden/submit/button need no label; radios and checkboxes are normally wrapped in their <label>;
        // a spread ({...x}) may carry the id or aria-label, which a text scan cannot see.
        .filter((t) => !/type\s*=\s*["'](hidden|submit|button|radio|checkbox)["']/.test(t.text))
        .filter((t) => !/\b(aria-label|aria-labelledby|id)\s*=/.test(t.text) && !/\{\s*\.\.\./.test(t.text))
        .map((t) => t.index);
    },
  },
  { id: "dangerous-html", kind: "security", find: (c) => [...c.matchAll(/dangerouslySetInnerHTML/g)].map((m) => m.index) },
  { id: "eval", kind: "security", find: (c) => [...c.matchAll(/\beval\s*\(|new\s+Function\s*\(/g)].map((m) => m.index) },
  { id: "hardcoded-secret", kind: "security", find: (c) =>
      [...c.matchAll(/AIza[0-9A-Za-z_-]{20,}|\bsk-[A-Za-z0-9]{20,}|(?:secret|password|api[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/gi)]
        // `password: "password"` / `"new-password"` are HTML attribute values, not credentials
        .filter((m) => !/["'](?:new-|current-)?password["']$/i.test(m[0]))
        .map((m) => m.index),
  },
  { id: "insecure-http-call", kind: "security", find: (c) => [...c.matchAll(/fetch\(\s*["'`]http:\/\//g)].map((m) => m.index) },
  { id: "console-log", kind: "lint", find: (c) => [...c.matchAll(/\bconsole\.log\s*\(/g)].map((m) => m.index) },
];

export const SCAN_RULES = RULES.map(({ id, kind }) => ({ id, kind }));

/**
 * files: [{ path, content }]. Returns { total, byRule: {id: count}, byKind: {kind: count}, findings: [{rule, path, line}] }.
 * Only code files are scanned.
 */
export function scanSource(files) {
  const findings = [];
  for (const f of files) {
    if (!CODE_FILE.test(f.path)) continue;
    const code = stripComments(f.content);
    for (const rule of RULES) {
      for (const index of rule.find(code)) findings.push({ rule: rule.id, kind: rule.kind, path: f.path, line: lineOf(f.content, index) });
    }
  }
  const byRule = {};
  const byKind = {};
  for (const x of findings) {
    byRule[x.rule] = (byRule[x.rule] ?? 0) + 1;
    byKind[x.kind] = (byKind[x.kind] ?? 0) + 1;
  }
  return { total: findings.length, byRule, byKind, findings };
}

/** Lines of code in code files only. */
export function countCodeLines(files) {
  return files.filter((f) => CODE_FILE.test(f.path)).reduce((n, f) => n + f.content.split("\n").filter((l) => l.trim()).length, 0);
}

/** Pull the longest fenced code block out of a model reply (or the whole reply if it is plain code). */
export function extractCode(reply) {
  const blocks = [...String(reply).matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (blocks.length) return blocks.sort((a, b) => b.length - a.length)[0].trim();
  return /export\s+default/.test(reply) ? String(reply).trim() : "";
}

/** How many of the planned modules are in what was built (recall) for an admin portal. */
export function moduleRecall(wanted, got) {
  if (!wanted?.length) return 1;
  const g = new Set(got);
  return wanted.filter((id) => g.has(id)).length / wanted.length;
}

/** Group results by a key and summarise one numeric field. */
export function groupSummary(rows, key, field) {
  const out = {};
  for (const k of [...new Set(rows.map((r) => r[key]))]) out[k] = summarize(rows.filter((r) => r[key] === k).map((r) => r[field]));
  return out;
}

/** Percent (0..100, 1 decimal) of rows for which `pred` is true. */
export const pct = (rows, pred) => (rows.length ? round((rows.filter(pred).length / rows.length) * 100, 1) : 0);
