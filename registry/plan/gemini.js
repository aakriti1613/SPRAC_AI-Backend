// Gemini planner: the LLM chooses from the library instead of inventing code.
// It is given the list of module ids (with summaries) and must return ONLY ids
// it picks, plus the website type, industry, style and brand. We then expand
// those ids with assembleConfig, so fields always come from the real library.
import { MODULE_LIBRARY } from "../../sparc/modules.js";
import { PORTAL_INDUSTRIES } from "../../lib/portalConfig.js";
import { STYLE_LEVEL_IDS } from "../../sparc/styleLevels.js";

export function buildPlannerPrompt(description) {
  const catalogue = MODULE_LIBRARY.map((m) => `- ${m.id}: ${m.singularName} — ${m.summary}`).join("\n");
  return `You plan a website by REUSING ready-made modules. Never invent fields.

Return ONLY JSON of this exact shape, nothing else:
{
  "websiteType": "portfolio" | "landing" | "admin-portal" | "ecommerce" | "booking",
  "industry": ${PORTAL_INDUSTRIES.map((i) => `"${i}"`).join(" | ")},
  "styleLevel": ${STYLE_LEVEL_IDS.map((s) => `"${s}"`).join(" | ")},
  "brandName": "short name",
  "moduleIds": ["ids from the list below; [] for every type except admin-portal"],
  "question": "one short clarifying question, or empty string"
}

Rules:
- "admin-portal" when the user wants to MANAGE or TRACK records; "portfolio" for a personal/CV site; "landing" for a one-page marketing site; "ecommerce" when visitors should BUY products online (cart and checkout); "booking" when visitors should BOOK appointments or time slots.
- moduleIds: choose only ids that fit, from this library. Do not make up ids.
- admin portals, online shops and booking sites cannot use the "astonishing" style (max "amazing").

Module library:
${catalogue}

User description:
${description}`;
}

/** Keep only values that are valid; drop anything the model made up. */
export function sanitizePlan(raw) {
  const ids = new Set(MODULE_LIBRARY.map((m) => m.id));
  const websiteType = ["portfolio", "landing", "admin-portal", "ecommerce", "booking"].includes(raw?.websiteType) ? raw.websiteType : "admin-portal";
  return {
    websiteType,
    industry: PORTAL_INDUSTRIES.includes(raw?.industry) ? raw.industry : "generic",
    styleLevel: STYLE_LEVEL_IDS.includes(raw?.styleLevel) ? raw.styleLevel : "good",
    brandName: typeof raw?.brandName === "string" && raw.brandName.trim() ? raw.brandName.trim().slice(0, 60) : "Your Brand",
    moduleIds: Array.isArray(raw?.moduleIds) ? raw.moduleIds.filter((id) => ids.has(id)).slice(0, 6) : [],
    question: typeof raw?.question === "string" ? raw.question.trim() : "",
  };
}

/**
 * callGemini(prompt) -> Promise<string JSON>. Injected so tests can pass a fake.
 * In production it uses @google/genai with GEMINI_API_KEY.
 */
export function createGeminiCaller(apiKey = process.env.GEMINI_API_KEY) {
  return async function callGemini(prompt) {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    return res.text ?? "";
  };
}

export async function planWithGemini(description, { callGemini, styleLevel } = {}) {
  const text = await callGemini(buildPlannerPrompt(description));
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    parsed = m ? JSON.parse(m[0]) : {};
  }
  const clean = sanitizePlan(parsed);
  if (styleLevel) clean.styleLevel = styleLevel;
  return {
    engine: "gemini",
    signals: {
      websiteType: clean.websiteType,
      industry: clean.industry,
      styleLevel: clean.styleLevel,
      brandName: clean.brandName,
      moduleIds: clean.moduleIds,
      enabledOptional: [],
      description,
    },
    question: clean.question,
  };
}
