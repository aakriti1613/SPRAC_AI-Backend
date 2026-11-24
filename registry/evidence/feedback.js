// Turns what happened in a build (and what the user changed in the builder) into
// evidence events. Only our own checks and the user's own choices produce events;
// an LLM never does.
import { contextKey, requestWords } from "./model.js";

export const moduleItemId = (id) => `module:${id}`;
export const componentItemId = (source, slug) => `component:${source}:${slug}`;
export const moduleContext = (industry) => ({ websiteType: "admin-portal", industry: industry || "generic", room: "module", styleLevel: "any" });

/**
 * config        the config that was built
 * picks         composition.picks: { room: { slug, source, level } }
 * checks        verify.checklist.checks: [{ name, pass }]
 * buildOk       false when the real build failed (undefined when it was skipped)
 * plannedModuleIds  modules the planner suggested (when the user edited the plan in the builder)
 * description   the user's request (its words are learned on positive events)
 */
export function eventsFromBuild({ config, picks = {}, checks = [], buildOk, plannedModuleIds, description = "", at = new Date().toISOString() }) {
  const events = [];
  const words = requestWords(description);
  const failed = checks.filter((c) => !c.pass).map((c) => c.name);
  const overallFail = buildOk === false;
  const industry = config.industry || "generic";

  // Components: did the site pass its checks with this component in this room?
  for (const [room, p] of Object.entries(picks)) {
    const own = failed.filter((name) => name.includes(`"${room}"`));
    const outcome = own.length || overallFail ? "fail" : "pass";
    events.push({
      at,
      itemId: componentItemId(p.source, p.slug),
      context: { websiteType: config.websiteType, industry, room, styleLevel: p.level },
      outcome,
      ...(outcome === "fail" ? { reason: own[0] ?? "build failed" } : {}),
      words,
    });
  }

  // Modules (admin portals): built ok, and what the user kept, removed or added.
  if (config.websiteType === "admin-portal") {
    const final = (config.modules || []).map((m) => m.id);
    const ctx = moduleContext(industry);
    for (const id of final) {
      const own = failed.filter((name) => name.includes(`"${id}"`) || name.startsWith(`${id}.`));
      events.push(own.length || overallFail ? { at, itemId: moduleItemId(id), context: ctx, outcome: "fail", reason: own[0] ?? "build failed", words } : { at, itemId: moduleItemId(id), context: ctx, outcome: "pass", words });
    }
    if (Array.isArray(plannedModuleIds)) {
      const planned = new Set(plannedModuleIds);
      const finalSet = new Set(final);
      for (const id of planned) events.push({ at, itemId: moduleItemId(id), context: ctx, outcome: finalSet.has(id) ? "kept" : "removed", words });
      for (const id of finalSet) if (!planned.has(id)) events.push({ at, itemId: moduleItemId(id), context: ctx, outcome: "added", words });
    }
  }
  return events;
}

/** Events when a user picks a component from the suggestions (top 3) for a room. */
export function eventsFromChoice({ websiteType, industry, room, styleLevel, chosen, description = "", at = new Date().toISOString() }) {
  return [{ at, itemId: componentItemId(chosen.source, chosen.slug), context: { websiteType, industry: industry || "generic", room, styleLevel }, outcome: "chosen", words: requestWords(description) }];
}

export { contextKey };
