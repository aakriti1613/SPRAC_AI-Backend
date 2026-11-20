// Adapter: our own component library (sparc-ui/library/<room>/<level>/<id>/index.tsx).
// The only source whose items may become `verified` — if every check passes.
import fs from "node:fs";
import path from "node:path";
import { ROOMS } from "../../sparc/index.js";
import { STYLE_LEVELS } from "../../sparc/styleLevels.js";
import { checkSource, contentHash } from "../analyze/rules.js";
import { createProgram, extractProps, extractStringArrayExport, importsOf, packageName, resolveLocal } from "../analyze/typescript.js";

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fallback);

export function discoverLibrary(libraryDir) {
  const out = [];
  if (!fs.existsSync(libraryDir)) return out;
  for (const room of fs.readdirSync(libraryDir).sort()) {
    const roomDir = path.join(libraryDir, room);
    if (room.startsWith("_") || !fs.statSync(roomDir).isDirectory()) continue;
    for (const level of fs.readdirSync(roomDir).sort()) {
      for (const id of fs.readdirSync(path.join(roomDir, level)).sort()) {
        const file = path.join(roomDir, level, id, "index.tsx");
        if (fs.existsSync(file)) out.push({ key: `${room}/${level}/${id}`, room, level, id, file });
      }
    }
  }
  return out;
}

/** The entry file plus every local file it imports (shared helpers are part of the component). */
function localClosure(entry, root) {
  const seen = new Map();
  const visit = (file) => {
    if (seen.has(file)) return;
    const content = fs.readFileSync(file, "utf8");
    seen.set(file, content);
    for (const { specifier } of importsOf(content)) {
      if (!specifier.startsWith(".")) continue;
      const target = resolveLocal(file, specifier);
      if (target && target.startsWith(root)) visit(target);
    }
  };
  visit(entry);
  return [...seen.entries()].map(([file, content]) => ({ path: path.relative(root, file).replace(/\\/g, "/"), content, file }));
}

export function ownLibraryAdapter({ sparcUiDir }) {
  const libraryDir = path.join(sparcUiDir, "library");
  return {
    name: "own-library",
    async collect() {
      const entries = discoverLibrary(libraryDir);
      const pkg = readJson(path.join(sparcUiDir, "package.json"), {});
      const versions = { ...pkg.dependencies, ...pkg.devDependencies };
      const size = readJson(path.join(libraryDir, "quality.size.json"), {});
      const a11y = readJson(path.join(libraryDir, "quality.a11y.json"), {});
      const program = createProgram(sparcUiDir, entries.map((e) => e.file));

      return entries.map(({ key, room, level, id, file }) => {
        const files = localClosure(file, sparcUiDir);
        const exceptions = [];
        const npm = {};
        const registry = new Set();
        for (const f of files) {
          for (const { specifier, typeOnly } of importsOf(f.content)) {
            if (specifier.startsWith(".") || specifier === "@contracts") continue;
            if (specifier.startsWith("@core/")) registry.add(`sparc-ui/core/${specifier.slice(6)}`);
            else if (specifier.startsWith("@library/")) registry.add(`sparc-ui/library/${specifier.slice(9)}`);
            else if (!typeOnly) npm[packageName(specifier)] = versions[packageName(specifier)] ?? "*";
          }
        }
        for (const f of files) if (f.path.includes("/_shared/")) registry.add(f.path.replace(/\.tsx?$/, ""));
        const entrySource = files.find((f) => f.file === file).content;
        const fieldTypes = room === "form-field" ? extractStringArrayExport(entrySource, "fieldTypes") ?? [] : [];
        const meta = readJson(path.join(path.dirname(file), "meta.json"), {});
        const roomDef = ROOMS[room];
        const levelLabel = STYLE_LEVELS[level]?.label ?? level;
        return {
          idPrefix: "own",
          slug: key,
          version: "1.0.0",
          name: `${levelLabel} ${room}${id === "sparc" ? "" : ` (${id})`}`,
          kind: roomDef ? "component" : "ui",
          room,
          styleLevel: level,
          summary: roomDef ? `${levelLabel} ${room}: ${roomDef.description}` : `${levelLabel} component ${key}`,
          summaryBy: "registry",
          source: { type: "own-template", url: "platform-backend-main/sparc-ui", path: `library/${key}/index.tsx` },
          contentHash: contentHash(files),
          props: extractProps(program, file).props,
          propsFrom: "parser",
          fieldTypes,
          requires: { npm, peer: {}, registry: [...registry].sort(), env: [] },
          compat: { react: versions.react ?? ">=19", tailwind: "4", language: "ts" },
          description: meta.description,
          facets: { tags: [room, level, ...fieldTypes, ...(meta.derivedFrom ? [`derived-from:${meta.derivedFrom}`] : [])] },
          license: "own",
          licenseBy: "human",
          quality: {
            sizeKb: size[key]?.sizeKb,
            a11yViolations: a11y[key]?.a11yViolations,
            hasTypes: true,
            hasTests: true,
          },
          staticIssues: files.flatMap((f) => checkSource(f.path, f.content, { allowed: exceptions })),
          exceptions,
          eligibleForVerified: true,
        };
      });
    },
  };
}
