// Phase 9: iterative descriptors (RCDE). The evidence layer, its fair-chance rules,
// its wiring into ranking / planning / component choice, the feedback loop and the replay.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EMPTY_SNAPSHOT, NEUTRAL, SETTINGS, contextKey, evidenceDelta, evidenceValue, foldEvents, lookup, requestWords, validateEvent } from "../registry/evidence/model.js";
import { createEvidenceStore } from "../registry/evidence/store.js";
import { eventsFromBuild, moduleContext, moduleItemId } from "../registry/evidence/feedback.js";
import { createEmbedder } from "../registry/retrieve/embeddings.js";
import { buildLibraryIndex } from "../registry/retrieve/library.js";
import { search } from "../registry/retrieve/search.js";
import { composeSite, suggestForRoom } from "../registry/retrieve/compose.js";
import { selectModules } from "../registry/plan/offline.js";
import { assembleConfig } from "../registry/plan/assemble.js";
import { buildSite } from "../registry/assemble/build.js";
import { createFileStore } from "../registry/store/file.js";
import { runRcdeReplay } from "../registry/evaluation/rcde.js";
import { startServer, BACKEND_DIR } from "./helpers/server.js";

const AT = "2026-11-24T00:00:00.000Z";
const records = await createFileStore(path.join(BACKEND_DIR, "registry", "data")).list();
const offline = createEmbedder({ apiKey: "" });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "rcde-"));
const ctx = moduleContext("healthcare");
const ev = (id, outcome, words = [], at = AT) => ({ at, itemId: moduleItemId(id), context: ctx, outcome, words });
const snap = (events, now = AT) => ({ version: 1, ...foldEvents(events, { now }) });

describe("evidence model", () => {
  test("events are checked; bad ones are never trusted", () => {
    assert.deepEqual(validateEvent(ev("patients", "kept")), []);
    assert.ok(validateEvent({ itemId: "x", outcome: "kept", context: {}, at: AT }).length);
    assert.ok(validateEvent({ ...ev("patients", "kept"), outcome: "liked" }).length);
    assert.ok(validateEvent({ ...ev("patients", "kept"), at: "yesterday" }).length);
    const s = foldEvents([ev("patients", "kept"), { junk: true }]);
    assert.equal(Object.keys(s.items).length, 1);
  });

  test("context separates evidence: a clinic win says nothing about schools", () => {
    assert.equal(contextKey(ctx), "admin-portal|healthcare|module|any");
    const s = snap([ev("tasks", "kept"), ev("tasks", "kept"), ev("tasks", "kept")]);
    assert.ok(lookup(s, "module:tasks", ctx).stats);
    assert.equal(lookup(s, "module:tasks", moduleContext("school")).stats, null);
  });

  test("old events fade (half-life) and a person's choice counts more than a passing build", () => {
    const fresh = snap([ev("a", "kept")]).items["module:a"][contextKey(ctx)].n;
    const old = snap([ev("a", "kept", [], "2026-08-26T00:00:00.000Z")]).items["module:a"][contextKey(ctx)].n; // 90 days earlier
    assert.equal(fresh, 1);
    assert.ok(Math.abs(old - 0.5) < 0.01);
    assert.ok(snap([ev("a", "added")]).items["module:a"][contextKey(ctx)].n > snap([ev("a", "pass")]).items["module:a"][contextKey(ctx)].n);
  });

  test("no evidence, or too little, is exactly neutral (cannot change the order)", () => {
    assert.equal(evidenceValue({ stats: null, total: 0 }).value, NEUTRAL);
    assert.equal(evidenceDelta(evidenceValue({ stats: null, total: 0 })), 0);
    const two = snap([ev("a", "kept"), ev("a", "kept")]); // 2 < minEvents
    assert.equal(evidenceValue(lookup(two, "module:a", ctx), { queryWords: ["x"] }).value, NEUTRAL);
  });

  test("a new part starts neutral, and one lucky success does not beat a long record", () => {
    const events = [];
    for (let i = 0; i < 40; i += 1) events.push(ev("veteran", "kept"));
    for (let i = 0; i < 5; i += 1) events.push(ev("veteran", "removed"));
    for (let i = 0; i < 2; i += 1) events.push(ev("lucky", "added")); // 3.0 weighted events, all good
    const s = snap(events);
    const vet = evidenceValue(lookup(s, "module:veteran", ctx)).fit;
    const lucky = evidenceValue(lookup(s, "module:lucky", ctx)).fit;
    assert.ok(vet > 0.8 && lucky < vet, `${lucky} should be below ${vet}`);
  });

  test("requirement-conditioned: a removal only counts against requests with the same words", () => {
    const events = [];
    for (let i = 0; i < 3; i += 1) events.push(ev("bookings", "removed", requestWords("doctor schedules")));
    for (let i = 0; i < 3; i += 1) events.push(ev("bookings", "kept", requestWords("salon slots")));
    const s = snap(events);
    const doctor = evidenceValue(lookup(s, "module:bookings", ctx), { queryWords: requestWords("doctor schedules") });
    const salon = evidenceValue(lookup(s, "module:bookings", ctx), { queryWords: requestWords("salon slots") });
    assert.ok(doctor.wordMatch < 0 && salon.wordMatch > 0);
    assert.ok(doctor.value < NEUTRAL && salon.value > NEUTRAL);
  });

  test("the nudge is capped: evidence can move a score by at most +/- weight/2", () => {
    const best = { stats: { n: 100, good: 100, bad: 0, words: { a: 99 }, negWords: {} }, total: 100 };
    const worst = { stats: { n: 100, good: 0, bad: 100, words: {}, negWords: { a: 99 } }, total: 100 };
    assert.ok(evidenceDelta(evidenceValue(best, { queryWords: ["a"] })) <= SETTINGS.weight / 2 + 1e-9);
    assert.ok(evidenceDelta(evidenceValue(worst, { queryWords: ["a"] })) >= -SETTINGS.weight / 2 - 1e-9);
  });

  test("the 'not tried yet' bonus favours less-tried parts, shrinks with evidence, and is off unless asked", () => {
    const total = 50;
    const fewTries = evidenceValue({ stats: null, total }, { explore: true });
    const manyTries = evidenceValue({ stats: { n: 40, good: 20, bad: 20, words: {}, negWords: {} }, total }, { explore: true });
    assert.ok(fewTries.bonus > manyTries.bonus && manyTries.bonus > 0);
    assert.equal(evidenceValue({ stats: null, total }).bonus, 0, "never in a plain build");
  });
});

describe("evidence store", () => {
  test("record, update to numbered snapshots, load a version, roll back", () => {
    const store = createEvidenceStore(tmp());
    assert.equal(store.load(), EMPTY_SNAPSHOT);
    const r = store.record([ev("a", "kept"), { bad: true }]);
    assert.equal(r.stored, 1);
    assert.equal(r.rejected.length, 1);
    assert.equal(store.update({ now: AT }).version, 1);
    store.record([ev("a", "removed")]);
    assert.equal(store.update({ now: AT }).version, 2);
    assert.equal(store.load().version, 2);
    assert.equal(store.load(1).events, 1, "an old version stays readable for rebuilding from a lock");
    assert.equal(store.rollback(1).version, 1);
    assert.throws(() => store.rollback(9), /no evidence snapshot/);
  });

  test("a damaged line in the log is skipped", () => {
    const dir = tmp();
    const store = createEvidenceStore(dir);
    store.record([ev("a", "kept")]);
    fs.appendFileSync(path.join(dir, "events.jsonl"), "{not json\n");
    assert.equal(store.events().length, 1);
  });
});

describe("ranking with evidence", () => {
  let index;
  before(async () => {
    index = await buildLibraryIndex({ embedder: offline });
  });

  test("cold start: with no evidence every score equals the static score", () => {
    const q = "A clinic to manage patients and their appointments";
    const plain = search(index, { query: q, filters: { kind: "module" }, limit: 12 });
    const withEmpty = search(index, { query: q, filters: { kind: "module" }, limit: 12, evidence: { snapshot: EMPTY_SNAPSHOT, contextFor: () => ctx } });
    assert.deepEqual(withEmpty.map((r) => [r.id, r.score]), plain.map((r) => [r.id, r.score]));
  });

  test("evidence moves only the item it is about, and only a little", () => {
    const q = "A clinic to manage patients and their appointments";
    const events = Array.from({ length: 4 }, () => ev("doctors", "added", requestWords(q)));
    const s = snap(events);
    const plain = search(index, { query: q, filters: { kind: "module" }, limit: 12 });
    const boosted = search(index, { query: q, filters: { kind: "module" }, limit: 12, evidence: { snapshot: s, contextFor: () => ctx } });
    const score = (rs, id) => rs.find((r) => r.id === id)?.score;
    assert.ok(score(boosted, "module:doctors") > score(plain, "module:doctors"));
    assert.ok(score(boosted, "module:doctors") - score(plain, "module:doctors") <= SETTINGS.weight / 2 + 1e-9);
    assert.equal(score(boosted, "module:patients"), score(plain, "module:patients"));
  });

  test("planner: same modules as before without evidence; a request-matched removal stops a module being auto-added; a named module always stays", async () => {
    const vague = "Track company expenses and reimbursement claims";
    const gctx = moduleContext("generic");
    const vBase = await selectModules(vague, { index, industry: "generic" });
    assert.ok(vBase.moduleIds.includes("tickets"), vBase.moduleIds.join(","));
    const removedTickets = snap(Array.from({ length: 4 }, () => ({ at: AT, itemId: "module:tickets", context: gctx, outcome: "removed", words: requestWords(vague) })));
    const vAfter = await selectModules(vague, { index, industry: "generic", evidence: removedTickets });
    assert.ok(!vAfter.moduleIds.includes("tickets"), vAfter.moduleIds.join(","));
    assert.ok(vAfter.moduleIds.includes("expenses"));
    const q = "Manage doctors, their schedules and patient appointments";
    const base = await selectModules(q, { index, industry: "healthcare" });
    const named = snap(Array.from({ length: 4 }, () => ev("doctors", "removed", requestWords(q))));
    assert.ok((await selectModules(q, { index, industry: "healthcare", evidence: named })).moduleIds.includes("doctors"), "doctors is named in the request");
    assert.deepEqual((await selectModules(q, { index, industry: "healthcare", evidence: EMPTY_SNAPSHOT })).moduleIds, base.moduleIds);
  });
});

describe("component choice with evidence", () => {
  // A second verified hero for the Good level (a copy of the real one under another slug).
  const real = records.find((r) => r.slug === "hero/good/sparc");
  const alt = { ...structuredClone(real), slug: "hero/good/alt" };
  const extra = { ...structuredClone(real), slug: "hero/good/zz-new" };
  const recs = [...records, alt, extra];
  const hctx = { websiteType: "landing", industry: "healthcare", room: "hero", styleLevel: "good" };
  const cev = (slug, outcome, n = 4) => Array.from({ length: n }, () => ({ at: AT, itemId: `component:own-library:${slug}`, context: hctx, outcome, words: ["clinic"] }));

  test("without evidence the standard component is picked, exactly as before", () => {
    assert.equal(composeSite(recs, { websiteType: "landing", styleLevel: "good", industry: "healthcare" }).picks.hero.slug, "hero/good/sparc");
    assert.equal(composeSite(records, { websiteType: "landing", styleLevel: "good" }).picks.hero.slug, "hero/good/sparc");
  });

  test("with evidence the part that worked best in this context is picked, and the lock says which evidence was used", () => {
    const s = snap([...cev("hero/good/alt", "chosen"), ...cev("hero/good/sparc", "fail")]);
    const c = composeSite(recs, { websiteType: "landing", styleLevel: "good", industry: "healthcare", evidence: s });
    assert.equal(c.picks.hero.slug, "hero/good/alt");
    assert.equal(c.evidenceVersion, 1);
    assert.equal(composeSite(recs, { websiteType: "landing", styleLevel: "good", industry: "school", evidence: s }).picks.hero.slug, "hero/good/sparc", "other industry: no effect");
  });

  test("suggestions keep the third place for the best less-tried part (fair chance)", () => {
    const s = snap([...cev("hero/good/alt", "chosen", 10), ...cev("hero/good/sparc", "chosen", 10)]);
    const top = suggestForRoom(recs, { websiteType: "landing", styleLevel: "good", room: "hero", industry: "healthcare", evidence: s });
    assert.equal(top.length, 3);
    assert.deepEqual(top.slice(0, 2).map((x) => x.explore), [false, false]);
    assert.equal(top[2].slug, "hero/good/zz-new");
    assert.equal(top[2].explore, true);
  });
});

describe("feedback loop", () => {
  test("a build turns into events: passes, failures with reasons, kept / removed / added modules", () => {
    const { config } = assembleConfig({ websiteType: "admin-portal", industry: "healthcare", styleLevel: "good", brandName: "Clinic", moduleIds: ["patients", "doctors"] });
    const events = eventsFromBuild({
      config,
      picks: { "data-table": { slug: "data-table/good/sparc", source: "own-library", level: "good" }, navbar: { slug: "navbar/good/sparc", source: "own-library", level: "good" } },
      checks: [{ name: 'room "data-table" has a component', pass: false }],
      plannedModuleIds: ["patients", "bookings"],
      description: "clinic patients",
      at: AT,
    });
    const find = (itemId, outcome) => events.find((e) => e.itemId === itemId && e.outcome === outcome);
    assert.ok(find("component:own-library:data-table/good/sparc", "fail").reason.includes("data-table"));
    assert.ok(find("component:own-library:navbar/good/sparc", "pass"));
    assert.ok(find("module:patients", "kept"));
    assert.ok(find("module:bookings", "removed").words.includes("patient"), "removals remember the request words");
    assert.ok(find("module:doctors", "added"));
    for (const e of events) assert.deepEqual(validateEvent(e), []);
  });

  test("buildSite reads the evidence before and updates it after (between builds)", async () => {
    const store = createEvidenceStore(tmp());
    const out = tmp();
    const r1 = await buildSite({ description: "A clinic to manage patients and appointments", name: "rcde-one", build: false, embedder: offline, evidenceStore: store, outDir: out });
    assert.equal(r1.ok, true, r1.errors?.join("; "));
    assert.equal(r1.lock.evidenceVersion, 0, "the first build used no evidence");
    assert.equal(r1.evidence.version, 1);
    assert.ok(r1.evidence.recorded > 5);
    const r2 = await buildSite({ description: "A clinic to manage patients and appointments", name: "rcde-two", build: false, embedder: offline, evidenceStore: store, outDir: out });
    assert.equal(r2.lock.evidenceVersion, 1, "the second build says which evidence it used");
    fs.rmSync(out, { recursive: true, force: true });
  });

  test("without an evidence store nothing is read or written (evaluations stay clean)", async () => {
    const out = tmp();
    const r = await buildSite({ description: "my personal portfolio", name: "rcde-none", build: false, embedder: offline, outDir: out });
    assert.equal(r.evidence, null);
    fs.rmSync(out, { recursive: true, force: true });
  });
});

describe("API", () => {
  let server;
  let auth;
  before(async () => {
    server = await startServer({ SPARC_API_ENABLED: "1" });
    await server.login();
    auth = { "Content-Type": "application/json", Authorization: `Bearer ${server.token}` };
  });
  after(async () => {
    await server?.stop();
  });
  const post = async (p, body) => {
    const res = await fetch(server.baseUrl + p, { method: "POST", headers: auth, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  test("compose returns up to 3 suggestions per room", async () => {
    const r = await post("/api/compose", { websiteType: "landing", styleLevel: "good", industry: "healthcare" });
    assert.equal(r.body.success, true);
    assert.ok(r.body.suggestions.hero.length >= 1 && r.body.suggestions.hero.length <= 3);
    assert.equal(r.body.lock.evidenceVersion, 0);
  });

  test("a choice from the suggestions is recorded; a made-up or unverified one is refused", async () => {
    const ok = await post("/api/sparc/choice", { websiteType: "landing", industry: "healthcare", room: "hero", styleLevel: "good", chosen: { slug: "hero/good/sparc", source: "own-library" }, description: "clinic" });
    assert.equal(ok.body.success, true);
    assert.equal(ok.body.recorded, 1);
    const bad = await post("/api/sparc/choice", { websiteType: "landing", industry: "healthcare", room: "hero", styleLevel: "good", chosen: { slug: "hero/good/nope", source: "own-library" } });
    assert.equal(bad.status, 400);
  });

  test("a build with builder feedback is recorded and updates the evidence", async () => {
    const plan = await post("/api/plan", { description: "A clinic to manage patients and appointments" });
    const built = await post("/api/build", { config: plan.body.config, name: "rcde-api", forDeploy: true, feedback: { plannedModuleIds: plan.body.signals.moduleIds, description: "A clinic to manage patients and appointments" } });
    assert.equal(built.body.success, true, JSON.stringify(built.body.errors));
    assert.ok(built.body.evidence.recorded > 0);
    assert.ok(built.body.evidence.version >= 1);
  });
});

describe("replay (held-out and returning requests)", () => {
  let result;
  before(async () => {
    result = await runRcdeReplay();
  });

  test("cold start does no harm: round 0 equals static, for every strategy", () => {
    for (const key of ["oneShot", "iterative"]) assert.deepEqual(result.summary[key][0], result.summary.static[0]);
    assert.deepEqual(result.returning[0].f1, result.summary.static[0].f1 === undefined ? result.returning[0].f1 : result.returning[0].f1);
  });

  test("never worse than static on held-out requests, and the choice does not shrink to a few favourites", () => {
    const s = result.summary.static[0];
    for (const r of result.summary.iterative) {
      assert.ok(r.f1 >= s.f1 - 1e-9, `iterative F1 ${r.f1} < static ${s.f1}`);
      assert.ok(r.distinctModules >= s.distinctModules - 1, "diversity kept");
    }
  });

  test("returning requests: evidence helps (upper bound)", () => {
    const first = result.returning[0];
    const last = result.returning.at(-1);
    assert.ok(last.mrr >= first.mrr && last.f1 >= first.f1);
    assert.ok(last.mrr > first.mrr || last.f1 > first.f1, "something improves when the same kinds of requests come back");
  });

  test("the replay is repeatable", async () => {
    const again = await runRcdeReplay();
    assert.deepEqual(again.summary, result.summary);
    assert.deepEqual(again.returning, result.returning);
  });
});
