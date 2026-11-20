// Turns the module library and the stored component catalogue into searchable
// documents, and builds a combined index (one embedder for both).
import { MODULE_LIBRARY } from "../../sparc/modules.js";
import { currentLabel } from "../pipeline.js";
import { buildIndex } from "./search.js";

/** A module -> search document (text from its name, summary, keywords and field labels). */
export function moduleDocument(mod) {
  const fieldText = mod.fields.map((f) => f.label).join(" ");
  return {
    id: `module:${mod.id}`,
    kind: "module",
    text: `${mod.singularName} ${mod.pluralName} ${mod.summary} ${(mod.keywords || []).join(" ")} ${fieldText}`,
    facets: { kind: "module", industry: mod.industries },
    quality: { score: 0.9 }, // curated and verified
    payload: mod,
  };
}

/** A stored component record -> search document. */
export function componentDocument(record) {
  const label = currentLabel(record);
  if (!label) return null;
  return {
    id: `component:${record.source}:${record.slug}`,
    kind: "component",
    text: `${label.name} ${label.summary} ${(label.facets?.tags || []).join(" ")} ${label.room || ""} ${(label.provides?.fieldTypes || []).join(" ")}`,
    facets: {
      kind: "component",
      room: label.room,
      styleLevel: label.styleLevel,
      trust: record.trust,
      source: record.source,
      websiteType: label.websiteTypes,
      license: label.license,
    },
    quality: { ...label.quality, picks: record.quality?.picks },
    payload: { slug: record.slug, source: record.source, trust: record.trust, label },
  };
}

/**
 * Build a search index for modules (+ optional component records), embedding each
 * document's text with the given embedder so semantic search works.
 */
export async function buildLibraryIndex({ embedder, records = [], includeModules = true } = {}) {
  const documents = [];
  if (includeModules) documents.push(...MODULE_LIBRARY.map(moduleDocument));
  for (const r of records) {
    const doc = componentDocument(r);
    if (doc) documents.push(doc);
  }
  if (embedder) {
    const vectors = await embedder.embedBatch(documents.map((d) => d.text));
    documents.forEach((d, i) => {
      d.embedding = vectors[i];
    });
  }
  const index = buildIndex(documents);
  index.embedder = embedder || null;
  return index;
}

/** Convenience: embed a query with the index's embedder (or null). */
export async function embedQuery(index, query) {
  return index.embedder ? index.embedder.embed(query) : null;
}
