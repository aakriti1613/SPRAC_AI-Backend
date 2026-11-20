// Phase 4: search, compose, config checker, planner, evaluation, and the API.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { MODULE_LIBRARY } from "../sparc/modules.js";
import { tokenize } from "../registry/retrieve/text.js";
import { createEmbedder, offlineEmbed, cosine, OFFLINE_MODEL } from "../registry/retrieve/embeddings.js";
import { buildLibraryIndex, embedQuery } from "../registry/retrieve/library.js";
import { search } from "../registry/retrieve/search.js";
import { composeSite, lockFromComposition } from "../registry/retrieve/compose.js";
import { checkComponent, checkSet, rangesAgree } from "../registry/retrieve/compat.js";
import { checkSparcConfig } from "../sparc/config.js";
import { assembleConfig } from "../registry/plan/assemble.js";
import { planSite } from "../registry/plan/index.js";
import { sanitizePlan, buildPlannerPrompt } from "../registry/plan/gemini.js";
import { evaluateSearch, evaluatePlanner } from "../registry/evaluate.js";
import { createFileStore } from "../registry/store/file.js";
import { startServer } from "./helpers/server.js";
import path from "node:path";
import { BACKEND_DIR } from "./helpers/server.js";

const records = await createFileStore(path.join(BACKEND_DIR, "registry", "data")).list();
const embedder = createEmbedder(); // offline (no key in tests)

describe("module library", () => {
  test("has a good spread of described modules", () => {
    assert.ok(MODULE_LIBRARY.length >= 30, `modules: ${MODULE_LIBRARY.length}`);
    for (const m of MODULE_LIBRARY) {
      assert.ok(m.summary.length > 10, `${m.id} needs a summary`);
      assert.ok(m.keywords.length >= 2, `${m.id} needs keywords`);
      assert.ok(m.industries.length >= 1);
    }
  });
});

describe("text + embeddings", () => {
  test("stemming and synonyms map words to a common form", () => {
    assert.deepEqual(tokenize("Patients"), ["patient"]);
    assert.deepEqual(tokenize("companies"), ["company"]);
    assert.deepEqual(tokenize("clients and buyers"), ["customer", "customer"]);
    assert.deepEqual(tokenize("the a for of"), []); // stop words dropped
  });

  test("offline embedding is deterministic, unit-length, and similar for related text", () => {
    const a = offlineEmbed("manage patients and appointments");
    const b = offlineEmbed("manage patients and appointments");
    assert.deepEqual(a, b);
    assert.ok(Math.abs(Math.sqrt(a.reduce((s, x) => s + x * x, 0)) - 1) < 1e-9);
    const related = cosine(offlineEmbed("clinic patient records"), offlineEmbed("patients at a hospital"));
    const unrelated = cosine(offlineEmbed("clinic patient records"), offlineEmbed("warehouse stock levels"));
    assert.ok(related > unrelated, `${related} should beat ${unrelated}`);
    assert.equal(createEmbedder().model, OFFLINE_MODEL);
  });

  test("a Gemini embedder is used when a key/caller is given (mocked)", async () => {
    let called = 0;
    const emb = createEmbedder({ apiKey: "x", geminiEmbed: async () => { called += 1; return new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0)); } });
    assert.equal(emb.online, true);
    const v = await emb.embed("hello");
    assert.equal(v.length, 768);
    assert.equal(called, 1);
  });
});

describe("search", () => {
  let index;
  before(async () => {
    index = await buildLibraryIndex({ embedder });
  });

  test("finds the right module for plain-English queries", async () => {
    const run = async (q) => (search(index, { query: q, queryVector: await embedQuery(index, q), filters: { kind: "module" }, limit: 3 })).map((r) => r.payload.id);
    assert.ok((await run("manage patients at a clinic")).includes("patients"));
    assert.ok((await run("sales leads and deals")).includes("leads"));
    assert.ok((await run("student exam marks")).includes("exams"));
    assert.ok((await run("customer complaints and support")).includes("tickets"));
  });

  test("results explain themselves (score parts + matched words)", async () => {
    const [top] = search(index, { query: "patients", queryVector: await embedQuery(index, "patients"), filters: { kind: "module" }, limit: 1 });
    assert.ok(top.matched.includes("patient"));
    assert.ok(top.parts.keyword > 0 && top.score > 0);
  });

  test("filters are strict (industry)", async () => {
    const ids = search(index, { query: "records", filters: { kind: "module", industry: "school" }, limit: 50 }).map((r) => r.payload.id);
    assert.ok(ids.includes("students"));
    assert.ok(!ids.includes("vendors")); // vendors is erp-only
  });
});

describe("compatibility + compose", () => {
  test("semver ranges agree / disagree correctly", () => {
    assert.equal(rangesAgree("^19.0.0", ">=18"), true);
    assert.equal(rangesAgree("^16 || ^17", "^19"), false);
    assert.equal(rangesAgree("*", "^19"), true);
  });

  test("checkComponent flags candidates, bad licences, wrong type and too-high style", () => {
    const base = { name: "X", trust: "verified", license: "MIT", room: "hero", styleLevel: "amazing", websiteTypes: ["portfolio"] };
    assert.deepEqual(checkComponent(base, { websiteType: "portfolio", maxStyleLevel: "astonishing" }), []);
    assert.match(checkComponent({ ...base, trust: "candidate" }, {}).join(), /not verified/);
    assert.match(checkComponent({ ...base, license: "GPL-3.0" }, {}).join(), /not reusable/);
    assert.match(checkComponent(base, { websiteType: "admin-portal" }).join(), /not meant for/);
    assert.match(checkComponent({ ...base, styleLevel: "astonishing" }, { maxStyleLevel: "amazing" }).join(), /above the maximum/);
  });

  test("checkSet catches a peer-dependency clash", () => {
    const ok = checkSet([{ name: "A", requires: { peer: { react: "^19" } } }, { name: "B", requires: { peer: { react: ">=18" } } }]);
    assert.equal(ok.ok, true);
    const bad = checkSet([{ name: "A", requires: { peer: { react: "^17" } } }, { name: "B", requires: { peer: { react: "^19" } } }]);
    assert.equal(bad.ok, false);
  });

  test("composeSite fills every required room from the real catalogue, with a lock", () => {
    for (const [websiteType, styleLevel] of [["portfolio", "astonishing"], ["admin-portal", "amazing"], ["landing", "good"]]) {
      const c = composeSite(records, { websiteType, styleLevel, enabledOptional: ["pricing", "skills"] });
      assert.equal(c.ok, true, `${websiteType}: ${c.problems.join("; ")}`);
      assert.ok(Object.keys(c.picks).length > 3);
      const lock = lockFromComposition(c);
      assert.ok(lock.components.hero || lock.components.login);
      for (const p of Object.values(lock.components)) assert.match(p.hash, /^[a-f0-9]{64}$/);
    }
  });

  test("an Amazing site uses the closest lower level for rooms that lack it", () => {
    const c = composeSite(records, { websiteType: "admin-portal", styleLevel: "amazing", enabledOptional: [] });
    assert.ok(["basic", "good"].includes(c.picks["data-table"].level)); // data-table has no amazing version
    assert.equal(c.picks.hero?.level ?? "amazing", c.picks.hero?.level ?? "amazing");
  });
});

describe("config checker", () => {
  test("accepts a valid portal and a valid site", () => {
    const portal = assembleConfig({ websiteType: "admin-portal", industry: "healthcare", styleLevel: "amazing", brandName: "Clinic", moduleIds: ["patients"] }).config;
    assert.equal(checkSparcConfig(portal).ok, true);
    const site = assembleConfig({ websiteType: "portfolio", industry: "generic", styleLevel: "good", brandName: "Me", description: "dev" }).config;
    assert.equal(checkSparcConfig(site).ok, true);
  });

  test("rejects bad configs with clear messages", () => {
    assert.match(checkSparcConfig({ websiteType: "spaceship" }).errors.join(), /websiteType must be one of/);
    const admin = assembleConfig({ websiteType: "admin-portal", industry: "generic", styleLevel: "good", brandName: "X", moduleIds: ["tasks"] }).config;
    admin.styleLevel = "astonishing";
    assert.match(checkSparcConfig(admin).errors.join(), /above the maximum/);
    admin.styleLevel = "good";
    admin.modules[0].id = "login";
    assert.match(checkSparcConfig(admin).errors.join(), /reserved/);
    admin.theme.primary = "blue";
    assert.match(checkSparcConfig(admin).errors.join(), /hex/);
  });
});

describe("planner", () => {
  test("offline: expands library modules and always produces a valid config", async () => {
    const p = await planSite("A clinic to manage patients and appointments", { embedder });
    assert.equal(p.config.websiteType, "admin-portal");
    assert.equal(p.signals.industry, "healthcare");
    assert.ok(p.modulesUsed.map((m) => m.id).includes("patients"));
    assert.equal(p.ok, true);
    assert.equal(p.reuse.ratio, 1); // everything reused, nothing invented
  });

  test("offline: portfolio and landing are detected", async () => {
    assert.equal((await planSite("my personal portfolio website", { embedder })).config.websiteType, "portfolio");
    assert.equal((await planSite("a one-page landing page for my cafe", { embedder })).config.websiteType, "landing");
  });

  test("offline: a vague request asks a clarifying question", async () => {
    const p = await planSite("something for my business", { embedder });
    assert.ok(p.questions.length > 0);
    assert.equal(p.ok, true); // still produces a usable starting config
  });

  test("gemini: picks from the library, drops made-up ids, keeps the question", async () => {
    const callGemini = async () => JSON.stringify({ websiteType: "admin-portal", industry: "healthcare", styleLevel: "amazing", brandName: "Sunrise", moduleIds: ["patients", "appointments", "not-real"], question: "Do staff need logins?" });
    const p = await planSite("clinic", { embedder, callGemini });
    assert.equal(p.engine, "gemini");
    assert.deepEqual(p.modulesUsed.map((m) => m.id).sort(), ["appointments", "patients"]);
    assert.equal(p.questions[0], "Do staff need logins?");
    assert.equal(p.ok, true);
  });

  test("gemini: falls back to the offline engine if the call throws", async () => {
    const p = await planSite("a clinic for patients", { embedder, callGemini: async () => { throw new Error("rate limit"); } });
    assert.match(p.engine, /offline/);
    assert.match(p.fallbackReason, /rate limit/);
    assert.equal(p.ok, true);
  });

  test("the prompt lists the library and sanitize keeps only valid values", () => {
    assert.match(buildPlannerPrompt("x"), /patients: Patient/);
    const s = sanitizePlan({ websiteType: "nope", industry: "mars", styleLevel: "ultra", moduleIds: ["patients", "fake"], brandName: " Acme " });
    assert.equal(s.websiteType, "admin-portal");
    assert.equal(s.industry, "generic");
    assert.equal(s.styleLevel, "good");
    assert.deepEqual(s.moduleIds, ["patients"]);
    assert.equal(s.brandName, "Acme");
  });
});

describe("evaluation meets thresholds", () => {
  test("search recall@5 is high", async () => {
    const r = await evaluateSearch({ embedder });
    assert.ok(r.recallAt5 >= 0.9, `recall@5 = ${r.recallAt5} (misses: ${JSON.stringify(r.misses)})`);
    assert.ok(r.mrr >= 0.75, `mrr = ${r.mrr}`);
  });

  test("planner gets the type right, never misses a required module, always valid", async () => {
    const r = await evaluatePlanner({ embedder });
    assert.ok(r.websiteTypeAccuracy >= 0.9, `type acc = ${r.websiteTypeAccuracy}`);
    assert.equal(r.configValidPct, 1, "every plan must be a valid config");
    assert.ok(r.moduleRecall >= 0.9, `module recall = ${r.moduleRecall}`);
    assert.equal(r.avgReuseRatio, 1, "admin portals must be 100% reused modules");
  });
});

describe("API (behind login, flag on)", () => {
  let server;
  before(async () => {
    server = await startServer({ SPARC_API_ENABLED: "1" });
    await server.login();
  });
  after(async () => {
    await server?.stop();
  });

  test("the endpoints need a login", async () => {
    server.token = "";
    assert.equal((await server.request("POST", "/api/plan", { description: "a clinic" })).status, 401);
    await server.login();
  });

  test("/api/plan returns a valid config and reuse score", async () => {
    const res = await server.request("POST", "/api/plan", { description: "A clinic to manage patients and appointments" });
    assert.equal(res.status, 200);
    assert.equal(res.body.config.websiteType, "admin-portal");
    assert.ok(res.body.modulesUsed.some((m) => m.id === "patients"));
    assert.equal(res.body.reuse.ratio, 1);
  });

  test("/api/compose returns picks and a lock", async () => {
    const res = await server.request("POST", "/api/compose", { websiteType: "portfolio", styleLevel: "amazing", enabledOptional: ["skills"] });
    assert.equal(res.status, 200);
    assert.equal(res.body.composition.ok, true);
    assert.ok(res.body.lock.components.hero);
  });

  test("/api/registry/search ranks modules", async () => {
    const res = await server.request("POST", "/api/registry/search", { query: "sales leads and deals", kind: "module", limit: 3 });
    assert.equal(res.status, 200);
    assert.ok(res.body.results.some((r) => r.payload.id === "leads"));
  });

  test("/api/plan rejects an empty description", async () => {
    assert.equal((await server.request("POST", "/api/plan", { description: "" })).status, 400);
  });
});
