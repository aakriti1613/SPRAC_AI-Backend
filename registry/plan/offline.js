// Offline planner: turn a plain-English description into "signals" using rules
// and the module search (no API key needed). It decides the website type,
// industry, style level, which library modules to reuse, and a brand name.
import { PORTAL_INDUSTRIES } from "../../lib/portalConfig.js";
import { MODULE_LIBRARY } from "../../sparc/modules.js";
import { buildLibraryIndex, embedQuery } from "../retrieve/library.js";
import { search } from "../retrieve/search.js";
import { tokenize } from "../retrieve/text.js";
import { moduleContext, moduleItemId } from "../evidence/feedback.js";
import { evidenceValue, lookup } from "../evidence/model.js";

const PORTFOLIO_WORDS = ["portfolio", "resume", "cv", "personal site", "about me", "my work", "freelance"];
const LANDING_WORDS = ["landing", "one page", "one-page", "brochure", "marketing site", "promote", "homepage", "coming soon"];
const SHOP_WORDS = ["online store", "online shop", "e-commerce", "ecommerce", "sell online", "sell products", "shopping cart", "checkout", "add to cart", "web store", "webshop", "buy online"];
const BOOKING_WORDS = ["book online", "online booking", "booking site", "booking website", "book an appointment", "book appointments", "book a slot", "book a table", "reservation", "time slots", "appointment booking", "schedule online", "book a session", "book a class"];
const ADMIN_WORDS = ["manage", "admin", "dashboard", "portal", "track", "records", "database", "crud", "internal tool", "back office"];

const INDUSTRY_WORDS = {
  healthcare: ["clinic", "hospital", "patient", "doctor", "medical", "health", "dental", "pharmacy"],
  school: ["school", "college", "student", "teacher", "class", "course", "coaching", "institute", "exam"],
  crm: ["crm", "lead", "deal", "sales", "customer", "pipeline", "prospect"],
  hrms: ["hr", "employee", "staff", "payroll", "leave", "attendance", "recruit"],
  inventory: ["inventory", "stock", "product", "warehouse", "shop", "store", "ecommerce", "order"],
  erp: ["erp", "vendor", "procurement", "invoice", "purchase order", "finance", "accounting"],
};

const STYLE_WORDS = {
  astonishing: ["stunning", "wow", "amazing", "3d", "flashy", "cutting edge", "impressive", "animated"],
  amazing: ["modern", "animated", "beautiful", "polished", "slick"],
  good: ["clean", "professional", "simple but nice", "neat"],
  basic: ["basic", "minimal", "plain", "simple", "fast"],
};

function detectWebsiteType(text) {
  const t = ` ${text.toLowerCase()} `;
  const score = (words) => words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  const admin = score(ADMIN_WORDS);
  const portfolio = score(PORTFOLIO_WORDS);
  const landing = score(LANDING_WORDS);
  const shop = score(SHOP_WORDS);
  const booking = score(BOOKING_WORDS);
  const best = Math.max(admin, portfolio, landing, shop, booking);
  if (best === 0) return { type: "admin-portal", confident: false };
  // A tie goes to admin-portal, so descriptions that worked before still work.
  if (admin === best) return { type: "admin-portal", confident: admin > landing && admin > portfolio && admin > shop && admin > booking };
  if (shop === best) return { type: "ecommerce", confident: shop > booking && shop > portfolio && shop > landing };
  if (booking === best) return { type: "booking", confident: booking > portfolio && booking > landing };
  if (portfolio === best) return { type: "portfolio", confident: portfolio > landing };
  return { type: "landing", confident: landing > portfolio };
}

export function detectIndustry(text) {
  const t = ` ${text.toLowerCase()} `;
  let best = { industry: "generic", hits: 0 };
  for (const [industry, words] of Object.entries(INDUSTRY_WORDS)) {
    const hits = words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
    if (hits > best.hits) best = { industry, hits };
  }
  return best.industry;
}

function detectStyle(text) {
  const t = ` ${text.toLowerCase()} `;
  for (const level of ["astonishing", "amazing", "good", "basic"]) {
    if (STYLE_WORDS[level].some((w) => t.includes(w))) return level;
  }
  return null;
}

/** A short brand name from the description ("A clinic called Sunrise" -> "Sunrise"). */
export function guessBrandName(text) {
  const quoted = /["“']([^"”']{2,40})["”']/.exec(text);
  if (quoted) return quoted[1].trim();
  const called = /\b(?:called|named|for)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/.exec(text);
  if (called) return called[1].trim();
  const caps = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g);
  if (caps) {
    const skip = new Set(["I", "We", "My", "The", "A", "An"]);
    const pick = caps.find((c) => !skip.has(c.split(" ")[0]));
    if (pick) return pick;
  }
  return "";
}

/**
 * Rank the module library for a description and choose the modules to use.
 * evidence (optional snapshot): modules users kept for this industry rank higher,
 * modules they removed rank lower. A module with strong evidence for the request's
 * words may join without a literal word match (e.g. school requests keep "fees").
 * Returns { moduleIds, ranked: [{ id, score, evidence? }] }.
 */
export async function selectModules(description, { embedder, industry, evidence = null, index = null } = {}) {
  const idx = index || (await buildLibraryIndex({ embedder }));
  const qv = await embedQuery(idx, description);
  const hits = search(idx, {
    query: description,
    queryVector: qv,
    filters: { kind: "module" },
    limit: 12,
    evidence: evidence ? { snapshot: evidence, contextFor: () => moduleContext(industry) } : null,
  });
  // Keep only strong matches close to the best one, so weak/off-topic modules
  // don't sneak in. A direct keyword hit (word appears in the query) counts as strong.
  const top = hits[0]?.score ?? 0;
  // Learned from feedback (only with confident evidence for THIS request's words):
  //   learnedIn:  users kept it for requests like this -> may join without a literal word match
  //   learnedOut: users removed it for requests like this -> not added automatically
  // A module the request names directly is always added below, whatever the evidence says.
  const learnedIn = (h) => h.evidence?.confident && h.evidence.wordMatch > 0 && h.evidence.fit > 0.6;
  const queryWords = [...new Set(tokenize(description))];
  const learnedOut = (id) => {
    if (!evidence) return false;
    const e = evidenceValue(lookup(evidence, moduleItemId(id), moduleContext(industry)), { queryWords });
    return e.confident && e.wordMatch < 0 && e.fit < 0.5;
  };
  const strong = hits.filter((h) => (h.matched.length > 0 || learnedIn(h)) && !learnedOut(h.payload.id) && h.score >= Math.max(0.3, top * 0.6));
  let moduleIds = strong.map((h) => h.payload.id).slice(0, 5);
  // Always include a module the user named directly (its singular/plural word is in the text).
  const qTokens = new Set(tokenize(description));
  for (const m of MODULE_LIBRARY) {
    const named = tokenize(`${m.singularName} ${m.pluralName}`).some((w) => qTokens.has(w));
    if (named && !moduleIds.includes(m.id)) moduleIds.push(m.id);
  }
  moduleIds = moduleIds.slice(0, 6);
  // If the description was vague, seed the detected industry's home modules.
  if (moduleIds.length < 2) {
    // (starter modules that users removed for requests like this are not seeded either)
    const homeModules = MODULE_LIBRARY.filter((m) => m.industries[0] === industry && !learnedOut(m.id)).map((m) => m.id);
    moduleIds = [...new Set([...moduleIds, ...homeModules])].slice(0, 4);
  }
  return { moduleIds, ranked: hits.map((h) => ({ id: h.payload.id, score: h.score, ...(h.evidence ? { evidence: h.evidence } : {}) })) };
}

export async function planOffline(description, { embedder, styleLevel, evidence = null } = {}) {
  const wt = detectWebsiteType(description);
  const industry = detectIndustry(description);
  const style = styleLevel || detectStyle(description) || "good";
  const brandName = guessBrandName(description) || (wt.type === "portfolio" ? "Your Name" : wt.type === "ecommerce" ? "Your Shop" : "Your Brand");

  let moduleIds = [];
  if (wt.type === "admin-portal") {
    moduleIds = (await selectModules(description, { embedder, industry, evidence })).moduleIds;
  }

  return {
    engine: embedder?.online ? "offline-rules+gemini-embed" : "offline-rules",
    signals: {
      websiteType: wt.type,
      industry,
      styleLevel: style,
      brandName,
      moduleIds,
      enabledOptional: [],
      description,
    },
    confidence: { websiteType: wt.confident, industryDetected: industry !== "generic" },
  };
}
