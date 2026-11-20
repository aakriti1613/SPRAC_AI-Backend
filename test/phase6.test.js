// Phase 6: the builder screen. Its logic (platform-main/src/builder) is plain JS, so it
// is tested here against the REAL backend: plan -> edit -> rebuild -> compose -> build.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startServer, BACKEND_DIR } from "./helpers/server.js";

const BUILDER = path.resolve(BACKEND_DIR, "..", "platform-main", "src", "builder");
const present = fs.existsSync(path.join(BUILDER, "builderState.js"));
const skip = !present && "platform-main not next to the backend";

const state = present ? await import(new URL(`file://${path.join(BUILDER, "builderState.js").replace(/\\/g, "/")}`)) : null;
const clientMod = present ? await import(new URL(`file://${path.join(BUILDER, "builderClient.js").replace(/\\/g, "/")}`)) : null;

describe("builder state (pure functions)", { skip }, () => {
  const options = {
    websiteTypes: [
      { id: "admin-portal", styleLevels: ["basic", "good", "amazing"] },
      { id: "portfolio", styleLevels: ["basic", "good", "amazing", "astonishing"] },
    ],
    modules: [
      { id: "patients", industries: ["healthcare"], pluralName: "Patients" },
      { id: "tasks", industries: ["generic", "crm"], pluralName: "Tasks" },
      { id: "leads", industries: ["crm"], pluralName: "Leads" },
    ],
  };
  const signals = { websiteType: "admin-portal", industry: "healthcare", styleLevel: "amazing", brandName: "Sunrise", moduleIds: ["patients"], enabledOptional: [], disabledOptional: [] };

  test("slugify makes safe project names", () => {
    assert.equal(state.slugify("Sunrise Clinic!"), "sunrise-clinic");
    assert.equal(state.slugify("  --A  B-- "), "a-b");
    assert.equal(state.slugify(""), "my-site");
    assert.ok(state.slugify("x".repeat(100)).length <= 40);
  });

  test("a style is kept inside what the website type allows (portals stop at Amazing)", () => {
    assert.equal(state.clampStyle(options, "admin-portal", "astonishing"), "amazing");
    assert.equal(state.clampStyle(options, "portfolio", "astonishing"), "astonishing");
    assert.equal(state.setStyle(options, signals, "astonishing").styleLevel, "amazing");
  });

  test("switching website type resets modules sensibly and clamps the style", () => {
    const toSite = state.setWebsiteType(options, { ...signals, styleLevel: "amazing" }, "portfolio");
    assert.deepEqual(toSite.moduleIds, []);
    const back = state.setWebsiteType(options, toSite, "admin-portal");
    assert.ok(back.moduleIds.length >= 1, "a portal always gets starter modules");
    assert.equal(state.setWebsiteType(options, signals, "admin-portal"), signals); // no change -> same object
    const astonishingSite = { ...toSite, styleLevel: "astonishing" };
    assert.equal(state.setWebsiteType(options, astonishingSite, "admin-portal").styleLevel, "amazing");
  });

  test("toggling an optional room works both ways, including rooms that are on by default", () => {
    const config = { rooms: { enabled: ["dashboard-chart"] } };
    const off = state.toggleRoom(signals, config, "dashboard-chart");
    assert.deepEqual(off.disabledOptional, ["dashboard-chart"]);
    const on = state.toggleRoom(signals, config, "settings");
    assert.deepEqual(on.enabledOptional, ["settings"]);
    const backOn = state.toggleRoom(off, { rooms: { enabled: [] } }, "dashboard-chart");
    assert.deepEqual(backOn.disabledOptional, []);
    assert.deepEqual(backOn.enabledOptional, ["dashboard-chart"]);
  });

  test("modules can be added once and removed; addable list puts the industry first", () => {
    const more = state.addModule(signals, "tasks");
    assert.deepEqual(more.moduleIds, ["patients", "tasks"]);
    assert.equal(state.addModule(more, "tasks"), more);
    assert.deepEqual(state.removeModule(more, "patients").moduleIds, ["tasks"]);
    const crm = state.addableModules(options, { ...signals, industry: "crm" }).map((m) => m.id);
    assert.deepEqual(crm.slice(0, 2).sort(), ["leads", "tasks"]);
  });

  test("the reducer walks describe -> plan -> result and drops stale build output on edits", () => {
    let s = state.initialState;
    s = state.reduce(s, { type: "description", value: "a clinic for patients" });
    s = state.reduce(s, { type: "planned", plan: { engine: "offline-rules", questions: ["Name?"], reuse: { note: "x" }, signals, config: { websiteType: "admin-portal" }, errors: [] } });
    assert.equal(s.step, "plan");
    assert.equal(s.projectName, "sunrise");
    assert.equal(s.plan.questions[0], "Name?");
    s = state.reduce(s, { type: "built", result: { name: "sunrise" } });
    assert.equal(s.step, "result");
    s = state.reduce(s, { type: "edited", signals: { ...signals, brandName: "Other" } });
    assert.equal(s.buildResult, null);
    assert.equal(state.reduce(s, { type: "restart" }).step, "describe");
  });

  test("canBuild needs a valid config and no work in progress", () => {
    assert.equal(state.canBuild({ config: { a: 1 }, errors: [], busy: null }), true);
    assert.equal(state.canBuild({ config: { a: 1 }, errors: ["bad"], busy: null }), false);
    assert.equal(state.canBuild({ config: { a: 1 }, errors: [], busy: "rebuilding" }), false);
    assert.equal(state.canBuild({ config: null, errors: [], busy: null }), false);
  });
});

describe("builder client (fake server)", { skip }, () => {
  const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

  test("a switched-off builder (404) explains how to turn it on", async () => {
    const client = clientMod.createBuilderClient(reply(404, {}));
    await assert.rejects(() => client.plan({ description: "x" }), /SPARC_API_ENABLED=1/);
  });

  test("a failed build lists the first problems", async () => {
    const client = clientMod.createBuilderClient(reply(200, { success: false, errors: ["check failed: a", "check failed: b"] }));
    await assert.rejects(() => client.build({ config: {}, name: "x" }), /check failed: a; check failed: b/);
  });

  test("an invalid edit comes back as errors and skips the component lookup", async () => {
    let composeCalls = 0;
    const client = {
      rebuild: async () => ({ config: { websiteType: "admin-portal" }, errors: ["modules: duplicate id"] }),
      compose: async () => {
        composeCalls += 1;
      },
    };
    const r = await clientMod.refreshFromSignals(client, {});
    assert.deepEqual(r.errors, ["modules: duplicate id"]);
    assert.equal(r.composition, null);
    assert.equal(composeCalls, 0);
  });
});

describe("the whole builder journey against the real backend", { skip }, () => {
  let server;
  let client;
  let options;
  before(async () => {
    server = await startServer({ SPARC_API_ENABLED: "1" });
    await server.login();
    const fetchApi = (p, init = {}) => fetch(server.baseUrl + p, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${server.token}` } });
    client = clientMod.createBuilderClient(fetchApi);
    options = await client.options();
  });
  after(async () => {
    await server?.stop();
  });

  test("options describe the website types, styles and modules from the SPARC data", () => {
    assert.deepEqual(options.websiteTypes.map((w) => w.id).sort(), ["admin-portal", "booking", "ecommerce", "landing", "portfolio"]);
    const portal = options.websiteTypes.find((w) => w.id === "admin-portal");
    assert.equal(portal.maxStyleLevel, "amazing");
    assert.ok(!portal.styleLevels.includes("astonishing"));
    assert.ok(portal.optionalRooms.some((r) => r.id === "dashboard-chart" && r.defaultOn));
    assert.equal(options.styleLevels.length, 4);
    assert.ok(options.modules.length >= 30);
  });

  test("describe -> plan -> edit -> rebuild -> components -> build -> ready to deploy", async () => {
    // 1. plan
    const plan = await client.plan({ description: "A clinic website to manage patients and appointments" });
    assert.equal(plan.config.websiteType, "admin-portal");
    let s = state.reduce(state.initialState, { type: "planned", plan });
    s = { ...s, signals: { ...s.signals, brandName: "Sunrise Clinic" } };

    // 2. the user switches off the chart, turns on settings, drops one module, picks Basic
    s.signals = state.toggleRoom(s.signals, plan.config, "dashboard-chart");
    s.signals = state.toggleRoom(s.signals, plan.config, "settings");
    const dropped = plan.config.modules.find((m) => m.id !== "patients").id;
    s.signals = state.removeModule(s.signals, dropped);
    s.signals = state.setStyle(options, s.signals, "basic");

    // 3. the server rebuilds the config from those choices and picks components
    const refreshed = await clientMod.refreshFromSignals(client, s.signals);
    assert.deepEqual(refreshed.errors, []);
    const cfg = refreshed.config;
    assert.equal(cfg.brand.name, "Sunrise Clinic");
    assert.equal(cfg.styleLevel, "basic");
    assert.ok(!cfg.rooms.enabled.includes("dashboard-chart"), "the user's 'off' must stick");
    assert.ok(cfg.rooms.enabled.includes("settings"));
    assert.ok(!cfg.modules.some((m) => m.id === dropped));
    const picked = state.pickedRooms(refreshed.composition);
    assert.ok(picked.length > 8);
    assert.ok(picked.every((p) => p.level === "basic"), "every component follows the chosen style");
    assert.ok(picked.some((p) => p.room === "settings"));
    assert.ok(!picked.some((p) => p.room === "dashboard-chart"));

    // 4. build -> a standalone project in the server's output folder
    const built = await client.build({ config: cfg, name: "journey-clinic" });
    assert.equal(built.forDeploy, true);
    assert.ok(built.verify.checklist.ok);
    assert.equal(built.lock.reuse.newCode, 0);
    const dir = path.join(server.outputDir, "journey-clinic");
    assert.ok(fs.existsSync(path.join(dir, "package.json")));
    assert.ok(fs.existsSync(path.join(dir, "sparc.lock.json")));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "src", "sparc.config.json"), "utf8")).brand.name, "Sunrise Clinic");

    // 5. the existing push endpoint finds that folder (it stops at the missing GitHub token, as designed)
    await assert.rejects(() => client.push({ projectName: "journey-clinic" }), /GITHUB_TOKEN/);
  });

  test("changing the website type from the plan screen gives a valid, different site", async () => {
    const plan = await client.plan({ description: "A clinic website to manage patients" });
    const signals = state.setWebsiteType(options, { ...plan.signals, disabledOptional: [] }, "portfolio");
    const r = await clientMod.refreshFromSignals(client, signals);
    assert.deepEqual(r.errors, []);
    assert.equal(r.config.websiteType, "portfolio");
    assert.ok(r.config.sections.hero);
    assert.ok(state.pickedRooms(r.composition).some((p) => p.room === "hero"));
  });

  test("a portal with no modules is reported as a problem, not a crash", async () => {
    const plan = await client.plan({ description: "manage patients" });
    const r = await clientMod.refreshFromSignals(client, { ...plan.signals, moduleIds: [] });
    assert.ok(r.errors.length > 0);
    assert.equal(r.composition, null);
  });

  test("the style the user picked on the first screen is honoured by the plan", async () => {
    const plan = await client.plan({ description: "my personal portfolio", styleLevel: "astonishing" });
    assert.equal(plan.config.styleLevel, "astonishing");
    const portal = await client.plan({ description: "manage patients in my clinic", styleLevel: "astonishing" });
    assert.equal(portal.config.styleLevel, "amazing", "portals are capped at Amazing");
  });

  test("API guard rails: bad signals and forDeploy without a name", async () => {
    const bad = await fetch(`${server.baseUrl}/api/sparc/config`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${server.token}` }, body: "{}" });
    assert.equal(bad.status, 400);
    await assert.rejects(() => client.build({ config: {}, name: "Bad Name" }), /lowercase slug/);
  });
});
