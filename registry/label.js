// Builds a CDL label for one ingested item and decides its trust level.
//
// Facts (props, imports, license, field types) come from parsers or the
// source's own registry data — never from an LLM. Only items from our own
// library may become `verified`, and only if EVERY check passes:
//   CDL shape + room contract + style/package rules + license + size budget
//   + accessibility + static rules (no fixed colours, no network, no raw HTML).
// Everything else is stored as `candidate` with the reasons listed.
import { ROOMS, activeBlueprints, checkCdl, loadBlueprints, roomsOf } from "../sparc/index.js";
import { ALLOWED_LICENSES } from "../sparc/schema.js";
import { STYLE_LEVELS, levelsUpTo } from "../sparc/styleLevels.js";

/** Website types whose blueprint uses `room` and allows `level`. */
export function websiteTypesFor(room, level, blueprints) {
  if (!room || !ROOMS[room]) return [];
  return activeBlueprints(blueprints)
    .filter((bp) => roomsOf(bp).includes(room) && (!level || levelsUpTo(bp.maxStyleLevel).includes(level)))
    .map((bp) => bp.id);
}

/** Style level suggested by the packages a component uses. */
export function inferLevel(npmNames) {
  const names = new Set(npmNames);
  if (["gsap", "@gsap/react", "three", "@react-three/fiber"].some((n) => names.has(n))) return "astonishing";
  if (["framer-motion", "motion"].some((n) => names.has(n))) return "amazing";
  return "basic";
}

const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/**
 * item: {
 *   idPrefix, slug, version, name, kind, room?, styleLevel?, summary, description?,
 *   source: { type, url, path?, ref? }, contentHash,
 *   props?: [{name, kind, required}], propsFrom?: "parser" | "registry",
 *   fieldTypes?, requires?: { npm, peer, registry }, compat?, facets?, license, quality?,
 *   websiteTypes?, industries?, staticIssues?: [], eligibleForVerified?: boolean, notes?: []
 * }
 * returns { label, trust, problems }
 */
export function buildLabel(item, blueprints = loadBlueprints()) {
  const room = item.room && ROOMS[item.room] ? item.room : undefined;
  const websiteTypes = item.websiteTypes ?? (item.kind === "component" ? websiteTypesFor(room, item.styleLevel, blueprints) : []);
  const provenance = {
    summary: { by: item.summaryBy ?? "registry" },
    license: { by: item.licenseBy ?? "registry" },
    requires: { by: item.requiresBy ?? "parser" },
    trust: { by: "parser" },
  };
  if (item.props) provenance.interface = { by: item.propsFrom ?? "parser", confidence: item.propsConfidence ?? 1 };
  if (room) provenance.room = { by: item.roomBy ?? "parser" };

  const base = clean({
    cdlVersion: 1,
    id: `${item.idPrefix}:${item.slug}@${item.version}`,
    name: item.name,
    version: item.version,
    kind: item.kind,
    summary: item.summary.slice(0, 200),
    description: item.description,
    room,
    styleLevel: item.styleLevel,
    websiteTypes,
    industries: item.industries ?? [],
    source: clean({ ...item.source, contentHash: item.contentHash }),
    interface: { props: item.props ?? [] },
    provides: { fieldTypes: item.fieldTypes ?? [], capabilities: item.capabilities ?? [] },
    requires: { npm: {}, peer: {}, registry: [], env: [], ...(item.requires ?? {}) },
    compat: item.compat ?? {},
    facets: { category: item.facets?.category ?? (room ? ROOMS[room].category : undefined), tags: item.facets?.tags ?? [] },
    license: item.license || "UNKNOWN",
    quality: clean(item.quality ?? {}),
    trust: "candidate",
    provenance,
  });

  const problems = [];
  const shape = checkCdl(base, blueprints);
  if (!shape.ok) return { label: base, trust: "invalid", problems: shape.errors };

  if (!ALLOWED_LICENSES.includes(base.license)) problems.push(`license "${base.license}" is not allowed for reuse in builds`);
  for (const issue of item.staticIssues ?? []) problems.push(`${issue.rule}: ${issue.message} (${issue.file}:${issue.line})`);
  for (const note of item.notes ?? []) problems.push(note);

  // What would stop this item from being verified? (also useful for candidates: the "cleaning" to-do list)
  if (base.kind === "component" && room && base.styleLevel) {
    const asVerified = checkCdl({ ...base, trust: "verified" }, blueprints);
    problems.push(...asVerified.errors);
    if (base.quality.sizeKb === undefined) problems.push("size not measured (run npm run library:measure in sparc-ui)");
    if (base.quality.a11yViolations === undefined) problems.push("accessibility not checked (run npm run library:measure in sparc-ui)");
    const budget = STYLE_LEVELS[base.styleLevel]?.maxComponentKb;
    if (budget && base.quality.sizeKb > budget) problems.push(`size ${base.quality.sizeKb} KB is over the ${budget} KB budget`);
  } else if (base.kind === "component") {
    problems.push("no room/style level, so it cannot be placed in a build");
  }

  const uniq = [...new Set(problems)];
  const trust = item.eligibleForVerified && uniq.length === 0 ? "verified" : "candidate";
  if (!item.eligibleForVerified) uniq.unshift("external or legacy source: never auto-built (needs adapter + review to be promoted)");
  const label = { ...base, trust, provenance: { ...base.provenance, trust: { by: "parser" } } };
  const final = checkCdl(label, blueprints);
  if (!final.ok) return { label, trust: "invalid", problems: final.errors };
  return { label, trust, problems: uniq };
}
