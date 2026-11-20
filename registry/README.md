# SPARC component registry (Phase 3)

Collects components from six sources, labels each one with a CDL label, and
stores them. **Only our own library can produce `verified` components**; all
other sources give `candidate`s that can be searched and recommended but are
never placed into a build automatically.

```
analyze/typescript.js   reads props / imports / field types with the TypeScript compiler (never runs code)
analyze/rules.js        static rules: fixed colours, network calls, raw HTML, eval; content hash
label.js                builds the CDL label and decides verified vs candidate (uses sparc/ checkCdl)
pipeline.js             adapter -> label -> dedupe by content hash -> store; deprecates vanished items
adapters/               own (sparc-ui/library), templates (old prototype code), shadcn, magicui, aceternity, npm, github, storybook
store/file.js           one JSON per component in registry/data/ (reviewable in Git)
store/supabase.js       same records into Postgres (migrations/001_registry.sql) — mocked tests only so far
report.js               docs/LIBRARY_STATUS.md: progress vs the 131 V1 targets
cli.js                  ingest | report | verify | evaluate

retrieve/text.js        tokenise + synonyms for offline keyword search
retrieve/embeddings.js  meaning-vectors (Gemini when a key is set, else offline hashing)
retrieve/search.js      hybrid search (keyword + vector + quality) with reasons
retrieve/library.js     modules + components -> searchable documents
retrieve/compat.js      compatibility checks (room, style ceiling, licence, peer ranges)
retrieve/compose.js     pick the best verified component per room + a reproducibility lock
plan/offline.js         rules engine: description -> signals (no key)
plan/gemini.js          LLM engine: picks library modules from a constrained prompt
plan/assemble.js        signals -> full SPARC config by EXPANDING library modules
plan/index.js           planSite(): plan + validate + reuse score + clarifying questions
evaluate.js             scores search + planner against sparc/eval/*
assemble/project.js     config + components -> a self-contained, buildable project + lock
assemble/verify.js      build the project with Vite + config-derived checks
assemble/build.js       plan -> compose -> assemble -> verify (one call)
api.js                  /api/plan, /api/compose, /api/registry/search, /api/build, /api/sparc/options, /api/sparc/config (behind login)
```

The planner and search are built with TWO engines: an **offline** engine (keyword +
synonym + hashing vectors + rules) that needs no key, and a **Gemini** engine
(real embeddings + a constrained planner prompt). The offline engine is what the
tests and `npm run registry:evaluate` use; the Gemini path is tested with recorded
fake replies. Set `GEMINI_API_KEY` and pass `useGemini` to `/api/plan` for the real one.

## Commands (from platform-backend-main)

```bash
npm run registry:ingest -- --source all        # or own-library | own-templates | shadcn | magicui | aceternity | npm | github | storybook
npm run registry:report                         # writes docs/LIBRARY_STATUS.md
npm run registry:verify                         # re-checks every stored label
npm run registry:evaluate                       # search + planner accuracy (sparc/eval/*)
npm run registry:build "<description>" --name my-site [--style amazing] [--for-deploy]
```

Before ingesting our own library, measure it (size + accessibility):

```bash
cd sparc-ui && npm run library:measure
```

## When does a component become `verified`?

All of these must pass (see `label.js`):

- CDL label is valid and its room exists; its style level is allowed for every website type it lists
- props (read by the TypeScript compiler) fit the room's plug shape
- only packages allowed at its style level; license allowed
- size within the level's budget; 0 serious accessibility violations (axe)
- no fixed colours, network calls, raw HTML or eval — unless a line carries a reviewed
  `// sparc-allow <rule>: <reason>` exception, which is recorded on the record and in the report

## Using Supabase instead of files

1. Create a separate Supabase project for the registry and run `store/migrations/001_registry.sql`.
2. Set `REGISTRY_SUPABASE_URL` and `REGISTRY_SUPABASE_SERVICE_KEY` (server only, never in the browser).
3. `node registry/cli.js ingest --source all --store supabase`

This path is covered by mocked tests only; check it against a real project before relying on it.

## Deploying a generated site

`registry:build --for-deploy` assembles a standalone project into the platform's
`output/<name>` folder (its `package.json` lists its own deps). From there the
**existing** endpoints push and deploy it, so Phase 5 reuses the current pipeline:

- POST /api/push   { projectName }       (needs GITHUB_TOKEN)
- POST /api/deploy { repoName, owner }   (needs VERCEL_TOKEN)

The local `vite build` verification runs under `sparc-ui/.generated` so it reuses
sparc-ui's installed dependencies; a deployed copy installs its own on the host.
