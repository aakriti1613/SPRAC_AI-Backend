// Compose the set of components for one site: for every room the site needs,
// pick the best VERIFIED component at or below the chosen style level, preferring
// higher levels. Then check the whole set fits together. This is the "ranking a
// combination that works", not one part at a time.
import { currentLabel } from "../pipeline.js";
import { checkComponent, checkSet, roomsForWebsiteType } from "./compat.js";
import { levelsUpTo } from "../../sparc/styleLevels.js";
import { evidenceValue, lookup } from "../evidence/model.js";
import { componentItemId } from "../evidence/feedback.js";

/**
 * records     stored component records (file/supabase store .list())
 * websiteType "portfolio" | "landing" | "admin-portal"
 * styleLevel  wanted level (clamped to the website type's maximum)
 * enabledOptional  optional room ids switched on
 * Returns { styleLevel, picks: { room -> {slug, source, level, label} }, missing, problems }
 */
export function composeSite(records, { websiteType, styleLevel, enabledOptional = [], industry = "generic", evidence = null }) {
  const { required, optional, maxStyleLevel } = roomsForWebsiteType(websiteType);
  const allowed = levelsUpTo(maxStyleLevel);
  const level = allowed.includes(styleLevel) ? styleLevel : maxStyleLevel;
  const wantLevels = levelsUpTo(level).reverse(); // prefer the highest available at/below `level`
  const neededRooms = [...required, ...optional.filter((r) => enabledOptional.includes(r))];

  // Index verified components by room+level.
  const byRoomLevel = new Map();
  for (const rec of records) {
    if (rec.trust !== "verified" || rec.kind !== "component" || !rec.room || !rec.styleLevel) continue;
    const key = `${rec.room}@${rec.styleLevel}`;
    (byRoomLevel.get(key) || byRoomLevel.set(key, []).get(key)).push(rec);
  }

  const picks = {};
  const missing = [];
  for (const room of neededRooms) {
    if (room === "form-field") {
      // Many field components together; handled by the shell's field map, not a single pick.
      continue;
    }
    let chosen = null;
    for (const lvl of wantLevels) {
      const candidates = byRoomLevel.get(`${room}@${lvl}`);
      if (candidates?.length) {
        // With evidence: the candidate that worked best in this context (tried-and-tested score, no
        // exploration, so builds stay repeatable). Without evidence, or on a tie: the plain "sparc"
        // component, then the first by slug (stable).
        const ctx = { websiteType, industry, room, styleLevel: lvl };
        const fitOf = (c) => (evidence ? evidenceValue(lookup(evidence, componentItemId(c.source, c.slug), ctx)).value : 0);
        const standard = (c) => (c.slug.endsWith("/sparc") ? 0 : 1);
        chosen = [...candidates].sort((a, b) => fitOf(b) - fitOf(a) || standard(a) - standard(b) || a.slug.localeCompare(b.slug))[0];
        break;
      }
    }
    if (chosen) picks[room] = { slug: chosen.slug, source: chosen.source, level: chosen.styleLevel, label: currentLabel(chosen) };
    else missing.push(room);
  }

  const labels = Object.values(picks).map((p) => p.label);
  const problems = [];
  for (const [room, p] of Object.entries(picks)) {
    for (const prob of checkComponent(p.label, { websiteType, maxStyleLevel })) problems.push(`${room}: ${prob}`);
  }
  problems.push(...checkSet(labels).problems);
  for (const room of missing) problems.push(`no verified component for required room "${room}"`);

  return { websiteType, styleLevel: level, picks, missing, problems, ok: problems.length === 0 && missing.length === 0, evidenceVersion: evidence?.version ?? 0 };
}

/**
 * Suggestions for one room: up to 3 verified candidates at the site's level. The first
 * two are the best by tried-and-tested score; the third place is kept for the best
 * LESS-TRIED part (exploration bonus), so a newer part always gets a fair chance.
 * Returns [{ slug, source, level, value, explore }].
 */
export function suggestForRoom(records, { websiteType, styleLevel, room, industry = "generic", evidence = null, size = 3 }) {
  const ctx = { websiteType, industry, room, styleLevel };
  const candidates = records.filter((r) => r.trust === "verified" && r.kind === "component" && r.room === room && r.styleLevel === styleLevel);
  const score = (c, explore) => evidenceValue(lookup(evidence, componentItemId(c.source, c.slug), ctx), { explore }).value;
  const byFit = [...candidates].sort((a, b) => score(b, false) - score(a, false) || a.slug.localeCompare(b.slug));
  const top = byFit.slice(0, Math.max(0, size - 1)).map((c) => ({ c, explore: false }));
  const rest = byFit.filter((c) => !top.some((t) => t.c === c)).sort((a, b) => score(b, true) - score(a, true) || a.slug.localeCompare(b.slug));
  if (rest.length) top.push({ c: rest[0], explore: true });
  return top.map(({ c, explore }) => ({ slug: c.slug, source: c.source, level: c.styleLevel, value: +score(c, explore).toFixed(3), explore }));
}

/** A reproducibility lock: exactly which component version fills each room. */
export function lockFromComposition(composition) {
  const components = {};
  for (const [room, p] of Object.entries(composition.picks)) {
    components[room] = { slug: p.slug, source: p.source, version: p.label.version, hash: p.label.source?.contentHash, level: p.level };
  }
  return { websiteType: composition.websiteType, styleLevel: composition.styleLevel, evidenceVersion: composition.evidenceVersion ?? 0, components };
}
