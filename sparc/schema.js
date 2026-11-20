// Shapes of SPARC data files, checked with zod:
//   - blueprintSchema : sparc/blueprints/*.json
//   - cdlSchema       : the CDL "label" every library component gets (Phase 3 stores these)
// Cross-file rules (room exists, style allowed for the website type…) live in
// sparc/index.js, because they need the catalogue.
import { z } from "zod";
import { FIELD_TYPE_NAMES } from "../lib/fieldTypes.js";
import { PORTAL_INDUSTRIES } from "../lib/portalConfig.js";
import { STYLE_LEVEL_IDS } from "./styleLevels.js";

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase-with-dashes");
const industry = z.enum(PORTAL_INDUSTRIES);
const styleLevel = z.enum(STYLE_LEVEL_IDS);

// ---------------------------------------------------------------------------
// Blueprint
// ---------------------------------------------------------------------------
const pageSchema = z
  .object({
    id: slug,
    path: z.string().regex(/^(\/[a-z0-9:/-]*|\*)$/, "path like /, /login, /:module/:id or *"),
    title: z.string().min(1),
    rooms: z.array(slug).min(1),
    repeat: z.enum(["per-module"]).optional(),
    when: slug.optional(), // page exists only if this optional room is switched on
  })
  .strict();

const roomListsSchema = z
  .object({
    required: z.array(slug).min(1),
    optional: z.array(slug).default([]),
    defaultOn: z.array(slug).default([]),
  })
  .strict();

const blueprintBase = {
  id: slug,
  name: z.string().min(1),
  description: z.string().min(10),
  release: z.enum(["v1", "v2"]),
  audience: z.string().min(1),
  industryBased: z.boolean(),
  industries: z.array(industry),
  maxStyleLevel: styleLevel,
  configFile: z.string().regex(/^[a-z-]+\.json$/),
  existingTemplates: z.array(slug),
};

export const activeBlueprintSchema = z
  .object({
    ...blueprintBase,
    status: z.literal("active"),
    rooms: roomListsSchema,
    industryDefaults: z.partialRecord(industry, z.array(slug)).default({}),
    modulesFrom: z.string().optional(),
    pages: z.array(pageSchema).min(1),
  })
  .strict();

export const plannedBlueprintSchema = z
  .object({
    ...blueprintBase,
    status: z.literal("planned"),
    plannedRooms: z.object({ required: z.array(slug).min(1), optional: z.array(slug).default([]) }).strict(),
    notes: z.string().optional(),
  })
  .strict();

export const blueprintSchema = z.discriminatedUnion("status", [activeBlueprintSchema, plannedBlueprintSchema]);

// ---------------------------------------------------------------------------
// CDL v1 — the label of one library item
// ---------------------------------------------------------------------------
export const COARSE_KINDS = ["string", "number", "boolean", "array", "object", "function", "node", "any", "unknown"];

export const TRUST_LEVELS = ["verified", "candidate", "deprecated"];

/** Licenses a component must have to be `verified` (reusable in builds). */
export const ALLOWED_LICENSES = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "own"];

/** CDL fields an LLM is never allowed to fill (they must come from parsers, registries or people). */
export const FACT_FIELDS = ["trust", "room", "styleLevel", "interface", "requires", "license", "compat", "provides"];

const provenanceEntry = z
  .object({
    by: z.enum(["parser", "registry", "llm", "human"]),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export const cdlSchema = z
  .object({
    cdlVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9:._@/-]*$/, "lowercase id, e.g. own:crud-modern/currency-input@1.0.0"),
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+([-+].+)?$/, "semver, e.g. 1.0.0"),
    kind: z.enum(["template", "component", "ui", "library"]),
    summary: z.string().min(5).max(200),
    description: z.string().optional(),

    // Where it fits (required for kind "component", checked in sparc/index.js)
    room: slug.optional(),
    styleLevel: styleLevel.optional(),
    websiteTypes: z.array(slug).default([]),
    industries: z.array(industry).default([]), // empty = any industry

    source: z
      .object({
        type: z.enum(["own-template", "shadcn", "npm", "github", "storybook", "upload"]),
        url: z.string().min(1),
        path: z.string().optional(),
        ref: z.string().optional(), // commit, npm version…
        contentHash: z.string().regex(/^[a-f0-9]{64}$/, "sha256 hex").optional(),
      })
      .strict(),

    interface: z
      .object({
        props: z
          .array(
            z
              .object({
                name: z.string().min(1),
                kind: z.enum(COARSE_KINDS),
                required: z.boolean(),
              })
              .strict()
          )
          .default([]),
      })
      .strict()
      .default({ props: [] }),

    provides: z
      .object({
        fieldTypes: z.array(z.enum(FIELD_TYPE_NAMES)).default([]),
        capabilities: z.array(z.string().regex(/^[a-z0-9.-]+$/)).default([]),
      })
      .strict()
      .default({ fieldTypes: [], capabilities: [] }),

    requires: z
      .object({
        npm: z.record(z.string(), z.string()).default({}),
        peer: z.record(z.string(), z.string()).default({}),
        registry: z.array(z.string()).default([]),
        env: z.array(z.string()).default([]),
      })
      .strict()
      .default({ npm: {}, peer: {}, registry: [], env: [] }),

    compat: z
      .object({
        react: z.string().optional(),
        tailwind: z.string().optional(),
        language: z.enum(["ts", "js"]).optional(),
      })
      .strict()
      .default({}),

    facets: z
      .object({
        category: z.string().optional(),
        tags: z.array(z.string()).default([]),
      })
      .strict()
      .default({ tags: [] }),

    license: z.string().min(1),

    quality: z
      .object({
        downloads: z.number().int().nonnegative().optional(),
        stars: z.number().int().nonnegative().optional(),
        lastPublish: z.string().optional(),
        hasTypes: z.boolean().optional(),
        hasTests: z.boolean().optional(),
        sizeKb: z.number().nonnegative().optional(),
        lighthouse: z.number().min(0).max(100).optional(),
        a11yViolations: z.number().int().nonnegative().optional(),
      })
      .strict()
      .default({}),

    trust: z.enum(TRUST_LEVELS),
    provenance: z.record(z.string(), provenanceEntry).default({}),
  })
  .strict();
