// Shared text helpers for offline search: tokenising, a small synonym map (so
// "customer" finds "client"), and a bag-of-words score with light stemming.
// No dependencies, so search works without any API key.

const STOP = new Set(["a", "an", "the", "for", "of", "to", "and", "or", "with", "my", "our", "i", "we", "want", "need", "build", "site", "website", "app", "application", "manage", "management", "system", "that", "this", "it", "me", "please"]);

// Words that mean the same for our purposes. Each line maps many -> one canonical.
const SYNONYMS = {
  customer: ["client", "buyer", "account"],
  patient: ["patient"],
  lead: ["prospect", "enquiry", "inquiry"],
  product: ["item", "goods", "sku", "catalogue", "catalog"],
  order: ["sale", "purchase", "checkout"],
  invoice: ["bill", "billing", "receivable"],
  employee: ["staff", "worker", "team", "people"],
  student: ["pupil", "learner"],
  teacher: ["faculty", "instructor"],
  appointment: ["booking", "reservation", "slot", "schedule"],
  fee: ["fees", "tuition", "dues"],
  expense: ["spend", "cost", "reimbursement"],
  ticket: ["complaint", "issue", "helpdesk", "query", "support"],
  stock: ["inventory", "warehouse"],
  task: ["todo", "activity", "reminder"],
  attendance: ["present", "absent"],
  leave: ["holiday", "vacation", "timeoff"],
  doctor: ["physician", "consultant"],
  clinic: ["hospital", "healthcare", "medical"],
  shop: ["store", "ecommerce", "retail"],
  school: ["college", "institute", "academy", "coaching"],
  payroll: ["salary", "payslip", "wage"],
  feedback: ["review", "rating", "survey"],
  project: ["engagement"],
  vendor: ["supplier"],
  portfolio: ["resume", "cv"],
};

const CANON = (() => {
  const map = new Map();
  for (const [canon, words] of Object.entries(SYNONYMS)) {
    map.set(canon, canon);
    for (const w of words) map.set(w, canon);
  }
  return map;
})();

/** Lowercase, split, drop stop words, singularise lightly, map synonyms. */
export function tokenize(text) {
  const out = [];
  for (let raw of String(text || "").toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (STOP.has(raw) || raw.length < 2) continue;
    // Light plural -> singular. "companies"->"company", "fees"->"fee",
    // "sales"->"sale". Keep "ss" words (class, address) and short words as-is.
    if (raw.length > 4 && raw.endsWith("ies")) raw = `${raw.slice(0, -3)}y`;
    else if (raw.length > 3 && raw.endsWith("s") && !raw.endsWith("ss") && !raw.endsWith("us")) raw = raw.slice(0, -1);
    out.push(CANON.get(raw) || raw);
  }
  return out;
}

/** Term frequencies for a token list. */
export function termFreq(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

/**
 * Keyword score of a query against a document, 0..1.
 * Rarer matching words count more (idf), so "patient" matters more than "name".
 */
export function keywordScore(queryTokens, docTf, idf) {
  if (!queryTokens.length) return 0;
  let score = 0;
  let max = 0;
  for (const qt of new Set(queryTokens)) {
    const weight = idf.get(qt) ?? 1;
    max += weight;
    if (docTf.has(qt)) score += weight;
  }
  return max ? score / max : 0;
}

/** Inverse document frequency across all docs (how rare each word is). */
export function buildIdf(docsTokens) {
  const df = new Map();
  for (const tokens of docsTokens) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  const n = docsTokens.length || 1;
  const idf = new Map();
  for (const [t, d] of df) idf.set(t, Math.log(1 + n / d));
  return idf;
}
