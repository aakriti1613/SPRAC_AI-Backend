// Golden regression test for the existing "templates only" flow.
//
// It runs the real server and records exactly what it produces for every
// fixture: the generated portal-config.json / content.json, supabase/schema.sql,
// the normalized portal config, and the API responses. Any change in output
// fails the test.
//
//   npm test                    -> compare against test/golden/*.json
//   UPDATE_GOLDEN=1 npm test    -> re-record (only when a change is intended!)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startServer, stable, readIfExists, BACKEND_DIR } from "./helpers/server.js";

const FIXTURES = path.join(BACKEND_DIR, "test", "fixtures");
const GOLDEN = path.join(BACKEND_DIR, "test", "golden");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

const PORTAL_TEMPLATES = ["portal-admin", "crud-modern-new-temp"];
const LANDING_TEMPLATES = ["landing-modern", "landing-temp-2"];

const loadFixtures = (dir) =>
  fs
    .readdirSync(path.join(FIXTURES, dir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ""), data: JSON.parse(fs.readFileSync(path.join(FIXTURES, dir, f), "utf8")) }));

let server;
before(async () => {
  server = await startServer();
  await server.login();
});
after(async () => {
  await server?.stop();
});

function checkGolden(name, actual) {
  const file = path.join(GOLDEN, `${name}.json`);
  const value = stable(actual, [server.outputDir, server.portalsDir]);
  if (UPDATE || !fs.existsSync(file)) {
    fs.mkdirSync(GOLDEN, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    if (!UPDATE) assert.fail(`golden file was missing and has been created: ${name}.json (re-run to verify)`);
    return;
  }
  const expected = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepStrictEqual(value, expected, `output changed for ${name}`);
}

async function generate(templateId, projectName, config) {
  const res = await server.request("POST", "/api/generate", { templateId, projectName, config });
  const dir = path.join(server.outputDir, projectName);
  const files = {
    "src/portal-config.json": readIfExists(path.join(dir, "src", "portal-config.json")),
    "src/content.json": readIfExists(path.join(dir, "src", "content.json")),
    "supabase/schema.sql": readIfExists(path.join(dir, "supabase", "schema.sql")),
    "supabase/seed.sql": readIfExists(path.join(dir, "supabase", "seed.sql")),
  };
  for (const key of Object.keys(files)) {
    if (files[key] === null) delete files[key];
    else if (key.endsWith(".json")) files[key] = JSON.parse(files[key]);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: res.status, body: res.body, files };
}

test("demo portal seeded on startup is unchanged", () => {
  const dir = path.join(server.portalsDir, "demo-admin");
  const config = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
  const data = {};
  for (const f of fs.readdirSync(path.join(dir, "data")).sort()) {
    data[f] = JSON.parse(fs.readFileSync(path.join(dir, "data", f), "utf8"));
  }
  checkGolden("demo-portal", { config, data });
});

for (const fixture of loadFixtures("portal")) {
  for (const templateId of PORTAL_TEMPLATES) {
    test(`generate ${templateId} <- ${fixture.name}`, async () => {
      const result = await generate(templateId, `t-${fixture.name}-${templateId}`, fixture.data);
      checkGolden(`generate__${templateId}__${fixture.name}`, result);
    });
  }

  test(`portal create (preview store) <- ${fixture.name}`, async () => {
    const res = await server.request("POST", "/api/portal/create", fixture.data);
    const slug = res.body?.slug;
    const stored = slug ? JSON.parse(fs.readFileSync(path.join(server.portalsDir, slug, "config.json"), "utf8")) : null;
    if (slug) fs.rmSync(path.join(server.portalsDir, slug), { recursive: true, force: true });
    checkGolden(`portal-create__${fixture.name}`, { status: res.status, body: res.body, stored });
  });
}

for (const fixture of loadFixtures("landing")) {
  for (const templateId of LANDING_TEMPLATES) {
    test(`generate ${templateId} <- ${fixture.name}`, async () => {
      const result = await generate(templateId, `t-${fixture.name}-${templateId}`, fixture.data);
      checkGolden(`generate__${templateId}__${fixture.name}`, result);
    });
  }
  test(`validate-config <- ${fixture.name}`, async () => {
    const res = await server.request("POST", "/api/validate-config", { config: fixture.data });
    checkGolden(`validate__${fixture.name}`, res);
  });
}

test("template aliases resolve the same way", async () => {
  const config = loadFixtures("portal").find((f) => f.name === "preset-crm").data;
  const results = {};
  for (const alias of ["temp1", "Template 1", "topbar temp", "topbar_temp"]) {
    const r = await generate(alias, `t-alias-${alias.replace(/\W+/g, "-")}`, config);
    results[alias] = { status: r.status, templateId: r.body.templateId };
  }
  checkGolden("aliases", results);
});

test("bad input is rejected the same way", async () => {
  const cases = {
    missingFields: await server.request("POST", "/api/generate", {}),
    badProjectName: await server.request("POST", "/api/generate", { templateId: "portal-admin", projectName: "bad name!" }),
    unknownTemplate: await server.request("POST", "/api/generate", { templateId: "nope", projectName: "ok-name" }),
    validateNoConfig: await server.request("POST", "/api/validate-config", { config: [] }),
  };
  checkGolden("bad-input", cases);
});

test("schema endpoint is unchanged", async () => {
  checkGolden("schema", await server.request("GET", "/api/schema", undefined, { auth: false }));
});
