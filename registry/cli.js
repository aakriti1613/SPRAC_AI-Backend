#!/usr/bin/env node
// SPARC component registry CLI.
//   node registry/cli.js ingest --source <own-library|own-templates|shadcn|magicui|aceternity|npm|github|storybook|all> [--store file|supabase]
//   node registry/cli.js report      -> docs/LIBRARY_STATUS.md
//   node registry/cli.js verify      -> re-check every stored label (exit 1 if any is invalid)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkCdl, loadBlueprints } from "../sparc/index.js";
import { githubAdapter } from "./adapters/github.js";
import { npmAdapter } from "./adapters/npm.js";
import { ownLibraryAdapter } from "./adapters/own.js";
import { aceternityAdapter, magicUiAdapter, shadcnAdapter } from "./adapters/shadcn.js";
import { storybookAdapter } from "./adapters/storybook.js";
import { templatesAdapter } from "./adapters/templates.js";
import { createFetchJson } from "./fetch.js";
import { currentLabel, runIngest } from "./pipeline.js";
import { renderLibraryStatus } from "./report.js";
import { evaluateSearch, evaluatePlanner } from "./evaluate.js";
import { createFileStore } from "./store/file.js";
import { createSupabaseStore } from "./store/supabase.js";

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(BACKEND, "registry", "data");

export const SOURCE_ORDER = ["own-library", "own-templates", "shadcn", "magicui", "aceternity", "npm", "github", "storybook"];

export function makeAdapter(name, { fetchJson } = {}) {
  const crudUi = path.join(BACKEND, "templates", "crud-modern-new-temp", "src", "components", "ui");
  switch (name) {
    case "own-library":
      return ownLibraryAdapter({ sparcUiDir: path.join(BACKEND, "sparc-ui") });
    case "own-templates":
      return templatesAdapter({ templatesDir: path.join(BACKEND, "templates") });
    case "shadcn":
      return shadcnAdapter({ fetchJson, ownUiNames: fs.existsSync(crudUi) ? fs.readdirSync(crudUi).map((f) => f.replace(/\.tsx$/, "")) : [] });
    case "magicui":
      return magicUiAdapter({ fetchJson });
    case "aceternity":
      return aceternityAdapter({ fetchJson });
    case "npm":
      return npmAdapter({ fetchJson });
    case "github":
      return githubAdapter({ fetchJson });
    case "storybook":
      return storybookAdapter({ fetchJson });
    default:
      throw new Error(`unknown source "${name}" (choose: ${SOURCE_ORDER.join(", ")}, all)`);
  }
}

function makeStore(kind) {
  if (kind === "supabase") {
    return createSupabaseStore({ url: process.env.REGISTRY_SUPABASE_URL, serviceKey: process.env.REGISTRY_SUPABASE_SERVICE_KEY });
  }
  return createFileStore(DATA_DIR);
}

function arg(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

async function main(argv) {
  const [command, ...args] = argv;
  if (command === "ingest") {
    const source = arg(args, "source", "all");
    const store = makeStore(arg(args, "store", "file"));
    const fetchJson = createFetchJson();
    const names = source === "all" ? SOURCE_ORDER : [source];
    let failed = 0;
    for (const name of names) {
      const run = await runIngest({ adapter: makeAdapter(name, { fetchJson }), store });
      failed += run.failed;
      const { errors, ...summary } = run;
      console.log(`[${name}]`, JSON.stringify({ ...summary, runId: undefined, startedAt: undefined, finishedAt: undefined }));
      for (const e of errors.slice(0, 10)) console.log(`   ! ${e.stage} ${e.ref}: ${e.message}`);
    }
    return failed ? 2 : 0;
  }
  if (command === "report") {
    const records = await createFileStore(DATA_DIR).list();
    const out = path.join(BACKEND, "docs", "LIBRARY_STATUS.md");
    fs.writeFileSync(out, renderLibraryStatus(records));
    console.log("wrote", path.relative(BACKEND, out), `(${records.length} components)`);
    return 0;
  }
  if (command === "verify") {
    const blueprints = loadBlueprints();
    const records = await createFileStore(DATA_DIR).list();
    let bad = 0;
    for (const r of records) {
      const res = checkCdl(currentLabel(r), blueprints);
      if (!res.ok) {
        bad += 1;
        console.log(`✗ ${r.source}/${r.slug}: ${res.errors.join("; ")}`);
      }
    }
    console.log(`${records.length - bad}/${records.length} stored labels are valid`);
    return bad ? 1 : 0;
  }
  if (command === "evaluate") {
    const search = await evaluateSearch();
    const planner = await evaluatePlanner();
    console.log("search :", JSON.stringify({ recallAt5: search.recallAt5, mrr: search.mrr, n: search.n }));
    console.log("planner:", JSON.stringify({ websiteType: planner.websiteTypeAccuracy, industry: planner.industryAccuracy, configValid: planner.configValidPct, moduleRecall: planner.moduleRecall, modulePrecision: planner.modulePrecision, reuse: planner.avgReuseRatio }));
    return 0;
  }
  if (command === "evaluate-sites" || command === "evaluate-report") {
    const { runEvaluation, loadResults, DEFAULT_OUT } = await import("./evaluation/run.js");
    const { renderReport, renderCharts } = await import("./evaluation/report.js");
    let results;
    if (command === "evaluate-report") {
      results = loadResults();
      if (!results) {
        console.log("no results yet: run evaluate-sites first");
        return 1;
      }
    } else {
      const only = arg(args, "engine");
      results = await runEvaluation({
        limit: Number(arg(args, "limit")) || undefined,
        engines: only ? [only] : undefined,
        skipAi: args.includes("--skip-ai"),
        skipRepeat: args.includes("--skip-repeat"),
        skipLevels: args.includes("--skip-levels"),
        resume: args.includes("--resume"),
      });
    }
    const docs = path.join(BACKEND, "docs");
    fs.mkdirSync(path.join(docs, "eval"), { recursive: true });
    fs.writeFileSync(path.join(docs, "EVALUATION.md"), renderReport(results));
    fs.writeFileSync(path.join(docs, "eval", "charts.html"), renderCharts(results));
    console.log(`wrote docs/EVALUATION.md, docs/eval/charts.html (results: ${path.relative(BACKEND, DEFAULT_OUT)})`);
    return 0;
  }
  if (command === "evaluate-rcde") {
    const { runRcdeReplay, renderRcdeReport } = await import("./evaluation/rcde.js");
    const result = await runRcdeReplay();
    fs.mkdirSync(path.join(BACKEND, "docs", "eval"), { recursive: true });
    fs.writeFileSync(path.join(BACKEND, "docs", "eval", "rcde.json"), `${JSON.stringify(result, null, 2)}
`);
    fs.writeFileSync(path.join(BACKEND, "docs", "eval", "RCDE.md"), renderRcdeReport(result));
    console.log("wrote docs/eval/RCDE.md and docs/eval/rcde.json");
    return 0;
  }
  if (command === "evidence") {
    const { createEvidenceStore } = await import("./evidence/store.js");
    const { describeEvidence } = await import("./evidence/model.js");
    const store = createEvidenceStore();
    const sub = args[0] || "report";
    if (sub === "update") return console.log(`evidence snapshot v${store.update().version}`), 0;
    if (sub === "rollback") return console.log(`now using v${store.rollback(Number(args[1])).version}`), 0;
    const snap = store.load();
    console.log(`evidence v${snap.version} (${snap.events ?? 0} events), snapshots: ${store.versions().join(", ") || "none"}`);
    for (const [item, byCtx] of Object.entries(snap.items)) for (const [ctx, s] of Object.entries(byCtx)) console.log(`  ${item}  [${ctx}]  ${JSON.stringify(describeEvidence(s))}`);
    return 0;
  }
  if (command === "study-sites") {
    const { buildStudySites } = await import("./evaluation/run.js");
    const records = await createFileStore(DATA_DIR).list();
    const rows = buildStudySites({ records });
    for (const r of rows) console.log(`${r.ok ? "ok    " : "FAILED"} ${r.site}-${r.styleLevel}  ${r.dir ?? ""}`);
    console.log("Preview one with: npx vite preview --outDir dist (inside its folder). See docs/eval/USER_STUDY.md");
    return rows.every((r) => r.ok) ? 0 : 2;
  }
  if (command === "study-report") {
    const file = args[0];
    if (!file) return console.log("usage: node registry/cli.js study-report ratings.csv"), 1;
    const { parseRatings, analyze, renderRatingsReport } = await import("./evaluation/ratings.js");
    const { ratings, problems } = parseRatings(fs.readFileSync(file, "utf8"));
    if (problems.length) return console.log(`Problems in ${file}:\n- ${problems.join("\n- ")}`), 1;
    process.stdout.write(renderRatingsReport(analyze(ratings)));
    return 0;
  }
  if (command === "build") {
    const { buildSite } = await import("./assemble/build.js");
    const configPath = arg(args, "config");
    const config = configPath ? JSON.parse(fs.readFileSync(configPath, "utf8")) : undefined;
    // The description is the first argument that isn't a --flag or a flag's value.
    const flagValues = new Set(["--name", "--style", "--config", "--source", "--store"].flatMap((f) => (args.includes(f) ? [args[args.indexOf(f) + 1]] : [])));
    const description = config ? undefined : args.find((a) => !a.startsWith("--") && !flagValues.has(a));
    const name = arg(args, "name", "generated-site");
    const forDeploy = args.includes("--for-deploy");
    const outDir = forDeploy ? path.join(BACKEND, "output") : undefined;
    const result = await buildSite({
      description,
      config,
      name,
      styleLevel: arg(args, "style"),
      build: !args.includes("--no-build") && !forDeploy,
      ...(outDir ? { outDir } : {}),
    });
    if (result.plan) console.log(`plan: ${result.plan.engine} | reuse ${result.plan.reuse.note}`);
    console.log(`config: ${result.config?.websiteType} / ${result.config?.styleLevel}`);
    if (result.verify) {
      const passed = result.verify.checklist.checks.filter((c) => c.pass).length;
      console.log(`checklist: ${passed}/${result.verify.checklist.checks.length} passed`);
      if (result.verify.build?.ok) console.log(`build: ok in ${result.verify.build.ms}ms, ${result.verify.build.bundleKb} KB`);
      else if (result.verify.build?.skipped) console.log("build: skipped");
    }
    console.log(result.ok ? `OK -> ${result.dir}` : `FAILED:\n  ${result.errors.join("\n  ")}`);
    if (forDeploy && result.ok) console.log("Ready for deploy. Push & deploy with POST /api/push and POST /api/deploy (needs GITHUB_TOKEN, VERCEL_TOKEN).");
    return result.ok ? 0 : 2;
  }
  console.log("usage: node registry/cli.js <ingest|report|verify|evaluate|evaluate-sites|evaluate-report|study-sites|study-report|build> [--source name|all] [--store file|supabase]");
  console.log("  evaluate-sites [--limit n] [--engine offline|gemini] [--skip-ai] [--skip-repeat] [--skip-levels] [--resume]");
  console.log("  build \"<description>\" --name my-site [--style amazing] [--config file.json] [--no-build] [--for-deploy]");
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    console.error(e);
    process.exit(1);
  });
}
