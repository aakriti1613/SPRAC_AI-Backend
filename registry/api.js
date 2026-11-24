// Express router for Phase 4 features, mounted at /api (behind the platform login).
//   POST /api/plan      description -> validated SPARC config + reuse score + questions
//   POST /api/compose   website type + style -> which component fills each room + lock
//   POST /api/registry/search  search the module library and component catalogue
//
// Read-only over the catalogue; it never writes. The record list and embedder are
// built once and refreshed lazily so requests stay fast.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEmbedder } from "./retrieve/embeddings.js";
import { buildLibraryIndex, embedQuery } from "./retrieve/library.js";
import { search } from "./retrieve/search.js";
import { composeSite, lockFromComposition, suggestForRoom } from "./retrieve/compose.js";
import { createEvidenceStore } from "./evidence/store.js";
import { eventsFromChoice } from "./evidence/feedback.js";
import { createFileStore } from "./store/file.js";
import { planSite } from "./plan/index.js";
import { createGeminiCaller } from "./plan/gemini.js";
import { buildSite } from "./assemble/build.js";
import { assembleConfig } from "./plan/assemble.js";
import { MODULE_LIBRARY } from "../sparc/modules.js";
import { checkSparcConfig } from "../sparc/config.js";
import { ROOMS, activeBlueprints } from "../sparc/index.js";
import { STYLE_LEVELS, STYLE_LEVEL_IDS, levelsUpTo } from "../sparc/styleLevels.js";
import { PORTAL_INDUSTRIES } from "../lib/portalConfig.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,48}$/;

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");

/** Everything the builder screen needs to offer choices (read from the SPARC data, never hard-coded in the UI). */
export function builderOptions() {
  return {
    websiteTypes: activeBlueprints().map((bp) => ({
      id: bp.id,
      name: bp.name,
      description: bp.description,
      maxStyleLevel: bp.maxStyleLevel,
      styleLevels: levelsUpTo(bp.maxStyleLevel),
      industries: bp.industries,
      optionalRooms: bp.rooms.optional.map((id) => ({ id, description: ROOMS[id].description, defaultOn: bp.rooms.defaultOn.includes(id), forIndustries: Object.entries(bp.industryDefaults || {}).filter(([, ids]) => ids.includes(id)).map(([ind]) => ind) })),
    })),
    styleLevels: STYLE_LEVEL_IDS.map((id) => ({ id, label: STYLE_LEVELS[id].label, summary: STYLE_LEVELS[id].summary })),
    industries: PORTAL_INDUSTRIES,
    modules: MODULE_LIBRARY.map((m) => ({ id: m.id, singularName: m.singularName, pluralName: m.pluralName, summary: m.summary, industries: m.industries, fieldCount: m.fields.length })),
  };
}

export function createRegistryRouter({ store = createFileStore(DATA_DIR), embedder = createEmbedder(), outputDir = null, evidenceStore = createEvidenceStore() } = {}) {
  const router = express.Router();
  let cache = null; // { records, index } built lazily, kept for the process
  async function ready() {
    if (!cache) {
      const records = await store.list();
      const index = await buildLibraryIndex({ embedder, records, includeModules: true });
      cache = { records, index };
    }
    return cache;
  }

  router.post("/plan", async (req, res) => {
    const { description, styleLevel, enabledOptional, useGemini } = req.body || {};
    if (!description || typeof description !== "string" || description.trim().length < 3) {
      return res.status(400).json({ success: false, error: "description (a few words) is required" });
    }
    try {
      const callGemini = useGemini && process.env.GEMINI_API_KEY ? createGeminiCaller() : null;
      const plan = await planSite(description.trim(), { embedder, styleLevel, enabledOptional, callGemini, evidence: evidenceStore.load() });
      return res.json({ success: true, ...plan });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Planning failed." });
    }
  });

  router.get("/sparc/options", (req, res) => res.json({ success: true, ...builderOptions() }));

  // Rebuild a config after the user edits the plan (website type, industry, style, modules, rooms, brand).
  router.post("/sparc/config", (req, res) => {
    const { signals } = req.body || {};
    if (!signals || typeof signals !== "object") return res.status(400).json({ success: false, error: "signals object is required" });
    try {
      const built = assembleConfig({ moduleIds: [], enabledOptional: [], ...signals });
      return res.json({ success: built.ok, config: built.config, errors: built.errors, usedIds: built.usedIds, unknownIds: built.unknownIds });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message || "Could not build a config." });
    }
  });

  router.post("/build", async (req, res) => {
    const { description, config, name, styleLevel, enabledOptional, runBuild, forDeploy, feedback } = req.body || {};
    if (!SLUG.test(String(name || ""))) return res.status(400).json({ success: false, error: "name must be a lowercase slug (a-z, 0-9, dashes)" });
    if (!description && !config) return res.status(400).json({ success: false, error: "provide a description or a config" });
    try {
      const { records } = await ready();
      // runBuild actually compiles the project with Vite (slow): off by default in the API.
      // forDeploy writes a standalone project into the platform's output folder, ready for /api/push + /api/deploy.
      if (forDeploy && !outputDir) return res.status(400).json({ success: false, error: "this server has no output folder configured" });
      const result = await buildSite({
        description, config, name, styleLevel, enabledOptional,
        build: runBuild === true && !forDeploy,
        store: { list: async () => records },
        embedder,
        evidenceStore,
        feedback: feedback && typeof feedback === "object" ? { plannedModuleIds: Array.isArray(feedback.plannedModuleIds) ? feedback.plannedModuleIds.map(String) : undefined, description: String(feedback.description ?? "").slice(0, 500) } : undefined,
        ...(forDeploy ? { outDir: outputDir } : {}),
      });
      return res.json({ success: result.ok, ...result, forDeploy: Boolean(forDeploy) });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Build failed." });
    }
  });

  router.post("/compose", async (req, res) => {
    const { websiteType, styleLevel, enabledOptional, industry } = req.body || {};
    if (!websiteType || !styleLevel) return res.status(400).json({ success: false, error: "websiteType and styleLevel are required" });
    try {
      const { records } = await ready();
      const evidence = evidenceStore.load();
      const composition = composeSite(records, { websiteType, styleLevel, enabledOptional: enabledOptional || [], industry, evidence });
      // Top 3 per room; the third place is kept for the best less-tried part (fair chance).
      const suggestions = Object.fromEntries(Object.entries(composition.picks).map(([room, p]) => [room, suggestForRoom(records, { websiteType, styleLevel: p.level, room, industry, evidence })]));
      return res.json({ success: true, composition, suggestions, lock: lockFromComposition(composition) });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message || "Compose failed." });
    }
  });

  // Check a config the user edited by hand (JSON), without building anything.
  router.post("/sparc/check", (req, res) => {
    const { config } = req.body || {};
    if (!config || typeof config !== "object" || Array.isArray(config)) return res.status(400).json({ success: false, error: "config object is required" });
    const r = checkSparcConfig(config);
    return res.json({ success: r.ok, errors: r.errors });
  });

  // The user picked a component from the suggestions: that choice is evidence.
  router.post("/sparc/choice", async (req, res) => {
    const { websiteType, industry, room, styleLevel, chosen, description } = req.body || {};
    if (!websiteType || !room || !styleLevel || !chosen?.slug || !chosen?.source) return res.status(400).json({ success: false, error: "websiteType, room, styleLevel and chosen {slug, source} are required" });
    const { records } = await ready();
    if (!records.some((r) => r.slug === chosen.slug && r.source === chosen.source && r.trust === "verified" && r.room === room)) return res.status(400).json({ success: false, error: "chosen must be a verified component for that room" });
    const stored = evidenceStore.record(eventsFromChoice({ websiteType, industry, room, styleLevel, chosen, description: String(description ?? "").slice(0, 500) }));
    return res.json({ success: true, recorded: stored.stored, version: evidenceStore.update().version });
  });

  router.post("/registry/search", async (req, res) => {
    const { query = "", kind, filters = {}, limit = 10 } = req.body || {};
    try {
      const { index } = await ready();
      const qv = await embedQuery(index, query);
      const allFilters = kind ? { ...filters, kind } : filters;
      const results = search(index, { query, queryVector: qv, filters: allFilters, limit: Math.min(Math.max(Number(limit) || 10, 1), 50) });
      return res.json({ success: true, count: results.length, results });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Search failed." });
    }
  });

  return router;
}
