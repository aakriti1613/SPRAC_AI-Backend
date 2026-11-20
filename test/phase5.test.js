// Phase 5: assemble a self-contained project, verify it (config checklist + a
// real Vite build), the reuse lock, deploy-ready copy, and the /api/build route.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assembleConfig } from "../registry/plan/assemble.js";
import { assembleProject } from "../registry/assemble/project.js";
import { configChecklist, buildProject } from "../registry/assemble/verify.js";
import { buildSite } from "../registry/assemble/build.js";
import { createFileStore } from "../registry/store/file.js";
import { startServer, BACKEND_DIR } from "./helpers/server.js";

const records = await createFileStore(path.join(BACKEND_DIR, "registry", "data")).list();
const store = { list: async () => records };
const made = [];
const tmpOut = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "sparc-assemble-"));
  made.push(d);
  return d;
};
after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const portalConfig = (over = {}) => assembleConfig({ websiteType: "admin-portal", industry: "healthcare", styleLevel: "amazing", brandName: "Sunrise Clinic", moduleIds: ["patients", "appointments"], ...over }).config;
const siteConfig = () => assembleConfig({ websiteType: "portfolio", industry: "generic", styleLevel: "good", brandName: "Aditi Verma", description: "developer" }).config;

describe("assembleProject", () => {
  test("writes a self-contained project (shared code copied in, config + lock)", () => {
    const out = tmpOut();
    const r = assembleProject(portalConfig(), { name: "clinic", records, outDir: out });
    assert.equal(r.ok, true, r.errors?.join("; "));
    const dir = r.dir;
    for (const f of ["index.html", "package.json", "vite.config.ts", "tsconfig.json", "sparc.lock.json", "src"]) {
      assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
    }
    // Shared code is copied in (not referenced outside the project).
    for (const d of ["core", "library", "contracts", "theme", "blueprints"]) {
      assert.ok(fs.existsSync(path.join(dir, "src", "_sparc", d)), `missing src/_sparc/${d}`);
    }
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, "src", "sparc.config.json"), "utf8"));
    assert.equal(cfg.brand.name, "Sunrise Clinic");
    // package.json declares its own runtime deps so it installs anywhere.
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    assert.ok(pkg.dependencies.react && pkg.dependencies.motion && pkg.dependencies["@supabase/supabase-js"]);
  });

  test("the lock records a version + hash for every room filled", () => {
    const out = tmpOut();
    const { lock } = assembleProject(portalConfig(), { name: "clinic2", records, outDir: out });
    assert.ok(Object.keys(lock.components).length >= 10);
    for (const p of Object.values(lock.components)) {
      assert.match(p.hash, /^[a-f0-9]{64}$/);
      assert.ok(p.slug && p.version);
    }
    assert.equal(lock.reuse.newCode, 0);
  });

  test("rejects an invalid config and a bad name", () => {
    assert.equal(assembleProject({ websiteType: "nope" }, { name: "x", records }).ok, false);
    assert.equal(assembleProject(portalConfig(), { name: "Bad Name", records }).ok, false);
  });
});

describe("config checklist", () => {
  test("passes for a well-formed portal and site", () => {
    const p = assembleProject(portalConfig(), { name: "c3", records, outDir: tmpOut() });
    assert.equal(configChecklist(portalConfig(), p.composition).ok, true);
    const s = assembleProject(siteConfig(), { name: "s3", records, outDir: tmpOut() });
    assert.equal(configChecklist(siteConfig(), s.composition).ok, true);
  });

  test("catches a select field with no options and a bad list column", () => {
    const bad = portalConfig();
    bad.modules[0].fields.push({ key: "x", label: "X", type: "select", required: false, options: [] });
    bad.modules[0].listColumns.push("ghost");
    const r = configChecklist(bad, null);
    assert.equal(r.ok, false);
    assert.ok(r.checks.some((c) => /has options/.test(c.name) && !c.pass));
    assert.ok(r.checks.some((c) => /list columns/.test(c.name) && !c.pass));
  });
});

describe("real build (one project, compiled with Vite)", () => {
  test("an assembled portal compiles and produces a dist bundle", { timeout: 200000 }, () => {
    // Build must run under sparc-ui/.generated to reuse its installed deps.
    const r = assembleProject(portalConfig(), { name: "buildtest-clinic", records });
    made.push(r.dir);
    const built = buildProject(r.dir);
    assert.equal(built.ok, true, built.error);
    assert.ok(built.bundleKb > 50, `bundle too small: ${built.bundleKb}`);
    assert.ok(fs.existsSync(path.join(r.dir, "dist", "index.html")));
  });
});

describe("buildSite (plan -> compose -> assemble -> verify, no Vite build)", () => {
  test("from a description: valid, reused modules, checklist passes", async () => {
    const r = await buildSite({ description: "A clinic to manage patients and appointments", name: "flow-clinic", styleLevel: "good", build: false, store, outDir: tmpOut() });
    assert.equal(r.ok, true, r.errors?.join("; "));
    assert.equal(r.config.websiteType, "admin-portal");
    assert.ok(r.plan.modulesUsed.some((m) => m.id === "patients"));
    assert.equal(r.verify.checklist.ok, true);
    assert.equal(r.verify.build.skipped, true);
  });

  test("from a ready config (no planner)", async () => {
    const r = await buildSite({ config: siteConfig(), name: "flow-site", build: false, store, outDir: tmpOut() });
    assert.equal(r.ok, true);
    assert.equal(r.plan, null);
    assert.ok(r.lock.components.hero);
  });
});

describe("/api/build (behind login)", () => {
  let server;
  before(async () => {
    server = await startServer({ SPARC_API_ENABLED: "1" });
    await server.login();
  });
  after(async () => {
    await server?.stop();
  });

  test("builds a project (no Vite build) and returns a lock + checklist", async () => {
    const res = await server.request("POST", "/api/build", { description: "manage products and orders for a shop", name: "api-shop" });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.config.websiteType, "admin-portal");
    assert.ok(res.body.verify.checklist.ok);
    assert.ok(Object.keys(res.body.lock.components).length > 5);
    // Clean the project it wrote under sparc-ui/.generated.
    if (res.body.dir) fs.rmSync(res.body.dir, { recursive: true, force: true });
  });

  test("rejects a bad name and a missing description", async () => {
    assert.equal((await server.request("POST", "/api/build", { description: "x", name: "Bad Name" })).status, 400);
    assert.equal((await server.request("POST", "/api/build", { name: "ok-name" })).status, 400);
  });

  test("needs a login", async () => {
    server.token = "";
    assert.equal((await server.request("POST", "/api/build", { description: "a clinic", name: "x" })).status, 401);
  });
});
