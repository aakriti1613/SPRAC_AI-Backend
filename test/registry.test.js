// Phase 3: component registry — analyzer, labeler, adapters, stores, pipeline, report.
// External sources use saved real responses (test/fixtures/registry), never the network.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkSource } from "../registry/analyze/rules.js";
import { createProgram, extractProps } from "../registry/analyze/typescript.js";
import { githubAdapter } from "../registry/adapters/github.js";
import { npmAdapter } from "../registry/adapters/npm.js";
import { ownLibraryAdapter } from "../registry/adapters/own.js";
import { ACETERNITY_REGISTRY, aceternityAdapter, MAGICUI_REGISTRY, magicUiAdapter, shadcnAdapter, SHADCN_REGISTRY, splitDep } from "../registry/adapters/shadcn.js";
import { storybookAdapter } from "../registry/adapters/storybook.js";
import { templatesAdapter } from "../registry/adapters/templates.js";
import { fixtureFetchJson } from "../registry/fetch.js";
import { buildLabel } from "../registry/label.js";
import { currentLabel, runIngest } from "../registry/pipeline.js";
import { renderLibraryStatus } from "../registry/report.js";
import { createFileStore } from "../registry/store/file.js";
import { createSupabaseStore } from "../registry/store/supabase.js";
import { checkCdl } from "../sparc/index.js";
import { BACKEND_DIR } from "./helpers/server.js";

const SPARC_UI = path.join(BACKEND_DIR, "sparc-ui");
const FIX = path.join(BACKEND_DIR, "test", "fixtures", "registry");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), "utf8"));
const tempStore = () => createFileStore(fs.mkdtempSync(path.join(os.tmpdir(), "registry-test-")));
const propsText = (props) => props.map((p) => `${p.name}:${p.kind}${p.required ? "!" : ""}`).join(" ");

describe("analyzer", () => {
  let program;
  const lib = (key) => path.join(SPARC_UI, "library", key, "index.tsx");
  before(() => {
    program = createProgram(SPARC_UI, [lib("navbar/basic/sparc"), lib("record-form/basic/sparc"), lib("form-field/basic/number-input")]);
  });

  test("reads props exactly as the component declares them", () => {
    assert.equal(propsText(extractProps(program, lib("navbar/basic/sparc")).props), "brand:object! cta:object links:array!");
    assert.equal(propsText(extractProps(program, lib("form-field/basic/number-input")).props), "disabled:boolean error:string field:object! onChange:function! value:unknown!");
  });

  test("a function returning ReactNode is a function, not a node", () => {
    const rf = extractProps(program, lib("record-form/basic/sparc")).props.find((p) => p.name === "renderField");
    assert.equal(rf.kind, "function");
  });

  test("static rules catch fixed colours, network calls, raw HTML and eval", () => {
    const issues = checkSource(
      "bad.tsx",
      `import axios from "axios";
       export default function X() {
         fetch("/api");
         eval("1");
         return <div className="p-2 bg-blue-500 dark:hover:text-rose-400/50 bg-[#123456]" style={{ color: "rgb(1,2,3)" }} dangerouslySetInnerHTML={{ __html: "x" }} />;
       }`
    );
    assert.deepEqual([...new Set(issues.map((i) => i.rule))].sort(), ["eval", "fixed-colour", "network", "raw-html"]);
    assert.equal(issues.filter((i) => i.rule === "fixed-colour").length, 4);
  });

  test("theme tokens and anchors are not mistaken for colours", () => {
    assert.deepEqual(checkSource("ok.tsx", `export default () => <a href="#add" className="bg-primary text-fg accent-[var(--sparc-primary)] border-danger/40">x</a>;`), []);
  });

  test("a reviewed exception is honoured and reported, not hidden", () => {
    const allowed = [];
    const issues = checkSource("c.tsx", `// sparc-allow fixed-colour: colour inputs need a hex value\nconst v = "#000000";`, { allowed });
    assert.deepEqual(issues, []);
    assert.equal(allowed[0].reason, "colour inputs need a hex value");
  });
});

describe("own library -> verified", () => {
  let items;
  before(async () => {
    items = await ownLibraryAdapter({ sparcUiDir: SPARC_UI }).collect();
  });

  test("every component in sparc-ui/library is verified, with real facts on its label", () => {
    assert.ok(items.length >= 166, `components: ${items.length}`);
    const results = items.map((i) => ({ slug: i.slug, ...buildLabel(i) }));
    const notVerified = results.filter((r) => r.trust !== "verified").map((r) => `${r.slug}: ${r.problems.join("; ")}`);
    assert.deepEqual(notVerified, []);
    const nav = results.find((r) => r.slug === "navbar/basic/sparc").label;
    assert.deepEqual(nav.websiteTypes, ["booking", "ecommerce", "landing", "portfolio"]);
    assert.ok(nav.requires.registry.includes("sparc-ui/core/link"));
    assert.ok(nav.quality.sizeKb > 0 && nav.quality.sizeKb <= 15);
    assert.equal(nav.quality.a11yViolations, 0);
    const currency = results.find((r) => r.slug === "form-field/basic/number-input").label;
    assert.deepEqual(currency.provides.fieldTypes, ["number", "currency", "percentage", "rating"]);
  });

  test("style levels use only the packages their level allows (read from real imports)", () => {
    const npmOf = (slug) => Object.keys(buildLabel(items.find((i) => i.slug === slug)).label.requires.npm);
    assert.ok(!npmOf("hero/good/sparc").includes("motion"));
    assert.ok(npmOf("hero/amazing/sparc").includes("motion"));
    assert.ok(npmOf("hero/astonishing/sparc").includes("motion"));
    const hero = buildLabel(items.find((i) => i.slug === "hero/astonishing/sparc")).label;
    assert.deepEqual(hero.websiteTypes, ["landing", "portfolio"]); // admin portals stop at Amazing
  });

  test("a promoted legacy component records where it came from", () => {
    const r = buildLabel(items.find((i) => i.slug === "dashboard-stat-card/amazing/gradient-tile"));
    assert.equal(r.trust, "verified");
    assert.ok(r.label.facets.tags.includes("derived-from:legacy:crud-modern-new-temp/widgets/stat-card@0.1.0"));
    assert.match(r.label.description, /sparkline was dropped/);
  });

  test("a component that breaks a rule is not verified", () => {
    const item = structuredClone(items.find((i) => i.slug === "hero/basic/sparc"));
    item.staticIssues = [{ rule: "network", message: "calls fetch()", file: "x.tsx", line: 3 }];
    const r = buildLabel(item);
    assert.equal(r.trust, "candidate");
    assert.match(r.problems.join("\n"), /network: calls fetch\(\)/);
  });

  test("missing quality measurements block verification", () => {
    const item = structuredClone(items.find((i) => i.slug === "hero/basic/sparc"));
    item.quality = {};
    assert.equal(buildLabel(item).trust, "candidate");
  });
});

describe("old templates -> candidates with a cleaning list", () => {
  let results;
  before(async () => {
    const items = await templatesAdapter({ templatesDir: path.join(BACKEND_DIR, "templates") }).collect();
    results = new Map(items.map((i) => [i.slug, buildLabel(i)]));
  });

  test("nothing from the old templates is verified", () => {
    assert.ok(results.size > 40);
    assert.deepEqual([...results.values()].filter((r) => r.trust !== "candidate").length, 0);
  });

  test("CurrencyInput: the same mismatches found by hand in Phase 1", () => {
    const p = results.get("crud-modern-new-temp/fields/currency-input").problems.filter((x) => x.startsWith("contract:"));
    assert.deepEqual(p.sort(), [
      'contract: does not accept required prop "field"',
      'contract: prop "error" is boolean, room expects string',
      'contract: requires prop "config" that the room never provides',
      'contract: requires prop "id" that the room never provides',
    ]);
  });

  test("landing sections read a config singleton; old button hard-codes colours", () => {
    assert.match(results.get("landing-modern/sections/hero").problems.join("\n"), /config singleton/);
    assert.match(results.get("crud-modern-new-temp/ui/button").problems.join("\n"), /fixed-colour/);
    assert.equal(results.get("crud-modern-new-temp/widgets/stat-card").label.styleLevel, "amazing"); // uses framer-motion
  });
});

describe("external adapters (saved real responses)", () => {
  test("shadcn: blocks map to rooms, 'cn' is a registry helper, versions are split", async () => {
    const fetchJson = fixtureFetchJson([[SHADCN_REGISTRY, fixture("shadcn-registry.json")]]);
    const items = await shadcnAdapter({ fetchJson, ownUiNames: ["button"] }).collect();
    const bySlug = new Map(items.map((i) => [i.slug, i]));
    const login = bySlug.get("login-01");
    assert.equal(login.room, "login");
    assert.equal(login.kind, "component");
    assert.equal(login.styleLevel, "good");
    const button = bySlug.get("button");
    assert.equal(button.kind, "ui");
    assert.ok(button.requires.registry.includes("shadcn:utils"));
    assert.ok(button.facets.tags.includes("also-in:crud-modern-new-temp"));
    assert.deepEqual(bySlug.get("chart").requires.npm.recharts, "3.8.0");
    assert.deepEqual(splitDep("react-day-picker@latest"), ["react-day-picker", "*"]);
    for (const i of items) assert.equal(buildLabel(i).trust, "candidate");
  });

  test("Magic UI: animated parts get rooms by name and an Amazing/Astonishing level", async () => {
    const fetchJson = fixtureFetchJson([[MAGICUI_REGISTRY, fixture("magicui-registry.json")]]);
    const items = await magicUiAdapter({ fetchJson }).collect();
    const by = new Map(items.map((i) => [i.slug, i]));
    assert.equal(by.get("number-ticker").room, "stats");
    assert.equal(by.get("bento-grid").room, "services");
    assert.equal(by.get("marquee").room, "testimonials");
    assert.equal(by.get("number-ticker").styleLevel, "amazing");
    assert.equal(by.get("shimmer-button").kind, "ui"); // a button is a primitive, not a room
    assert.ok(by.get("number-ticker").requires.npm.motion);
    for (const i of items) assert.equal(buildLabel(i).trust, "candidate");
  });

  test("Aceternity: no declared license, so nothing is reusable until a person checks the terms", async () => {
    const fetchJson = fixtureFetchJson([[ACETERNITY_REGISTRY, fixture("aceternity-registry.json")]]);
    const items = await aceternityAdapter({ fetchJson }).collect();
    assert.ok(items.length > 0);
    for (const i of items) {
      const r = buildLabel(i);
      assert.equal(r.trust, "candidate");
      assert.match(r.problems.join("\n"), /license "UNKNOWN" is not allowed/);
    }
  });

  test("npm: downloads, license and peer deps recorded; non-reusable licenses flagged", async () => {
    const latest = fixture("npm-packument-react-datepicker.json");
    const fetchJson = fixtureFetchJson([
      [(u) => u.includes("/-/v1/search"), fixture("npm-search.json")],
      [(u) => u.endsWith("/latest"), (u) => ({ ...latest, name: decodeURIComponent(u.split("/").slice(-2)[0]) })],
    ]);
    const query = { text: "react datepicker", room: "form-field", match: /date/i };
    // Real search returned 3 packages; 2 have under 1,000 downloads a month and are dropped as noise.
    const items = await npmAdapter({ fetchJson, queries: [query] }).collect();
    assert.deepEqual(items.map((i) => i.slug), ["react-date-picker"]);
    const all = await npmAdapter({ fetchJson, queries: [query], minMonthly: 0 }).collect();
    assert.equal(all.length, 3);
    const offTopic = await npmAdapter({ fetchJson, queries: [{ ...query, match: /toast/i }] }).collect();
    assert.equal(offTopic.length, 0);
    const top = items.find((i) => i.slug === "react-date-picker");
    assert.equal(top.license, "MIT");
    assert.equal(top.quality.downloads, 1961565);
    assert.equal(top.requires.peer.react, latest.peerDependencies.react);
    const r = buildLabel({ ...top, license: "GPL-3.0" });
    assert.equal(r.trust, "candidate");
    assert.match(r.problems.join("\n"), /license "GPL-3.0" is not allowed/);
  });

  test("github: stars, activity and SPDX license", async () => {
    const fetchJson = fixtureFetchJson([[(u) => u.startsWith("https://api.github.com/search/repositories"), fixture("github-search.json")]]);
    const items = await githubAdapter({ fetchJson, queries: ["topic:react-components"] }).collect();
    assert.equal(items.length, 3);
    assert.ok(items.every((i) => i.license === "MIT" && i.quality.stars > 2000));
    assert.ok(items.every((i) => checkCdl(buildLabel(i).label).ok));
  });

  test("storybook: stories grouped per component and mapped to rooms", async () => {
    const fetchJson = fixtureFetchJson([["https://react.carbondesignsystem.com/index.json", fixture("storybook-index.json")]]);
    const items = await storybookAdapter({ fetchJson }).collect();
    const byName = new Map(items.map((i) => [i.slug, i]));
    assert.equal(byName.get("carbon-react/data-table").room, "data-table");
    assert.equal(byName.get("carbon-react/modal").room, "confirm-dialog");
    assert.deepEqual(byName.get("carbon-react/data-table").requires.npm, { "@carbon/react": "*" });
    assert.match(byName.get("carbon-react/data-table").summary, /\d+ stories/);
  });
});

describe("pipeline + stores", () => {
  const fakeItem = (slug, hash, extra = {}) => ({
    idPrefix: "test",
    slug,
    version: "1.0.0",
    name: slug,
    kind: "library",
    summary: `Test item ${slug}.`,
    source: { type: "npm", url: `https://example.test/${slug}` },
    contentHash: hash.padEnd(64, "0"),
    license: "MIT",
    eligibleForVerified: false,
    ...extra,
  });
  const fakeAdapter = (items) => ({ name: "npm", collect: async () => items });

  test("re-running is idempotent; a changed source adds an immutable new version", async () => {
    const store = tempStore();
    const r1 = await runIngest({ adapter: fakeAdapter([fakeItem("a", "a1"), fakeItem("b", "b1")]), store });
    assert.equal(r1.added, 2);
    const r2 = await runIngest({ adapter: fakeAdapter([fakeItem("a", "a1"), fakeItem("b", "b1")]), store });
    assert.equal(r2.unchanged, 2);
    const r3 = await runIngest({ adapter: fakeAdapter([fakeItem("a", "a2"), fakeItem("b", "b1")]), store });
    assert.equal(r3.newVersion, 1);
    const a = await store.get("npm", "a");
    assert.deepEqual(Object.keys(a.versions).map((h) => h.slice(0, 2)).sort(), ["a1", "a2"]);
    assert.equal(a.current.slice(0, 2), "a2");
    assert.ok(checkCdl(currentLabel(a)).ok);
  });

  test("items that disappear are deprecated, bad items never stop the run", async () => {
    const store = tempStore();
    await runIngest({ adapter: fakeAdapter([fakeItem("a", "a1"), fakeItem("b", "b1")]), store });
    const run = await runIngest({ adapter: fakeAdapter([fakeItem("a", "a1"), fakeItem("bad", "c1", { kind: "spaceship" })]), store });
    assert.equal(run.failed, 1);
    assert.equal(run.errors[0].stage, "validate");
    assert.equal(run.deprecated, 1);
    assert.equal((await store.get("npm", "b")).trust, "deprecated");
  });

  test("two items with the same id in one run: the second is an error, never a silent overwrite", async () => {
    const store = tempStore();
    const run = await runIngest({ adapter: fakeAdapter([fakeItem("a", "a1"), fakeItem("a", "a2")]), store });
    assert.equal(run.added, 1);
    assert.equal(run.errors[0].stage, "dedupe");
    assert.equal((await store.get("npm", "a")).current.slice(0, 2), "a1");
  });

  test("registries that reuse a name for a ui part and a block keep both", async () => {
    const fetchJson = fixtureFetchJson([
      [
        ACETERNITY_REGISTRY,
        { items: [{ name: "background-lines", type: "registry:ui" }, { name: "background-lines", type: "registry:block" }, { name: "timeline", type: "registry:ui" }] },
      ],
    ]);
    const slugs = (await aceternityAdapter({ fetchJson }).collect()).map((i) => i.slug).sort();
    assert.deepEqual(slugs, ["background-lines--block", "background-lines--ui", "timeline"]);
  });

  test("a source that is down records an error and deprecates nothing", async () => {
    const store = tempStore();
    await runIngest({ adapter: fakeAdapter([fakeItem("a", "a1")]), store });
    const run = await runIngest({ adapter: { name: "npm", collect: async () => Promise.reject(new Error("registry is down")) }, store });
    assert.equal(run.errors[0].stage, "collect");
    assert.equal(run.deprecated, 0);
    assert.notEqual((await store.get("npm", "a")).trust, "deprecated");
  });

  test("Supabase store sends the expected PostgREST requests (mocked)", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, method: init.method, prefer: init.headers.Prefer, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization });
      return { ok: true, status: 201, json: async () => null, text: async () => "" };
    };
    const store = createSupabaseStore({ url: "https://reg.example.test", serviceKey: "service-key", fetchImpl });
    const item = fakeItem("a", "a1", { facets: { tags: ["date"] } });
    const { label } = buildLabel(item);
    await store.put({ slug: "a", source: "npm", name: "a", kind: "library", trust: "candidate", problems: [], current: item.contentHash, quality: {}, versions: { [item.contentHash]: { label, firstSeenRun: "run-1" } } });
    const tables = calls.map((c) => c.url.replace("https://reg.example.test/rest/v1/", "").split("?")[0]);
    assert.deepEqual(tables, ["sources", "components", "component_versions", "facets", "dependencies", "quality_signals"].filter((t) => t !== "dependencies"));
    assert.ok(calls.every((c) => c.auth === "Bearer service-key"));
    assert.match(calls.find((c) => c.url.includes("component_versions")).prefer, /ignore-duplicates/);
    assert.ok(calls.find((c) => c.url.includes("facets")).body.some((f) => f.facet === "tag" && f.value === "date"));
  });

  test("status report shows progress against the 149 library targets", async () => {
    const store = tempStore();
    await runIngest({ adapter: ownLibraryAdapter({ sparcUiDir: SPARC_UI }), store });
    const md = renderLibraryStatus(await store.list());
    assert.match(md, /V1 progress: 149 \/ 149 room-and-level slots/);
    assert.match(md, /\| hero \| ✅ \| ✅ \| ✅ \| ✅ \|/);
    assert.match(md, /\| data-table \| ✅ \| ✅ \| — \| — \|/);
    assert.match(md, /every component in sparc-ui\/library passes every check/);
  });
});
