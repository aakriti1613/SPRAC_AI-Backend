// Phase 8: the evaluation harness. The numbers it will produce are only worth
// quoting if the code that measures them is right, so the helpers, the
// baselines, the report and the user-study statistics are all tested here.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMeteredGemini, isGeminiUnavailable } from "../registry/evaluation/gemini.js";
import { countCodeLines, extractCode, groupSummary, keywordCoverage, mean, median, moduleRecall, pct, percentile, scanSource, sd, sha, summarize } from "../registry/evaluation/metrics.js";
import { aggregate, renderCharts, renderReport, barChart } from "../registry/evaluation/report.js";
import { LEVELS, analyze, holm, parseCsvLine, parseRatings, renderRatingsReport, tCritical95, tTwoSidedP } from "../registry/evaluation/ratings.js";
import { REQUESTS, probeGemini } from "../registry/evaluation/run.js";
import { aiPrompt, isUnavailableRow, runTemplates, scaffoldAiProject } from "../registry/evaluation/systems.js";
import { planOffline } from "../registry/plan/offline.js";
import { assembleConfig } from "../registry/plan/assemble.js";
import { assembleProject, registryFor } from "../registry/assemble/project.js";
import { createFileStore } from "../registry/store/file.js";

const records = await createFileStore(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^[/]([A-Za-z]:)/, "$1")), "..", "registry", "data")).list();

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

describe("the 30 requests", () => {
  test("30 requests, unique ids, a sensible mix, every one has key words", () => {
    assert.equal(REQUESTS.length, 30);
    assert.equal(new Set(REQUESTS.map((r) => r.id)).size, 30);
    assert.equal(new Set(REQUESTS.map((r) => r.description)).size, 30);
    const count = (t) => REQUESTS.filter((r) => r.type === t).length;
    assert.deepEqual([count("admin-portal"), count("portfolio"), count("landing"), count("ecommerce"), count("booking")], [12, 6, 6, 3, 3]);
    for (const r of REQUESTS) {
      assert.ok(r.keywords.length >= 1, r.id);
      assert.ok(["basic", "good", "amazing", "astonishing"].includes(r.style), r.id);
      if (r.type === "admin-portal") assert.ok(r.mustInclude.length >= 1, r.id);
    }
  });

  test("the offline planner picks the right website type for nearly all of them", async () => {
    let right = 0;
    const wrong = [];
    for (const r of REQUESTS) {
      const p = await planOffline(r.description, {});
      if (p.signals.websiteType === r.type) right += 1;
      else wrong.push(`${r.id}: wanted ${r.type}, got ${p.signals.websiteType}`);
    }
    assert.ok(right >= 27, `only ${right}/30 right: ${wrong.join("; ")}`);
  });
});

describe("statistics helpers", () => {
  test("mean, sd, percentile, median, summarize", () => {
    assert.equal(mean([1, 2, 3, 4]), 2.5);
    near(sd([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 0.001);
    assert.equal(sd([5]), 0);
    assert.equal(percentile([10, 20, 30, 40], 50), 25);
    assert.equal(percentile([10, 20, 30, 40], 90), 37);
    assert.equal(median([3, 1, 2]), 2);
    assert.deepEqual(summarize([1, 2, 3, NaN, undefined]), { n: 3, mean: 2, median: 2, p90: 2.8, min: 1, max: 3 });
    assert.deepEqual(summarize([]), { n: 0, mean: 0, median: 0, p90: 0, min: 0, max: 0 });
  });

  test("percent, grouping, hashing", () => {
    assert.equal(pct([{ a: 1 }, { a: 0 }, { a: 1 }], (r) => r.a === 1), 66.7);
    assert.equal(pct([], () => true), 0);
    const g = groupSummary([{ t: "x", v: 1 }, { t: "x", v: 3 }, { t: "y", v: 10 }], "t", "v");
    assert.equal(g.x.mean, 2);
    assert.equal(g.y.n, 1);
    assert.equal(sha({ a: 1 }), sha({ a: 1 }));
    assert.notEqual(sha({ a: 1 }), sha({ a: 2 }));
  });

  test("key-word coverage and module recall", () => {
    assert.equal(keywordCoverage("Patients and Appointments", ["patient", "appointment", "doctor"]), 2 / 3);
    assert.equal(keywordCoverage("anything", []), 1);
    assert.equal(moduleRecall(["a", "b"], ["a", "c"]), 0.5);
    assert.equal(moduleRecall([], ["x"]), 1);
  });
});

describe("the code scanner (the same checks for every system)", () => {
  const scan = (content) => scanSource([{ path: "src/App.jsx", content }]);

  test("finds the accessibility, security and lint problems it promises to", () => {
    const bad = `
      export default function App() {
        const key = "AIzaSyA1234567890abcdefghijklmnopqrstuv";
        eval("1+1");
        console.log("hi");
        return (<div dangerouslySetInnerHTML={{ __html: x }}>
          <img src="/a.png" />
          <input type="text" placeholder="name" />
          <img
            src="/b.png"
            onError={() => setX(a > b)} />
        </div>);
      }
      fetch("http://insecure.example/api");`;
    const r = scan(bad);
    assert.equal(r.byRule["img-without-alt"], 2, "an image split over lines, with '>' inside a prop, is still found");
    assert.equal(r.byRule["input-without-label"], 1);
    assert.equal(r.byRule["dangerous-html"], 1);
    assert.equal(r.byRule.eval, 1);
    assert.equal(r.byRule["hardcoded-secret"], 1);
    assert.equal(r.byRule["insecure-http-call"], 1);
    assert.equal(r.byRule["console-log"], 1);
    assert.equal(r.byKind.accessibility, 3);
    assert.equal(r.byKind.security, 4);
    assert.ok(r.findings.every((f) => f.line > 0));
  });

  test("known false alarms are not raised (wrapped radios, spread props, HTML attribute values)", () => {
    const fine = `
      <label><input type="radio" name="a" /> One</label>
      <label><input type="checkbox" /> Two</label>
      <input {...common} />
      const AUTOCOMPLETE = { password: "new-password" };
      const INPUT_TYPE = { password: "password" };`;
    assert.equal(scan(fine).total, 0);
    assert.equal(scan('export const DEMO_PASSWORD = "demo1234";').byRule["hardcoded-secret"], 1, "a real demo credential is still reported");
    assert.equal(scan('<input type="text" />').byRule["input-without-label"], 1, "a plain unlabelled text input is still reported");
  });

  test("comments are not code, and a labelled wrapper counts", () => {
    assert.equal(scan("// <input> and <img> and eval(x) and console.log(1)\n/* <img src=1> */\nconst a = 1;").total, 0);
    assert.equal(scan('const u = "http://example.com/a"; fetch("http://example.com");').byRule["insecure-http-call"], 1, "a URL string is not mistaken for a comment");
    assert.equal(scan('<label>Email <input type="email" /></label>').total, 0);
    assert.equal(scan('<input type="email" />\n<label>x <input id="a" /></label>').byRule["input-without-label"], 1, "an input outside the label is still reported");
    const lines = scan("// a\n// b\n<img src=1 />").findings;
    assert.equal(lines[0].line, 3, "line numbers survive the comment removal");
  });

  test("clean code has no findings, and non-code files are ignored", () => {
    const good = `<div><img src="/a.png" alt="A cat" /><input id="n" type="text" /><input type="hidden" name="x" /></div>`;
    assert.equal(scan(good).total, 0);
    assert.equal(scanSource([{ path: "src/data.json", content: "<img src='x'>" }]).total, 0);
  });

  test("counts only real lines of code", () => {
    assert.equal(countCodeLines([{ path: "a.jsx", content: "a\n\n  \nb\n" }, { path: "b.json", content: "x\ny" }]), 2);
  });

  test("extracts the biggest code block from a model reply", () => {
    assert.equal(extractCode("Here:\n```jsx\nconst a = 1;\n```\nand\n```js\nexport default function App() { return null; }\n```"), "export default function App() { return null; }");
    assert.equal(extractCode("export default function App() {}"), "export default function App() {}");
    assert.equal(extractCode("Sorry, I cannot."), "");
  });
});

describe("metered Gemini", () => {
  test("adds up calls and tokens, retries when busy, gives up on other errors", async () => {
    let n = 0;
    const g = createMeteredGemini({
      retries: 3,
      generate: async () => {
        n += 1;
        if (n === 1) throw new Error('{"error":{"code":503,"message":"high demand"}}');
        return { text: "ok", usage: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2, totalTokenCount: 17 } };
      },
    });
    assert.equal(await g.callText("hi"), "ok");
    assert.deepEqual({ calls: g.usage.calls, retries: g.usage.retries, input: g.usage.inputTokens, output: g.usage.outputTokens, total: g.usage.totalTokens }, { calls: 1, retries: 1, input: 10, output: 7, total: 17 });

    const bad = createMeteredGemini({ generate: async () => { throw new Error("API key not valid"); } });
    await assert.rejects(() => bad.callJson("x"), /API key not valid/);
    assert.equal(bad.usage.retries, 0);
  });

  test("a used-up quota stops quickly and is flagged, it is not retried for minutes", async () => {
    let calls = 0;
    const g = createMeteredGemini({
      quotaWaitMs: 0,
      generate: async () => {
        calls += 1;
        throw new Error('{"error":{"code":429,"message":"You exceeded your current quota"}}');
      },
    });
    await assert.rejects(
      () => g.callText("x"),
      (e) => e.quota === true && /quota exhausted/.test(e.message)
    );
    assert.equal(calls, 2, "one retry, then stop");
    assert.equal(isGeminiUnavailable(new Error("You exceeded your current quota")), true);
    assert.equal(isGeminiUnavailable(new Error("API key not valid")), true);
    assert.equal(isGeminiUnavailable(new Error("Unexpected token in JSON")), false);
  });

  test("the probe says whether Gemini can be used, before any measuring starts", async () => {
    const saved = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    try {
      const up = await probeGemini(() => createMeteredGemini({ generate: async () => ({ text: "OK", usage: {} }) }));
      assert.deepEqual(up, { available: true });
      const down = await probeGemini(() => createMeteredGemini({ quotaWaitMs: 0, generate: async () => { throw new Error("429 exceeded your current quota"); } }));
      assert.equal(down.available, false);
      assert.match(down.reason, /quota/);
      process.env.GEMINI_API_KEY = "";
      assert.deepEqual(await probeGemini(), { available: false, reason: "no GEMINI_API_KEY" });
    } finally {
      process.env.GEMINI_API_KEY = saved ?? "";
    }
  });

  test("rows that only failed because Gemini was unusable are recognised, real failures are not", () => {
    assert.equal(isUnavailableRow({ unavailable: true }), true);
    assert.equal(isUnavailableRow({ system: "sparc-gemini", fallback: true }), true, "the Gemini planner never ran");
    assert.equal(isUnavailableRow({ system: "sparc-offline", fallback: false, ok: true }), false);
    assert.equal(isUnavailableRow({ system: "ai-code", ok: false, errors: ['{"error":{"code":429,"message":"You exceeded your current quota"}}'] }), true);
    assert.equal(isUnavailableRow({ system: "ai-code", ok: false, errors: ["error TS: Unexpected token"] }), false, "a build error is a real result");
    assert.equal(isUnavailableRow(null), false);
  });

  test("asks for JSON only for the planner", async () => {
    const seen = [];
    const g = createMeteredGemini({ generate: async (_p, config) => (seen.push(config), { text: "{}", usage: {} }) });
    await g.callJson("a");
    await g.callText("b");
    assert.deepEqual(seen, [{ responseMimeType: "application/json" }, {}]);
  });
});

describe("the three systems", () => {
  const req = (id) => REQUESTS.find((r) => r.id === id);

  test("templates only: serves types with a template, and a portal only if the preset has every module", () => {
    const store = runTemplates(req("r25"));
    assert.equal(store.served, false, "no template for online stores");
    assert.equal(store.ok, false);
    assert.equal(runTemplates(req("r28")).served, false);
    assert.equal(runTemplates(req("r19")).served, false, "landing has no template of its own");
    const folio = runTemplates(req("r13"));
    assert.equal(folio.served, true);
    assert.equal(folio.ok, true);
    const portal = runTemplates(req("r01"));
    assert.equal(portal.served, true);
    assert.ok(portal.moduleRecall >= 0 && portal.moduleRecall <= 1);
    assert.equal(portal.ok, portal.moduleRecall === 1);
    // A portal asking for a module outside its industry preset is not covered.
    const odd = runTemplates({ ...req("r01"), mustInclude: ["products"] });
    assert.equal(odd.ok, false);
    assert.deepEqual(odd.missingModules, ["products"]);
    assert.equal(portal.tokens.total, 0);
  });

  test("a generated site ships only its own style level's registry", () => {
    assert.equal(registryFor("site-shell", "good"), "good.ts");
    assert.equal(registryFor("site-shell", "astonishing"), "astonishing.ts");
    assert.equal(registryFor("portal-shell", "amazing"), "amazing.ts");
    assert.throws(() => registryFor("portal-shell", "nonsense"), /no registry/);
    const { config } = assembleConfig({ websiteType: "booking", industry: "generic", styleLevel: "amazing", brandName: "Test" });
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "p8-asm-"));
    const r = assembleProject(config, { name: "p8-prune", records, outDir: out });
    assert.equal(r.ok, true, r.errors?.join("; "));
    assert.deepEqual(fs.readdirSync(path.join(r.dir, "src", "registries")), ["amazing.ts"]);
    fs.rmSync(out, { recursive: true, force: true });
  });

  test("the AI prompt carries the request and the rules", () => {
    const p = aiPrompt(req("r13"));
    assert.match(p, /personal portfolio/);
    assert.match(p, /ONE React file|one code block/i);
    assert.match(p, /No images from the internet/);
  });

  test("the smallest project that can build generated code is written correctly", () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "p8-")), "ai-x");
    scaffoldAiProject(dir, "export default function App(){return <p>hi</p>}", "A <b>title</b>");
    for (const f of ["package.json", "index.html", "vite.config.js", "src/main.jsx", "src/index.css", "src/App.jsx"]) assert.ok(fs.existsSync(path.join(dir, f)), f);
    assert.ok(!fs.readFileSync(path.join(dir, "index.html"), "utf8").includes("<b>"), "the title cannot inject HTML");
    assert.match(fs.readFileSync(path.join(dir, "src", "main.jsx"), "utf8"), /BrowserRouter/);
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  });
});

describe("report", () => {
  const row = (id, type, over = {}) => ({ id, type, style: "good", ok: true, buildOk: true, keywordCoverage: 1, totalMs: 10000, tokens: { total: 1000 }, newCodeLines: 0, newConfigLines: 100, reusePct: 99, scan: { total: 0, byKind: {} }, gzipKb: 120, ...over });
  const results = {
    meta: { requests: 2, model: "test-model", finishedAt: "2026-11-19" },
    templates: { a: { id: "a", type: "admin-portal", ok: true, served: true, tokens: { total: 0 }, totalMs: 0, newCodeLines: 0, reusePct: 100 }, b: { id: "b", type: "ecommerce", ok: false, served: false, errors: ["no template"], tokens: { total: 0 }, totalMs: 0, newCodeLines: 0, reusePct: 100 } },
    sparc: { offline: { a: row("a", "admin-portal", { typeCorrect: true }), b: row("b", "ecommerce", { typeCorrect: true }) } },
    ai: { a: row("a", "admin-portal", { newCodeLines: 400, newConfigLines: 0, reusePct: 0, totalMs: 40000, tokens: { total: 9000 }, scan: { total: 3, byKind: { accessibility: 2, lint: 1 } } }), b: row("b", "ecommerce", { ok: false, buildOk: false, errors: ["build failed"], keywordCoverage: undefined }) },
    repeat: { sparcOffline: [{ id: "a", runs: 3, distinct: 1 }], ai: [{ id: "a", runs: 3, distinct: 3 }] },
    levels: [{ websiteType: "portfolio", styleLevel: "basic", ok: true, gzipKb: 60, rawKb: 200, buildMs: 4000, components: 9 }, { websiteType: "portfolio", styleLevel: "good", ok: true, gzipKb: 70, rawKb: 220, buildMs: 4100, components: 9 }],
    search: { n: 32, recallAt5: 0.97, mrr: 0.9 },
    planner: { n: 20, websiteTypeAccuracy: 1, industryAccuracy: 0.9, configValidPct: 1, moduleRecall: 1, modulePrecision: 0.8 },
  };

  test("aggregates per system and per type", () => {
    const a = aggregate(results);
    assert.deepEqual(a.systems, ["templates", "sparc-offline", "ai-code"]);
    assert.equal(a.rows.templates.coveredPct, 50);
    assert.equal(a.rows["sparc-offline"].coveredPct, 100);
    assert.equal(a.rows["ai-code"].coveredPct, 50, "a failed build is not covered");
    assert.equal(a.rows["ai-code"].avgNewLines, 250);
    assert.equal(a.rows["ai-code"].findingsPerSite, 1.5);
    assert.equal(a.rows["ai-code"].kindsTotal.accessibility, 2);
    assert.equal(a.byType.ecommerce.templates, 0);
    assert.equal(a.byType.ecommerce["sparc-offline"], 100);
    assert.equal(a.repeat.sparcOffline.sameEveryTime, 1);
    assert.equal(a.repeat.ai.sameEveryTime, 0);
    assert.ok(a.failures.some((f) => f.system === "ai-code" && f.id === "b" && /build failed/.test(f.why)));
  });

  test("parts that could not be measured are said so, not shown as failures", () => {
    const partial = structuredClone(results);
    delete partial.ai;
    partial.meta.gemini = { available: false, reason: "Gemini quota exhausted" };
    const md = renderReport(partial);
    assert.match(md, /## Not measured in this run/);
    assert.match(md, /Gemini quota exhausted/);
    assert.match(md, /\(c\) AI writes all the code: 0 of 2 requests measured/);
    assert.match(md, /--resume/);
    assert.ok(!aggregate(partial).systems.includes("ai-code"));
    assert.ok(!/## Not measured in this run/.test(renderReport({ ...results, meta: { ...results.meta, gemini: { available: true } }, ai: results.ai, sparc: { ...results.sparc, gemini: results.sparc.offline } })));
  });

  test("a word-poor site that passes its checks is still not 'covered'", () => {
    const poor = structuredClone(results);
    poor.sparc.offline.a.keywordCoverage = 0.2;
    assert.equal(aggregate(poor).rows["sparc-offline"].coveredPct, 50);
  });

  test("the markdown report has the sections and honest limits", () => {
    const md = renderReport(results);
    for (const h of ["# Phase 8: evaluation report", "## Headline results", "## By kind of website", "## Errors and security findings", "## Same answer every time", "## Size at each style level", "## Search and planner quality", "## What this does and does not show"]) assert.ok(md.includes(h), h);
    assert.match(md, /Recall@5 = 0.97/);
    assert.match(md, /Lighthouse scores were \*\*not\*\* run/);
    assert.match(md, /user study/);
    assert.ok(!/NaN|undefined/.test(md), "no NaN or undefined in the report");
  });

  test("charts are one self-contained page with accessible SVG", () => {
    const html = renderCharts(results);
    assert.match(html, /<svg[^>]+role="img"/);
    assert.ok(!/NaN|undefined/.test(html));
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html), "no external resources");
    assert.match(html, /prefers-color-scheme: dark/);
    const one = barChart({ title: "t <x>", bars: [{ label: "a&b", value: 0 }] });
    assert.ok(!one.includes("<x>") && one.includes("a&amp;b"));
  });
});

describe("user-study statistics", () => {
  test("the t distribution matches known values", () => {
    near(tTwoSidedP(2.228, 10), 0.05, 0.001);
    near(tTwoSidedP(2.0, 10), 0.0734, 0.001);
    near(tTwoSidedP(0, 5), 1, 1e-9);
    near(tTwoSidedP(12.706, 1), 0.05, 0.001);
    near(tCritical95(10), 2.228, 0.002);
    near(tCritical95(30), 2.042, 0.002);
  });

  test("Holm's correction", () => {
    assert.deepEqual(holm([0.01, 0.04, 0.03]).map((x) => Math.round(x * 100) / 100), [0.03, 0.06, 0.06]);
    assert.deepEqual(holm([0.5]), [0.5]);
    assert.ok(holm([0.4, 0.4, 0.4]).every((x) => x === 1 || x <= 1));
  });

  test("CSV parsing and the checks on it", () => {
    assert.deepEqual(parseCsvLine('p1,site,good,4,"nice, clean ""look"""'), ["p1", "site", "good", "4", 'nice, clean "look"']);
    const ok = parseRatings("participant,site,style_level,rating,comment\np1,portfolio,Good,4,fine\n");
    assert.deepEqual(ok.problems, []);
    assert.equal(ok.ratings[0].level, "good");
    const bad = parseRatings("participant,site,style_level,rating\np1,portfolio,wow,4\np1,portfolio,good,6\np1,portfolio,good,3\np1,portfolio,good,3\n,portfolio,good,3\n");
    assert.equal(bad.problems.length, 4);
    assert.match(bad.problems[0], /line 2.*style_level/);
    assert.match(bad.problems[1], /line 3.*1 to 5/);
    assert.match(bad.problems[2], /line 5.*twice/);
    assert.deepEqual(parseRatings("a,b\n1,2").problems, ['missing column "participant"', 'missing column "site"', 'missing column "style_level"', 'missing column "rating"']);
    assert.deepEqual(parseRatings("").problems, ["the file is empty"]);
  });

  test("analysis: averages, intervals, paired differences", () => {
    // 12 people rate one site at all 4 levels; higher levels are rated higher, with a little noise.
    const ratings = [];
    for (let p = 0; p < 12; p += 1) {
      LEVELS.forEach((level, i) => ratings.push({ participant: `p${p}`, site: "portfolio", level, rating: Math.min(5, Math.max(1, 2 + i + (p % 3 === 0 ? 1 : 0) - (p % 4 === 0 ? 1 : 0))) }));
    }
    const r = analyze(ratings);
    assert.equal(r.participants, 12);
    assert.equal(r.ratings, 48);
    assert.deepEqual(r.perLevel.map((x) => x.level), LEVELS);
    assert.ok(r.perLevel[3].mean > r.perLevel[0].mean);
    for (const l of r.perLevel) assert.ok(l.ci95[0] <= l.mean && l.mean <= l.ci95[1]);
    assert.equal(r.pairs.length, 6);
    const basicGood = r.pairs.find((x) => x.from === "basic" && x.to === "good");
    assert.equal(basicGood.n, 12);
    near(basicGood.meanDiff, 1, 0.001);
    const top = r.pairs.find((x) => x.from === "basic" && x.to === "astonishing");
    assert.ok(top.pHolm < 0.05, "a 3-point gap with 12 people is reliable");
    for (const p of r.pairs) assert.ok(p.pHolm >= p.p, "the corrected p is never smaller");
    const md = renderRatingsReport(r);
    assert.match(md, /12 people gave 48 ratings/);
    assert.ok(!/NaN/.test(md));
  });

  test("identical ratings give no difference, not an error", () => {
    const ratings = [];
    for (let p = 0; p < 5; p += 1) for (const level of LEVELS) ratings.push({ participant: `p${p}`, site: "s", level, rating: 3 });
    const r = analyze(ratings);
    assert.ok(r.pairs.every((x) => x.meanDiff === 0 && x.pHolm === 1));
  });

  test("a tiny study is reported as it is", () => {
    const r = analyze([{ participant: "p1", site: "s", level: "basic", rating: 3 }]);
    assert.equal(r.perLevel[0].n, 1);
    assert.deepEqual(r.perLevel[0].ci95, [3, 3]);
    assert.ok(r.pairs.every((x) => x.n === 0 && x.p === 1));
  });
});
