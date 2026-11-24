// End-to-end build of one site: description OR ready config -> plan -> compose
// -> assemble a self-contained project -> verify (config checklist + optional
// Vite build). This is the spine of Phase 5; the CLI and API call it.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFileStore } from "../store/file.js";
import { createEmbedder } from "../retrieve/embeddings.js";
import { planSite } from "../plan/index.js";
import { checkSparcConfig } from "../../sparc/config.js";
import { assembleProject } from "./project.js";
import { verifyProject } from "./verify.js";
import { eventsFromBuild } from "../evidence/feedback.js";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

/**
 * buildSite({ description?|config?, name, styleLevel?, enabledOptional?, callGemini?, build?, store?, embedder?, evidenceStore?, feedback? })
 *   evidenceStore  optional: read the current evidence before, record feedback and update it after
 *   feedback       optional: { plannedModuleIds, description } from the builder (what the user changed)
 * Returns { ok, name, dir, config, plan?, lock, verify, errors }.
 */
export async function buildSite(options) {
  const store = options.store || createFileStore(DATA_DIR);
  const embedder = options.embedder || createEmbedder();
  const records = await store.list();
  const name = options.name;
  const evidence = options.evidenceStore ? options.evidenceStore.load() : null;

  // 1. Get a validated config (from a description via the planner, or given directly).
  let config = options.config;
  let plan = null;
  if (!config) {
    if (!options.description) return { ok: false, errors: ["provide a description or a config"] };
    plan = await planSite(options.description, { embedder, styleLevel: options.styleLevel, enabledOptional: options.enabledOptional, callGemini: options.callGemini, evidence });
    config = plan.config;
  }
  const check = checkSparcConfig(config);
  if (!check.ok) return { ok: false, config, plan, errors: check.errors };

  // 2. Assemble the self-contained project + lock.
  const assembled = assembleProject(config, { name, records, evidence, ...(options.outDir ? { outDir: options.outDir } : {}) });
  if (!assembled.ok) return { ok: false, config, plan, errors: assembled.errors };

  // 3. Verify: config checklist (+ real Vite build unless build:false).
  const verify = verifyProject(assembled.dir, config, assembled.composition, { build: options.build !== false });

  // 4. Feedback: what worked (and what the user changed) becomes evidence for the NEXT build.
  let evidenceUpdate = null;
  if (options.evidenceStore) {
    const events = eventsFromBuild({
      config,
      picks: assembled.composition.picks,
      checks: verify.checklist.checks,
      buildOk: verify.build?.skipped ? undefined : verify.build?.ok,
      plannedModuleIds: options.feedback?.plannedModuleIds ?? (plan ? plan.signals?.moduleIds : undefined),
      description: options.feedback?.description ?? options.description ?? "",
    });
    const stored = options.evidenceStore.record(events);
    evidenceUpdate = { recorded: stored.stored, version: options.evidenceStore.update().version, usedVersion: evidence?.version ?? 0 };
  }

  return {
    ok: verify.ok,
    name,
    dir: assembled.dir,
    config,
    plan: plan ? { engine: plan.engine, reuse: plan.reuse, questions: plan.questions, modulesUsed: plan.modulesUsed } : null,
    lock: assembled.lock,
    verify,
    evidence: evidenceUpdate,
    errors: verify.ok ? [] : [...verify.checklist.checks.filter((c) => !c.pass).map((c) => `check failed: ${c.name}`), ...(verify.build?.ok === false ? [`build failed: ${verify.build.error}`] : [])],
  };
}
