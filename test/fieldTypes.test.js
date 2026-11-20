// Keeps every copy of the field-type list in sync with lib/fieldTypes.js.
// Templates ship as standalone projects, so they keep their own copies; this
// test fails the moment one of them drifts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FIELD_TYPE_NAMES, FIELD_TYPE_SQL, OPTION_FIELD_TYPE_NAMES } from "../lib/fieldTypes.js";
import { PORTAL_FIELD_TYPES, OPTION_FIELD_TYPES } from "../lib/portalConfig.js";
import { BACKEND_DIR } from "./helpers/server.js";

const CRUD = path.join(BACKEND_DIR, "templates", "crud-modern-new-temp");
const FRONTEND = path.resolve(BACKEND_DIR, "..", "platform-main");
const ALL = new Set(FIELD_TYPE_NAMES);

/** Return every "quoted" string between `startPattern` and the next `endToken`. */
function quotedStringsIn(file, startPattern, endToken) {
  const text = fs.readFileSync(file, "utf8");
  const start = text.search(startPattern);
  assert.ok(start >= 0, `${startPattern} not found in ${file}`);
  const end = text.indexOf(endToken, start);
  const block = text.slice(start, end + endToken.length);
  return [...block.matchAll(/"([a-z-]+)"\s*[,|:\]\n;]/g)].map((m) => m[1]);
}

const sorted = (list) => [...new Set(list)].sort();

test("derived backend lists match the single source", () => {
  assert.equal(FIELD_TYPE_NAMES.length, 27);
  assert.deepEqual(sorted(PORTAL_FIELD_TYPES), sorted(FIELD_TYPE_NAMES));
  assert.deepEqual(sorted(OPTION_FIELD_TYPES), sorted(OPTION_FIELD_TYPE_NAMES));
  assert.deepEqual(sorted(Object.keys(FIELD_TYPE_SQL)), sorted(FIELD_TYPE_NAMES));
});

test("crud template: config type union and validator list equal the source", () => {
  const union = quotedStringsIn(path.join(CRUD, "src/lib/config.types.ts"), /export type CrudFieldType\s*=/, ";");
  assert.deepEqual(sorted(union), sorted(FIELD_TYPE_NAMES), "src/lib/config.types.ts CrudFieldType");

  const validator = path.join(CRUD, "scripts/validate-config.mjs");
  assert.deepEqual(sorted(quotedStringsIn(validator, /const allowedTypes = new Set\(\[/, "]);")), sorted(FIELD_TYPE_NAMES), "validate-config allowedTypes");
  assert.deepEqual(sorted(quotedStringsIn(validator, /const optionTypes = new Set\(\[/, "]);")), sorted(OPTION_FIELD_TYPE_NAMES), "validate-config optionTypes");
});

test("crud template: form types and field registry only use known types", () => {
  const formTypes = quotedStringsIn(path.join(CRUD, "src/shared/components/form/form.types.ts"), /export type FieldType\s*=/, ";");
  for (const t of formTypes) assert.ok(ALL.has(t), `form.types.ts FieldType has unknown type "${t}"`);

  const registry = fs.readFileSync(path.join(CRUD, "src/engine/fieldRegistry.ts"), "utf8");
  const block = registry.slice(registry.indexOf("export const fieldRegistry"));
  const keys = [...block.matchAll(/^\s+"?([a-z-]+)"?:\s*[A-Z]\w+,/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 20, "field registry keys not found");
  for (const k of keys) assert.ok(ALL.has(k), `fieldRegistry.ts has unknown type "${k}"`);
});

test("frontend wizard and preview runtime only offer known types", { skip: !fs.existsSync(FRONTEND) && "platform-main not next to backend" }, () => {
  const wizard = fs.readFileSync(path.join(FRONTEND, "src/portal/portalDefaults.js"), "utf8");
  const wizardBlock = wizard.slice(wizard.indexOf("export const ESSENTIAL_FIELD_TYPES"), wizard.indexOf("];"));
  const wizardTypes = [...wizardBlock.matchAll(/value:\s*"([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(wizardTypes.length > 0);
  for (const t of wizardTypes) assert.ok(ALL.has(t), `wizard offers unknown type "${t}"`);

  const runtime = fs.readFileSync(path.join(FRONTEND, "src/portal-runtime/engine/fieldRegistry.js"), "utf8");
  const runtimeTypes = [...runtime.matchAll(/^\s{2}"?([a-z-]+)"?:\s*\{/gm)].map((m) => m[1]);
  assert.ok(runtimeTypes.length > 0);
  for (const t of runtimeTypes) assert.ok(ALL.has(t), `preview fieldRegistry has unknown type "${t}"`);
});
