// Compatibility checks used when composing a set of components for one site.
// Catches clashes BEFORE anything is built: unknown rooms, a style level above
// the website's maximum, React/Tailwind peer ranges that disagree, and licences
// that aren't reusable. Uses the SPARC scope (rooms, blueprints, style levels).
import { ROOMS, loadBlueprints, roomsOf } from "../../sparc/index.js";
import { ALLOWED_LICENSES } from "../../sparc/schema.js";
import { STYLE_LEVELS, levelsUpTo } from "../../sparc/styleLevels.js";

// Turn a small subset of semver ("^19", ">=18", "16 || 17 || 18", "*") into a test
// over a major version number. Enough for React/Tailwind peer ranges.
function majorMatcher(range) {
  const text = String(range || "").trim();
  if (!text || text === "*" || /^latest$/i.test(text)) return () => true;
  const clauses = text.split("||").map((c) => c.trim());
  const tests = clauses.map((clause) => {
    const ge = /^>=?\s*(\d+)/.exec(clause);
    if (ge) return (n) => n >= Number(ge[1]);
    const le = /^<=?\s*(\d+)/.exec(clause);
    if (le) return (n) => n <= Number(le[1]);
    const caret = /(\d+)/.exec(clause); // ^19, ~19, 19.x, 19 -> that major
    if (caret) return (n) => n === Number(caret[1]);
    return () => true;
  });
  return (n) => tests.some((t) => t(n));
}

/** Do two peer ranges for the same package allow a common major version? */
export function rangesAgree(a, b) {
  if (!/\d/.test(String(a)) || !/\d/.test(String(b))) return true; // unknown -> don't block
  const ma = majorMatcher(a);
  const mb = majorMatcher(b);
  for (let n = 14; n <= 30; n += 1) if (ma(n) && mb(n)) return true; // a sane window of major versions
  return false;
}

/**
 * Check one chosen component (a CDL label) for a website type + style ceiling.
 * Returns a list of problems (empty = fine).
 */
export function checkComponent(label, { websiteType, maxStyleLevel } = {}) {
  const problems = [];
  if (label.room && !ROOMS[label.room]) problems.push(`unknown room "${label.room}"`);
  if (label.trust !== "verified") problems.push(`"${label.name}" is a ${label.trust}, not verified (cannot be auto-built)`);
  if (!ALLOWED_LICENSES.includes(label.license)) problems.push(`licence "${label.license}" is not reusable`);
  if (websiteType && label.websiteTypes?.length && !label.websiteTypes.includes(websiteType)) {
    problems.push(`not meant for website type "${websiteType}"`);
  }
  if (maxStyleLevel && label.styleLevel && !levelsUpTo(maxStyleLevel).includes(label.styleLevel)) {
    problems.push(`style "${label.styleLevel}" is above the maximum "${maxStyleLevel}"`);
  }
  return problems;
}

/**
 * Check a whole set of chosen labels together: peer-dependency clashes and a
 * shared React/Tailwind baseline. Returns { ok, problems }.
 */
export function checkSet(labels) {
  const problems = [];
  const peers = new Map(); // pkg -> [{ range, by }]
  for (const label of labels) {
    for (const [pkg, range] of Object.entries(label.requires?.peer || {})) {
      const list = peers.get(pkg) || [];
      list.push({ range, by: label.name });
      peers.set(pkg, list);
    }
  }
  for (const [pkg, list] of peers) {
    for (let i = 1; i < list.length; i += 1) {
      if (!rangesAgree(list[0].range, list[i].range)) {
        problems.push(`${pkg}: "${list[0].by}" wants ${list[0].range} but "${list[i].by}" wants ${list[i].range}`);
        break;
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Rooms a website type needs (required) and may have (optional). */
export function roomsForWebsiteType(websiteTypeId, blueprints = loadBlueprints()) {
  const bp = blueprints.find((b) => b.id === websiteTypeId && b.status === "active");
  if (!bp) throw new Error(`unknown or inactive website type "${websiteTypeId}"`);
  return { required: bp.rooms.required, optional: bp.rooms.optional, all: roomsOf(bp), maxStyleLevel: bp.maxStyleLevel, blueprint: bp };
}

export { STYLE_LEVELS };
