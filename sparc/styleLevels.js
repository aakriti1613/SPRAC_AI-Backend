// SPARC AI style levels. Each level has rules a machine can check, so "Amazing"
// is not just an opinion. Phase 3 (library) uses these rules to accept or
// reject components; Phase 5 uses the budgets when testing generated sites.
//
// Budgets are starting values, to be tuned once real components are measured.
//
//   allowedPackages  - npm packages a component at this level MAY import
//                      (on top of BASE_PACKAGES every level may use)
//   motion           - "none" | "css" (transitions/keyframes) | "js" (animation libraries)
//   reducedMotion    - component must respect prefers-reduced-motion
//   maxComponentKb   - gzipped JS budget for one component incl. its own deps
//   minLighthouse    - performance score the whole generated site must reach
export const BASE_PACKAGES = Object.freeze([
  "react",
  "react-dom",
  "lucide-react",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
  "radix-ui",
]);

export const STYLE_LEVELS = Object.freeze({
  basic: {
    order: 1,
    label: "Basic",
    summary: "Clean, flat and simple. No animation.",
    allowedPackages: [],
    motion: "none",
    reducedMotion: false,
    maxComponentKb: 15,
    minLighthouse: 90,
    sources: ["shadcn/ui", "own templates"],
  },
  good: {
    order: 2,
    label: "Good",
    summary: "Polished: shadows, hover effects, smooth CSS transitions.",
    allowedPackages: [],
    motion: "css",
    reducedMotion: true,
    maxComponentKb: 20,
    minLighthouse: 90,
    sources: ["shadcn blocks", "Tremor", "own templates"],
  },
  amazing: {
    order: 3,
    label: "Amazing",
    summary: "Smooth animations and gradients.",
    allowedPackages: ["framer-motion", "motion"],
    motion: "js",
    reducedMotion: true,
    maxComponentKb: 60,
    minLighthouse: 80,
    sources: ["Magic UI", "Aceternity UI (free items)"],
  },
  astonishing: {
    order: 4,
    label: "Astonishing",
    summary: "Wow effects: 3D, glow, moving backgrounds.",
    allowedPackages: ["framer-motion", "motion", "gsap", "@gsap/react"],
    motion: "js",
    reducedMotion: true,
    maxComponentKb: 150,
    minLighthouse: 70,
    sources: ["Aceternity UI", "Magic UI", "GSAP effects"],
  },
});

export const STYLE_LEVEL_IDS = Object.freeze(Object.keys(STYLE_LEVELS));

/** Levels from basic up to (and including) `maxLevel`. */
export function levelsUpTo(maxLevel) {
  const max = STYLE_LEVELS[maxLevel]?.order;
  if (!max) throw new Error(`unknown style level: ${maxLevel}`);
  return STYLE_LEVEL_IDS.filter((id) => STYLE_LEVELS[id].order <= max);
}

/**
 * Levels that get their own skin in V1, per room kind (plan §2.5):
 * workflow rooms start with 2 skins; visual rooms get every allowed level.
 */
export const V1_WORKFLOW_LEVELS = Object.freeze(["basic", "good"]);

/** May a component at `level` import `pkg`? */
export function packageAllowed(level, pkg) {
  const rules = STYLE_LEVELS[level];
  if (!rules) return false;
  const name = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
  return BASE_PACKAGES.includes(name) || rules.allowedPackages.includes(name);
}
