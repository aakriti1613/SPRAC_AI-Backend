// One importer, many adapters. For every item an adapter returns:
//   label (CDL + trust) -> dedupe by content hash -> store (immutable versions)
// Items that fail never stop the run; they are recorded as errors.
// Components that disappeared from their source are marked "deprecated".
import crypto from "node:crypto";
import { activeBlueprints, loadBlueprints } from "../sparc/index.js";
import { buildLabel, websiteTypesFor } from "./label.js";

export async function runIngest({ adapter, store, ctx = {}, blueprints = loadBlueprints(), now = () => new Date() }) {
  const runId = `${adapter.name}-${now().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
  const run = {
    runId,
    source: adapter.name,
    startedAt: now().toISOString(),
    finishedAt: null,
    seen: 0,
    added: 0,
    newVersion: 0,
    updated: 0,
    unchanged: 0,
    deprecated: 0,
    failed: 0,
    trust: { verified: 0, candidate: 0, deprecated: 0 },
    errors: [],
  };

  let items = [];
  try {
    items = await adapter.collect(ctx);
  } catch (e) {
    run.errors.push({ ref: adapter.name, stage: "collect", message: e.message });
    run.failed += 1;
  }

  const seenSlugs = new Set();
  for (const item of items) {
    const ref = item.slug ?? "(unknown)";
    try {
      if (item.error) throw Object.assign(new Error(item.error), { stage: item.stage ?? "fetch" });
      if (seenSlugs.has(item.slug)) {
        throw Object.assign(new Error(`the source returned "${item.slug}" twice in one run; the second copy was not stored`), { stage: "dedupe" });
      }
      const { label, trust, problems } = buildLabel(item, blueprints);
      if (trust === "invalid") throw Object.assign(new Error(problems.join("; ")), { stage: "validate" });
      run.seen += 1;
      seenSlugs.add(item.slug);
      run.trust[trust] = (run.trust[trust] ?? 0) + 1;

      const existing = await store.get(adapter.name, item.slug);
      const record = existing
        ? structuredClone(existing)
        : { slug: item.slug, source: adapter.name, name: label.name, kind: label.kind, versions: {} };
      const isNewVersion = !record.versions[item.contentHash];
      if (isNewVersion) record.versions[item.contentHash] = { label: { ...label, quality: undefined, trust: undefined }, firstSeenRun: runId };
      Object.assign(record, {
        name: label.name,
        kind: label.kind,
        room: label.room,
        styleLevel: label.styleLevel,
        trust,
        problems,
        exceptions: item.exceptions ?? [],
        current: item.contentHash,
        quality: label.quality,
      });
      const written = await store.put(record);
      if (!existing) run.added += 1;
      else if (isNewVersion) run.newVersion += 1;
      else if (written) run.updated += 1;
      else run.unchanged += 1;
    } catch (e) {
      run.failed += 1;
      run.errors.push({ ref, stage: e.stage ?? "label", message: e.message });
    }
  }

  // Anything this source no longer provides is deprecated (kept for old builds' lockfiles).
  if (!run.errors.some((e) => e.stage === "collect")) {
    for (const record of await store.list(adapter.name)) {
      if (seenSlugs.has(record.slug) || record.trust === "deprecated") continue;
      await store.put({ ...record, trust: "deprecated", problems: ["no longer found at the source"] });
      run.deprecated += 1;
    }
  }

  run.finishedAt = now().toISOString();
  await store.logRun(run);
  return run;
}

let ACTIVE_BLUEPRINTS = null;

/**
 * Which website types may use one of OUR components is decided by the blueprints,
 * not by the component's source. A new website type can start using an old, unchanged
 * component (same source hash, so no new version), so the stored list can be out of
 * date. For our own library we therefore read it fresh from the blueprints.
 */
function liveWebsiteTypes(record, stored) {
  if (record.source !== "own-library" || record.kind !== "component" || !record.room) return stored;
  ACTIVE_BLUEPRINTS ??= activeBlueprints();
  return websiteTypesFor(record.room, record.styleLevel, ACTIVE_BLUEPRINTS);
}

/** A stored record's current label with its latest trust, quality and website types filled in. */
export function currentLabel(record) {
  const v = record.versions[record.current];
  if (!v) return null;
  return {
    ...v.label,
    websiteTypes: liveWebsiteTypes(record, v.label.websiteTypes),
    trust: record.trust === "deprecated" ? "deprecated" : record.trust,
    quality: record.quality ?? {},
  };
}
