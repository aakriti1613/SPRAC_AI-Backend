// Adapters for shadcn-format registries: shadcn/ui itself, Magic UI and
// Aceternity UI all publish a registry.json with the same item shape
// (name, type, dependencies, registryDependencies, files, categories).
// Metadata comes straight from the registry (no guessing). Candidates only.
import { contentHash } from "../analyze/rules.js";

export const SHADCN_REGISTRY = "https://ui.shadcn.com/r/styles/new-york-v4/registry.json";
export const MAGICUI_REGISTRY = "https://magicui.design/r/registry.json";
export const ACETERNITY_REGISTRY = "https://ui.aceternity.com/registry.json";

const ADMIN_ROOMS = new Set(["login", "signup", "app-frame", "file-upload", "confirm-dialog", "notifications", "data-table"]);

/** "recharts@3.8.0" -> ["recharts", "3.8.0"]; "@scope/pkg@^1" -> ["@scope/pkg", "^1"] */
export function splitDep(dep) {
  const at = dep.lastIndexOf("@");
  return at > 0 ? [dep.slice(0, at), dep.slice(at + 1) === "latest" ? "*" : dep.slice(at + 1)] : [dep, "*"];
}

/** Room a shadcn block can fill, from its name / categories. */
export function shadcnRoom(item) {
  const name = item.name;
  const cats = item.categories ?? [];
  if (/^login-/.test(name) || cats.includes("login")) return "login";
  if (/^signup-/.test(name) || cats.includes("signup")) return "signup";
  if (/^(dashboard|sidebar)-/.test(name) || cats.includes("dashboard") || cats.includes("sidebar")) return "app-frame";
  return undefined;
}

/** Name patterns shared by the animated-component registries (Magic UI, Aceternity). */
const ROOM_PATTERNS = [
  [/(^|-)(floating-navbar|navbar|resizable-navbar|floating-dock|dock)($|-)/, "navbar"],
  [/(^|-)footer($|-)/, "footer"],
  [/(^|-)(hero|lamp|aurora-background|wavy-background|background-gradient-animation|spotlight)($|-)/, "hero"],
  [/(^|-)(number-ticker|stats?|animated-circular-progress-bar)($|-)/, "stats"],
  [/(^|-)(bento-grid|card-hover-effect|focus-cards|features?|magic-card)($|-)/, "services"],
  [/(^|-)(animated-testimonials|infinite-moving-cards|testimonials?|tweet-card|marquee)($|-)/, "testimonials"],
  [/(^|-)(timeline|tracing-beam)($|-)/, "experience"],
  [/(^|-)(3d-card|apple-cards-carousel|card-stack|parallax-scroll|direction-aware-hover|glare-card|evervault-card|expandable-card|neon-gradient-card)($|-)/, "projects"],
  [/(^|-)(pricing)($|-)/, "pricing"],
  [/(^|-)(faq)($|-)/, "faq"],
  [/(^|-)(team|avatar-circles)($|-)/, "team"],
  [/(^|-)(images-slider|layout-grid|gallery)($|-)/, "gallery"],
  [/(^|-)(world-map|globe|dotted-map)($|-)/, "location-map"],
  [/(^|-)(cta)($|-)/, "cta-banner"],
  [/(^|-)(contact)($|-)/, "contact-form"],
  [/(^|-)(login|sign-?in)($|-)/, "login"],
  [/(^|-)(sign-?up|register)($|-)/, "signup"],
  [/(^|-)(sidebar)($|-)/, "app-frame"],
  [/(^|-)(file-upload)($|-)/, "file-upload"],
  [/(^|-)(animated-modal)($|-)/, "confirm-dialog"],
  [/(^|-)(animated-list)($|-)/, "notifications"],
];

export function patternRoom(name) {
  for (const [re, room] of ROOM_PATTERNS) if (re.test(name)) return room;
  return undefined;
}

/**
 * Generic shadcn-format registry adapter.
 * options: { name, registryUrl, itemUrl(name), license, keepTypes, roomFor(item), levelFor(item, room) }
 */
export function registryAdapter({ fetchJson, name, registryUrl, itemUrl, license, keepTypes, roomFor, levelFor, ownUiNames = [], tagFor = () => [] }) {
  const own = new Set(ownUiNames);
  return {
    name,
    async collect() {
      const registry = await fetchJson(registryUrl);
      const kept = (registry.items ?? []).filter((i) => keepTypes.has(i.type));
      // Some registries reuse a name for a ui part AND a block (e.g. Aceternity "background-lines"):
      // give every such item its type in the slug, so neither silently replaces the other.
      const nameCount = new Map();
      for (const i of kept) nameCount.set(i.name, (nameCount.get(i.name) ?? 0) + 1);
      const slugOf = (i) => (nameCount.get(i.name) > 1 ? `${i.name}--${i.type.replace("registry:", "")}` : i.name);
      return kept.map((item) => {
          const npm = {};
          const reg = new Set((item.registryDependencies ?? []).map((d) => `${name}:${d.replace(/^https?:\/\/[^ ]*\/r\/(?:styles\/[^/]+\/)?/, "").replace(/\.json$/, "")}`));
          for (const dep of item.dependencies ?? []) {
            if (dep === "cn") reg.add(`${name}:utils`); // the class-merge helper, not an npm package
            else {
              const [n, r] = splitDep(dep);
              npm[n] = r;
            }
          }
          const room = roomFor(item);
          const level = room ? levelFor(item, room, npm) : undefined;
          const meta = { name: item.name, type: item.type, dependencies: item.dependencies, registryDependencies: item.registryDependencies, files: (item.files ?? []).map((f) => f.path) };
          return {
            idPrefix: name,
            slug: slugOf(item),
            version: "0.0.0",
            name: item.title ?? item.name,
            kind: room ? "component" : "ui",
            room,
            roomBy: "registry",
            styleLevel: level,
            summary: (item.description || `${name} ${item.type.replace("registry:", "")} "${item.name}".`).slice(0, 200),
            source: { type: "shadcn", url: itemUrl(item.name), ref: name },
            contentHash: contentHash([{ path: `${name}/${item.name}.json`, content: JSON.stringify(meta) }]),
            requires: { npm, peer: {}, registry: [...reg].sort(), env: [] },
            requiresBy: "registry",
            compat: { tailwind: "4", language: "ts" },
            facets: {
              category: item.type === "registry:block" ? "block" : room ? "section" : "primitive",
              tags: [...(item.categories ?? []), ...tagFor(item, npm), ...(own.has(item.name) ? ["also-in:crud-modern-new-temp"] : [])],
            },
            license,
            licenseBy: license === "UNKNOWN" ? "registry" : "human",
            eligibleForVerified: false,
            notes: room ? ["props not analysed yet (fetch item files + parse during promotion)"] : [],
          };
        });
    },
  };
}

export function shadcnAdapter({ fetchJson, ownUiNames = [] }) {
  return registryAdapter({
    fetchJson,
    name: "shadcn",
    registryUrl: SHADCN_REGISTRY,
    itemUrl: (n) => `https://ui.shadcn.com/r/styles/new-york-v4/${n}.json`,
    license: "MIT",
    keepTypes: new Set(["registry:ui", "registry:block"]),
    roomFor: (item) => (item.type === "registry:block" ? shadcnRoom(item) : undefined),
    levelFor: () => "good", // shadcn blocks are listed as Good-level sources
    ownUiNames,
  });
}

const WOW_DEPS = ["three", "@react-three/fiber", "cobe", "@tsparticles/react", "simplex-noise"];

export function magicUiAdapter({ fetchJson }) {
  return registryAdapter({
    fetchJson,
    name: "magicui",
    registryUrl: MAGICUI_REGISTRY,
    itemUrl: (n) => `https://magicui.design/r/${n}.json`,
    license: "MIT", // github.com/magicuidesign/magicui is MIT licensed
    keepTypes: new Set(["registry:ui"]),
    roomFor: (item) => patternRoom(item.name),
    levelFor: (item, room, npm) => (WOW_DEPS.some((d) => d in npm) && !ADMIN_ROOMS.has(room) ? "astonishing" : "amazing"),
    tagFor: (item, npm) => ["animated", ...("motion" in npm || "framer-motion" in npm ? ["motion"] : [])],
  });
}

export function aceternityAdapter({ fetchJson }) {
  return registryAdapter({
    fetchJson,
    name: "aceternity",
    registryUrl: ACETERNITY_REGISTRY,
    itemUrl: (n) => `https://ui.aceternity.com/registry/${n}.json`,
    license: "UNKNOWN", // the registry declares no license: never reusable until the terms are checked by a person
    keepTypes: new Set(["registry:ui", "registry:block", "registry:component"]),
    roomFor: (item) => patternRoom(item.name),
    levelFor: (item, room) => (ADMIN_ROOMS.has(room) ? "amazing" : item.type === "registry:block" ? "amazing" : "astonishing"),
    tagFor: () => ["animated"],
  });
}
