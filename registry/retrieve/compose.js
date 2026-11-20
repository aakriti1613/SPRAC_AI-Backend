// Compose the set of components for one site: for every room the site needs,
// pick the best VERIFIED component at or below the chosen style level, preferring
// higher levels. Then check the whole set fits together. This is the "ranking a
// combination that works", not one part at a time.
import { currentLabel } from "../pipeline.js";
import { checkComponent, checkSet, roomsForWebsiteType } from "./compat.js";
import { levelsUpTo } from "../../sparc/styleLevels.js";

/**
 * records     stored component records (file/supabase store .list())
 * websiteType "portfolio" | "landing" | "admin-portal"
 * styleLevel  wanted level (clamped to the website type's maximum)
 * enabledOptional  optional room ids switched on
 * Returns { styleLevel, picks: { room -> {slug, source, level, label} }, missing, problems }
 */
export function composeSite(records, { websiteType, styleLevel, enabledOptional = [] }) {
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
        // Prefer the plain "sparc" component; otherwise the first by slug (stable).
        chosen = candidates.find((c) => c.slug.endsWith("/sparc")) || [...candidates].sort((a, b) => a.slug.localeCompare(b.slug))[0];
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

  return { websiteType, styleLevel: level, picks, missing, problems, ok: problems.length === 0 && missing.length === 0 };
}

/** A reproducibility lock: exactly which component version fills each room. */
export function lockFromComposition(composition) {
  const components = {};
  for (const [room, p] of Object.entries(composition.picks)) {
    components[room] = { slug: p.slug, source: p.source, version: p.label.version, hash: p.label.source?.contentHash, level: p.level };
  }
  return { websiteType: composition.websiteType, styleLevel: composition.styleLevel, components };
}
