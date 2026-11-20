// Planner entry point: description -> validated SPARC config + reuse score +
// clarifying questions. Uses Gemini when a caller is given, else the offline
// rules engine. Always expands library modules (reuse-first) and validates; if
// validation fails it falls back to a safe default so a build is never blocked.
import { MODULE_LIBRARY } from "../../sparc/modules.js";
import { createEmbedder } from "../retrieve/embeddings.js";
import { assembleConfig } from "./assemble.js";
import { guessBrandName, planOffline } from "./offline.js";
import { createGeminiCaller, planWithGemini } from "./gemini.js";

const HOME = new Map();
for (const m of MODULE_LIBRARY) (HOME.get(m.industries[0]) || HOME.set(m.industries[0], []).get(m.industries[0])).push(m.id);

function reuseScore(signals, usedIds) {
  if (signals.websiteType !== "admin-portal") return { reusedModules: 0, newModules: 0, ratio: 1, note: "site built entirely from reusable sections" };
  const reused = usedIds.length;
  return { reusedModules: reused, newModules: 0, ratio: reused ? 1 : 0, note: `${reused} modules reused from the library, 0 written from scratch` };
}

function clarifyingQuestions(signals, confidence, usedIds) {
  const qs = [];
  if (confidence && !confidence.websiteType) qs.push("Is this a personal/portfolio site, a one-page landing page, or an admin portal to manage records?");
  if (signals.websiteType === "admin-portal" && usedIds.length === 0) qs.push("What kinds of records do you want to manage (for example patients, products, students)?");
  if (!guessBrandName(signals.description) && signals.brandName.startsWith("Your")) qs.push("What should the site or portal be called?");
  return qs;
}

/**
 * description  plain text
 * options: { callGemini?, embedder?, styleLevel?, enabledOptional? }
 *   - pass callGemini (or set GEMINI_API_KEY and pass useGemini) to use the LLM
 * Returns { engine, config, ok, errors, modulesUsed, reuse, questions, signals, repaired }
 */
export async function planSite(description, options = {}) {
  const embedder = options.embedder || createEmbedder();
  let plan;
  let confidence = null;
  const callGemini = options.callGemini || (options.useGemini ? createGeminiCaller() : null);

  if (callGemini) {
    try {
      plan = await planWithGemini(description, { callGemini, styleLevel: options.styleLevel });
    } catch (err) {
      plan = { ...(await planOffline(description, { embedder, styleLevel: options.styleLevel })), fallbackReason: `Gemini failed: ${err.message}` };
    }
  } else {
    plan = await planOffline(description, { embedder, styleLevel: options.styleLevel });
    confidence = plan.confidence;
  }

  const signals = { ...plan.signals, enabledOptional: options.enabledOptional || plan.signals.enabledOptional || [] };
  let built = assembleConfig(signals);
  let repaired = false;

  // Repair: if an admin portal ended up with no modules, seed the industry's home modules.
  if (!built.ok && signals.websiteType === "admin-portal" && signals.moduleIds.length === 0) {
    signals.moduleIds = (HOME.get(signals.industry) || HOME.get("generic") || []).slice(0, 3);
    built = assembleConfig(signals);
    repaired = true;
  }
  // Last resort: a minimal generic portal that always validates.
  if (!built.ok) {
    const fallback = { websiteType: "admin-portal", industry: "generic", styleLevel: "good", brandName: signals.brandName || "Your Portal", moduleIds: (HOME.get("generic") || []).slice(0, 2), enabledOptional: [] };
    built = assembleConfig(fallback);
    Object.assign(signals, fallback);
    repaired = true;
  }

  const modulesUsed = (signals.websiteType === "admin-portal" ? signals.moduleIds : []).map((id) => ({ id, source: "library" }));
  return {
    engine: plan.engine,
    fallbackReason: plan.fallbackReason,
    ok: built.ok,
    config: built.config,
    errors: built.errors,
    modulesUsed,
    reuse: reuseScore(signals, built.usedIds),
    questions: [...new Set([...(plan.question ? [plan.question] : []), ...clarifyingQuestions(signals, confidence, built.usedIds)])],
    signals,
    repaired,
  };
}
