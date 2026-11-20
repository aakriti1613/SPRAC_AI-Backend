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

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

/**
 * buildSite({ description?|config?, name, styleLevel?, enabledOptional?, callGemini?, build?, store?, embedder? })
 * Returns { ok, name, dir, config, plan?, lock, verify, errors }.
 */
export async function buildSite(options) {
  const store = options.store || createFileStore(DATA_DIR);
  const embedder = options.embedder || createEmbedder();
  const records = await store.list();
  const name = options.name;

  // 1. Get a validated config (from a description via the planner, or given directly).
  let config = options.config;
  let plan = null;
  if (!config) {
    if (!options.description) return { ok: false, errors: ["provide a description or a config"] };
    plan = await planSite(options.description, { embedder, styleLevel: options.styleLevel, enabledOptional: options.enabledOptional, callGemini: options.callGemini });
    config = plan.config;
  }
  const check = checkSparcConfig(config);
  if (!check.ok) return { ok: false, config, plan, errors: check.errors };

  // 2. Assemble the self-contained project + lock.
  const assembled = assembleProject(config, { name, records, ...(options.outDir ? { outDir: options.outDir } : {}) });
  if (!assembled.ok) return { ok: false, config, plan, errors: assembled.errors };

  // 3. Verify: config checklist (+ real Vite build unless build:false).
  const verify = verifyProject(assembled.dir, config, assembled.composition, { build: options.build !== false });

  return {
    ok: verify.ok,
    name,
    dir: assembled.dir,
    config,
    plan: plan ? { engine: plan.engine, reuse: plan.reuse, questions: plan.questions, modulesUsed: plan.modulesUsed } : null,
    lock: assembled.lock,
    verify,
    errors: verify.ok ? [] : [...verify.checklist.checks.filter((c) => !c.pass).map((c) => `check failed: ${c.name}`), ...(verify.build?.ok === false ? [`build failed: ${verify.build.error}`] : [])],
  };
}
