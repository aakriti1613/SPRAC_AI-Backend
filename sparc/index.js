// SPARC AI scope + contracts — public entry point.
//
//   loadBlueprints()            all blueprints (validated)
//   checkBlueprint(bp)          cross-file rules for one blueprint
//   checkPropsAgainstRoom(...)  does a real component fit a room's plug shape?
//   checkCdl(label)             is a CDL label valid and, if `verified`, buildable?
//   libraryTargets()            how many components V1 needs (accountability)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORTAL_INDUSTRIES } from "../lib/portalConfig.js";
import { coarseKind, referencedShapes } from "./propSpec.js";
import { ROOMS, ROOM_IDS, SHAPES } from "./rooms.js";
import { ALLOWED_LICENSES, FACT_FIELDS, blueprintSchema, cdlSchema } from "./schema.js";
import { STYLE_LEVELS, STYLE_LEVEL_IDS, V1_WORKFLOW_LEVELS, levelsUpTo, packageAllowed } from "./styleLevels.js";

export { ROOMS, ROOM_IDS, SHAPES } from "./rooms.js";
export { STYLE_LEVELS, STYLE_LEVEL_IDS } from "./styleLevels.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const BLUEPRINTS_DIR = path.join(here, "blueprints");

// ---------------------------------------------------------------------------
// Blueprints
// ---------------------------------------------------------------------------
export function loadBlueprints(dir = BLUEPRINTS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const parsed = blueprintSchema.safeParse(raw);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(`blueprint ${file} is invalid: ${issues}`);
      }
      if (`${parsed.data.id}.json` !== file) throw new Error(`blueprint ${file} has id "${parsed.data.id}"`);
      return parsed.data;
    });
}

export const activeBlueprints = (all = loadBlueprints()) => all.filter((b) => b.status === "active");

let BLUEPRINT_CACHE = null;
/** One active blueprint by id (cached; throws if unknown/inactive). */
export function getBlueprint(id) {
  BLUEPRINT_CACHE ??= new Map(activeBlueprints().map((b) => [b.id, b]));
  const bp = BLUEPRINT_CACHE.get(id);
  if (!bp) throw new Error(`unknown or inactive website type "${id}"`);
  return bp;
}

/** All rooms a blueprint can use (required + optional). */
export function roomsOf(bp) {
  return bp.status === "active" ? [...bp.rooms.required, ...bp.rooms.optional] : [...bp.plannedRooms.required, ...bp.plannedRooms.optional];
}

/** Cross-file rules. Returns a list of problems (empty = fine). */
export function checkBlueprint(bp) {
  const problems = [];
  const p = (msg) => problems.push(`${bp.id}: ${msg}`);

  for (const ind of bp.industries) if (!PORTAL_INDUSTRIES.includes(ind)) p(`unknown industry "${ind}"`);
  if (bp.industryBased && bp.industries.length === 0) p("industryBased but no industries");
  if (!bp.industryBased && bp.industries.length > 0) p("not industryBased but lists industries");

  if (bp.status !== "active") return problems; // planned types only need a valid shape

  const all = roomsOf(bp);
  const seen = new Set();
  for (const id of all) {
    if (!ROOMS[id]) p(`room "${id}" is not in the room catalogue`);
    if (seen.has(id)) p(`room "${id}" is listed twice`);
    seen.add(id);
  }
  for (const id of bp.rooms.defaultOn) if (!bp.rooms.optional.includes(id)) p(`defaultOn "${id}" is not an optional room`);
  for (const [ind, ids] of Object.entries(bp.industryDefaults)) {
    if (!bp.industries.includes(ind)) p(`industryDefaults for "${ind}", which is not one of its industries`);
    for (const id of ids) if (!bp.rooms.optional.includes(id)) p(`industryDefaults.${ind}: "${id}" is not an optional room`);
  }

  const onPages = new Set();
  const pageIds = new Set();
  const paths = new Set();
  for (const page of bp.pages) {
    if (pageIds.has(page.id)) p(`page id "${page.id}" used twice`);
    if (paths.has(page.path)) p(`page path "${page.path}" used twice`);
    pageIds.add(page.id);
    paths.add(page.path);
    for (const id of page.rooms) {
      if (!seen.has(id)) p(`page "${page.id}" uses room "${id}" that the blueprint does not declare`);
      onPages.add(id);
    }
    if (page.when && !bp.rooms.optional.includes(page.when)) p(`page "${page.id}" depends on "${page.when}", which is not an optional room`);
  }
  for (const id of all) if (!onPages.has(id)) p(`room "${id}" is not placed on any page`);
  if (!bp.pages.some((pg) => pg.path === "*")) p("no 404 page (path '*')");
  return problems;
}

// ---------------------------------------------------------------------------
// Room catalogue self-check
// ---------------------------------------------------------------------------
export function checkCatalogue() {
  const problems = [];
  const shapeNames = new Set(Object.keys(SHAPES));
  const visit = (where, spec) => {
    if (!spec.description) problems.push(`${where}: missing description`);
    for (const name of referencedShapes(spec)) if (!shapeNames.has(name)) problems.push(`${where}: unknown shape "${name}"`);
    if (spec.type === "enum" && !spec.values?.length) problems.push(`${where}: enum without values`);
    coarseKind(spec); // throws on unknown types
  };
  for (const [id, room] of Object.entries(ROOMS)) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) problems.push(`room "${id}": bad id`);
    if (!["visual", "workflow"].includes(room.kind)) problems.push(`room "${id}": bad kind`);
    if (!room.description) problems.push(`room "${id}": missing description`);
    if (!Object.keys(room.props).length) problems.push(`room "${id}": no props`);
    if (!Object.values(room.props).some((s) => s.required)) problems.push(`room "${id}": no required prop`);
    for (const [name, spec] of Object.entries(room.props)) visit(`${id}.${name}`, spec);
  }
  for (const [name, def] of Object.entries(SHAPES)) {
    for (const [field, spec] of Object.entries(def.fields)) visit(`${name}.${field}`, spec);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Contract check: does a component fit a room?
// componentProps: [{ name, kind, required }] — `kind` is a coarse kind
// (see schema.js COARSE_KINDS); "unknown" means the parser could not tell.
// ---------------------------------------------------------------------------
export function checkPropsAgainstRoom(roomId, componentProps) {
  const room = ROOMS[roomId];
  if (!room) return { ok: false, errors: [`unknown room "${roomId}"`], warnings: [] };
  const errors = [];
  const warnings = [];
  const byName = new Map(componentProps.map((pr) => [pr.name, pr]));

  for (const [name, spec] of Object.entries(room.props)) {
    const own = byName.get(name);
    if (!own) {
      (spec.required ? errors : warnings).push(
        spec.required ? `does not accept required prop "${name}"` : `ignores optional prop "${name}"`
      );
      continue;
    }
    const expected = coarseKind(spec);
    if (expected !== "any" && own.kind !== "unknown" && own.kind !== "any" && own.kind !== expected) {
      errors.push(`prop "${name}" is ${own.kind}, room expects ${expected}`);
    }
  }
  for (const own of componentProps) {
    if (!room.props[own.name] && own.required) {
      errors.push(`requires prop "${own.name}" that the room never provides`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// CDL label check
// ---------------------------------------------------------------------------
/**
 * Validates a CDL label. Shape errors always fail. For `verified` labels the
 * buildability rules are enforced too (room contract, style budget, license…).
 * Returns { ok, label?, errors }.
 */
export function checkCdl(raw, blueprints = loadBlueprints()) {
  const parsed = cdlSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const label = parsed.data;
  const errors = [];
  const bpById = new Map(blueprints.map((b) => [b.id, b]));

  // An LLM may describe, never decide facts.
  for (const [field, prov] of Object.entries(label.provenance)) {
    const top = field.split(".")[0];
    if (prov.by === "llm" && FACT_FIELDS.includes(top)) errors.push(`provenance: "${field}" cannot come from an LLM`);
  }

  if (label.kind === "component") {
    if (!label.room) errors.push("component needs a room");
    if (!label.styleLevel) errors.push("component needs a styleLevel");
  }
  if (label.room && !ROOMS[label.room]) errors.push(`unknown room "${label.room}"`);
  for (const t of label.websiteTypes) if (!bpById.has(t)) errors.push(`unknown website type "${t}"`);

  if (label.trust === "verified" && label.kind === "component" && label.room && ROOMS[label.room] && label.styleLevel) {
    const room = ROOMS[label.room];
    if (!label.websiteTypes.length) errors.push("verified component must list websiteTypes");
    for (const t of label.websiteTypes) {
      const bp = bpById.get(t);
      if (!bp) continue;
      if (bp.status !== "active") errors.push(`website type "${t}" is not active yet`);
      else if (!roomsOf(bp).includes(label.room)) errors.push(`room "${label.room}" is not used by website type "${t}"`);
      else if (!levelsUpTo(bp.maxStyleLevel).includes(label.styleLevel)) {
        errors.push(`style "${label.styleLevel}" is above the maximum for "${t}" (${bp.maxStyleLevel})`);
      }
    }
    if (!ALLOWED_LICENSES.includes(label.license)) errors.push(`license "${label.license}" is not allowed for verified components`);
    for (const pkg of [...Object.keys(label.requires.npm), ...Object.keys(label.requires.peer)]) {
      if (!packageAllowed(label.styleLevel, pkg)) errors.push(`package "${pkg}" is not allowed at style "${label.styleLevel}"`);
    }
    const budget = STYLE_LEVELS[label.styleLevel].maxComponentKb;
    if (label.quality.sizeKb !== undefined && label.quality.sizeKb > budget) {
      errors.push(`size ${label.quality.sizeKb} KB is over the ${budget} KB budget for "${label.styleLevel}"`);
    }
    if (label.quality.a11yViolations) errors.push(`${label.quality.a11yViolations} accessibility violation(s)`);
    const contract = checkPropsAgainstRoom(label.room, label.interface.props);
    for (const e of contract.errors) errors.push(`contract: ${e}`);
    if (label.room === "form-field" && !label.provides.fieldTypes.length) errors.push("form-field component must list provides.fieldTypes");
    if (room.kind === "workflow" && !label.compat.language) errors.push("workflow component must state compat.language");
  }

  return { ok: errors.length === 0, label, errors };
}

// ---------------------------------------------------------------------------
// How many components V1 needs (one per room per style level it must support)
// ---------------------------------------------------------------------------
export function libraryTargets(blueprints = loadBlueprints()) {
  const active = activeBlueprints(blueprints);
  const rows = [];
  for (const id of ROOM_IDS) {
    const users = active.filter((bp) => roomsOf(bp).includes(id));
    if (!users.length) continue;
    const maxOrder = Math.max(...users.map((bp) => STYLE_LEVELS[bp.maxStyleLevel].order));
    const allowed = STYLE_LEVEL_IDS.filter((l) => STYLE_LEVELS[l].order <= maxOrder);
    const levels = ROOMS[id].kind === "workflow" ? allowed.filter((l) => V1_WORKFLOW_LEVELS.includes(l)) : allowed;
    rows.push({ room: id, kind: ROOMS[id].kind, websiteTypes: users.map((b) => b.id), levels });
  }
  return { rows, total: rows.reduce((n, r) => n + r.levels.length, 0) };
}
