// Phase 1: SPARC scope, rooms, style levels, blueprints, CDL labels and contracts.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ROOMS,
  ROOM_IDS,
  STYLE_LEVELS,
  activeBlueprints,
  checkBlueprint,
  checkCatalogue,
  checkCdl,
  checkPropsAgainstRoom,
  libraryTargets,
  loadBlueprints,
  roomsOf,
} from "../sparc/index.js";
import { renderRoomTypes, renderScopeDoc } from "../sparc/generate.js";
import { levelsUpTo, packageAllowed } from "../sparc/styleLevels.js";
import { FIELD_TYPE_NAMES } from "../lib/fieldTypes.js";
import { BACKEND_DIR } from "./helpers/server.js";

const EXAMPLES = path.join(BACKEND_DIR, "sparc", "examples");
const example = (name) => JSON.parse(fs.readFileSync(path.join(EXAMPLES, name), "utf8"));
const blueprints = loadBlueprints();

describe("scope (what we promise)", () => {
  test("V1 = portfolio, landing, admin portal; V2 = e-commerce, booking (built in Phase 7)", () => {
    const byStatus = (s) => blueprints.filter((b) => b.status === s).map((b) => b.id).sort();
    assert.deepEqual(byStatus("active"), ["admin-portal", "booking", "ecommerce", "landing", "portfolio"]);
    assert.deepEqual(byStatus("planned"), []);
    for (const b of blueprints) assert.equal(b.release, ["booking", "ecommerce"].includes(b.id) ? "v2" : "v1");
  });

  test("library size stays within the agreed range", () => {
    assert.ok(ROOM_IDS.length >= 30 && ROOM_IDS.length <= 60, `rooms: ${ROOM_IDS.length}`);
    const { total } = libraryTargets(blueprints);
    assert.ok(total >= 100 && total <= 150, `V1 component target: ${total}`);
  });

  test("astonishing is only for portfolio and landing; admin pages stop at amazing", () => {
    const max = Object.fromEntries(blueprints.map((b) => [b.id, b.maxStyleLevel]));
    assert.equal(max.portfolio, "astonishing");
    assert.equal(max.landing, "astonishing");
    assert.equal(max["admin-portal"], "amazing");
  });
});

describe("blueprints", () => {
  for (const bp of blueprints) {
    test(`${bp.id} passes all cross-checks`, () => {
      assert.deepEqual(checkBlueprint(bp), []);
    });
  }

  test("every room in the catalogue is used by at least one active website type", () => {
    const used = new Set(activeBlueprints(blueprints).flatMap(roomsOf));
    assert.deepEqual(ROOM_IDS.filter((id) => !used.has(id)), []);
  });

  test("admin portal covers the existing generated flow (login, list, add/edit, details, delete)", () => {
    const admin = blueprints.find((b) => b.id === "admin-portal");
    for (const room of ["login", "app-frame", "data-table", "record-form", "form-field", "record-detail", "confirm-dialog"]) {
      assert.ok(admin.rooms.required.includes(room), `admin-portal must require ${room}`);
    }
    const repeated = admin.pages.filter((p) => p.repeat === "per-module").map((p) => p.path);
    assert.deepEqual(repeated.sort(), ["/:module", "/:module/:id", "/:module/:id/edit", "/:module/new"]);
  });

  test("checks catch broken blueprints", () => {
    const admin = structuredClone(blueprints.find((b) => b.id === "admin-portal"));
    admin.rooms.optional.push("carousel");
    admin.pages[0].rooms.push("hero");
    admin.pages = admin.pages.filter((p) => p.path !== "*");
    const problems = checkBlueprint(admin).join("\n");
    assert.match(problems, /room "carousel" is not in the room catalogue/);
    assert.match(problems, /uses room "hero" that the blueprint does not declare/);
    assert.match(problems, /room "carousel" is not placed on any page/);
    assert.match(problems, /no 404 page/);
  });
});

describe("rooms and style levels", () => {
  test("catalogue is complete (descriptions, known shapes, valid types)", () => {
    assert.deepEqual(checkCatalogue(), []);
  });

  test("field types in contracts are exactly the platform's field types", () => {
    const fieldTypeEnum = ROOMS["form-field"].props.field; // shape FieldDef
    assert.equal(fieldTypeEnum.type, "shape");
    const generated = renderRoomTypes();
    for (const t of FIELD_TYPE_NAMES) assert.ok(generated.includes(JSON.stringify(t)), `FieldDef.type missing ${t}`);
  });

  test("style levels are ordered and packages are gated", () => {
    assert.deepEqual(levelsUpTo("amazing"), ["basic", "good", "amazing"]);
    assert.equal(packageAllowed("basic", "framer-motion"), false);
    assert.equal(packageAllowed("amazing", "framer-motion"), true);
    assert.equal(packageAllowed("amazing", "gsap"), false);
    assert.equal(packageAllowed("astonishing", "@gsap/react"), true);
    assert.equal(packageAllowed("basic", "lucide-react"), true);
    const orders = Object.values(STYLE_LEVELS).map((s) => s.order);
    assert.deepEqual(orders, [1, 2, 3, 4]);
    const budgets = Object.values(STYLE_LEVELS).map((s) => s.maxComponentKb);
    assert.deepEqual([...budgets].sort((a, b) => a - b), budgets, "budgets grow with the level");
  });
});

describe("contract checker", () => {
  const good = [
    { name: "field", kind: "object", required: true },
    { name: "value", kind: "unknown", required: true },
    { name: "onChange", kind: "function", required: true },
    { name: "error", kind: "string", required: false },
  ];

  test("a component that fits passes (missing optional props are only warnings)", () => {
    const r = checkPropsAgainstRoom("form-field", good);
    assert.equal(r.ok, true);
    assert.deepEqual(r.warnings, ['ignores optional prop "disabled"']);
  });

  test("missing required prop, extra required prop and wrong type all fail", () => {
    const r = checkPropsAgainstRoom("form-field", [
      ...good.filter((p) => p.name !== "onChange"),
      { name: "config", kind: "object", required: true },
      { name: "disabled", kind: "string", required: false },
    ]);
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors.sort(), [
      'does not accept required prop "onChange"',
      'prop "disabled" is string, room expects boolean',
      'requires prop "config" that the room never provides',
    ]);
  });

  test("unknown room is reported", () => {
    assert.equal(checkPropsAgainstRoom("carousel", []).ok, false);
  });
});

describe("CDL labels", () => {
  test("all example labels are valid as written", () => {
    for (const file of fs.readdirSync(EXAMPLES)) {
      const r = checkCdl(example(file), blueprints);
      assert.deepEqual(r.errors, [], file);
    }
  });

  test("today's CurrencyInput does not fit the form-field contract yet (needs cleaning)", () => {
    const r = checkCdl({ ...example("own-currency-input.as-is.cdl.json"), trust: "verified" }, blueprints);
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors.sort(), [
      'contract: does not accept required prop "field"',
      'contract: prop "error" is boolean, room expects string',
      'contract: requires prop "config" that the room never provides',
      'contract: requires prop "id" that the room never provides',
    ]);
  });

  test("today's StatCard uses framer-motion, so it can't be Basic; icon must become a name", () => {
    const asIs = example("own-stat-card.as-is.cdl.json");
    const basic = checkCdl({ ...asIs, trust: "verified" }, blueprints).errors;
    assert.ok(basic.includes('package "framer-motion" is not allowed at style "basic"'));
    const amazing = checkCdl({ ...asIs, trust: "verified", styleLevel: "amazing" }, blueprints).errors;
    assert.deepEqual(amazing, ['contract: prop "icon" is object, room expects string']);
  });

  test("verified rules: style above the website max, bad license, over budget, LLM-decided facts", () => {
    const base = example("own-currency-input.cleaned.cdl.json");
    const check = (patch) => checkCdl({ ...base, ...patch }, blueprints).errors.join("\n");
    assert.match(check({ styleLevel: "astonishing" }), /above the maximum for "admin-portal"/);
    assert.match(check({ license: "GPL-3.0" }), /license "GPL-3.0" is not allowed/);
    assert.match(check({ quality: { sizeKb: 99 } }), /over the 15 KB budget/);
    assert.match(check({ websiteTypes: ["portfolio"] }), /room "form-field" is not used by website type "portfolio"/);
    const withPlannedShop = blueprints.map((b) => (b.id === "ecommerce" ? { ...b, status: "planned" } : b));
    assert.match(checkCdl({ ...base, websiteTypes: ["ecommerce"] }, withPlannedShop).errors.join("\n"), /is not active yet/);
    assert.match(check({ provenance: { trust: { by: "llm" } } }), /"trust" cannot come from an LLM/);
    assert.match(check({ provides: { fieldTypes: [], capabilities: [] } }), /must list provides.fieldTypes/);
  });

  test("shape errors are reported (strict schema)", () => {
    const r = checkCdl({ ...example("shadcn-button.cdl.json"), surprise: true, version: "latest" }, blueprints);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.startsWith("version")));
    assert.ok(r.errors.some((e) => /surprise|Unrecognized/i.test(e)));
  });
});

describe("generated files", () => {
  const files = {
    "sparc-ui/contracts/rooms.d.ts": renderRoomTypes(),
    "docs/SPARC_SCOPE.md": renderScopeDoc(blueprints),
  };
  for (const [rel, expected] of Object.entries(files)) {
    test(`${rel} is up to date (run: npm run sparc:generate)`, () => {
      const actual = fs.readFileSync(path.join(BACKEND_DIR, rel), "utf8");
      assert.equal(actual, expected);
    });
  }

  test("TypeScript contracts compile and enforce required props", () => {
    const tsc = path.join(BACKEND_DIR, "node_modules", "typescript", "bin", "tsc");
    try {
      execFileSync(process.execPath, [tsc, "-p", path.join(BACKEND_DIR, "test", "contracts", "tsconfig.json")], { stdio: "pipe" });
    } catch (err) {
      assert.fail(`tsc failed:\n${err.stdout}${err.stderr}`);
    }
  });
});
