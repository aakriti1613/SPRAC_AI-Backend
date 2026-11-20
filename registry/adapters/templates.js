// Adapter: components inside the OLD templates (clone-and-own code from the
// prototype). They are candidates only; their labels list exactly what
// "cleaning" each one needs before it could fit a room.
import fs from "node:fs";
import path from "node:path";
import { checkSource, contentHash } from "../analyze/rules.js";
import { createProgram, extractProps, importsOf, packageName } from "../analyze/typescript.js";
import { inferLevel } from "../label.js";

/** "CurrencyInput" -> "currency-input" (CDL ids are lowercase). */
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").toLowerCase();

/** Which room a legacy component could fill, by folder + file name. */
const SECTION_ROOMS = {
  Hero: "hero", About: "about", Skills: "skills", Projects: "projects", Experience: "experience",
  Services: "services", Contact: "contact", Navbar: "navbar", Footer: "footer", Stats: "stats",
};
const WIDGET_ROOMS = { StatCard: "dashboard-stat-card", RecentList: "activity-log" };

/** fieldRegistry.ts: `currency: CurrencyInput,` -> { CurrencyInput: ["currency"] } */
function fieldTypesByComponent(registryFile) {
  const out = {};
  if (!fs.existsSync(registryFile)) return out;
  const text = fs.readFileSync(registryFile, "utf8");
  const block = text.slice(text.indexOf("export const fieldRegistry"));
  for (const m of block.matchAll(/^\s+"?([a-z-]+)"?:\s*([A-Z]\w+),/gm)) (out[m[2]] ??= []).push(m[1]);
  return out;
}

export function templatesAdapter({ templatesDir }) {
  return {
    name: "own-templates",
    async collect() {
      const items = [];

      // 1) crud-modern-new-temp: fields, widgets, ui primitives (TypeScript)
      const crud = path.join(templatesDir, "crud-modern-new-temp");
      if (fs.existsSync(crud)) {
        const pkg = JSON.parse(fs.readFileSync(path.join(crud, "package.json"), "utf8"));
        const versions = { ...pkg.dependencies, ...pkg.devDependencies };
        const groups = [
          ["fields", "form-field"],
          ["widgets", null],
          ["ui", null],
        ];
        const files = groups.flatMap(([dir]) => {
          const d = path.join(crud, "src", "components", dir);
          return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".tsx")).sort().map((f) => ({ dir, file: path.join(d, f) })) : [];
        });
        const program = createProgram(crud, files.map((f) => f.file), "tsconfig.app.json");
        const types = fieldTypesByComponent(path.join(crud, "src", "engine", "fieldRegistry.ts"));
        for (const { dir, file } of files) {
          const name = path.basename(file, ".tsx");
          const content = fs.readFileSync(file, "utf8");
          const npm = {};
          const registry = [];
          for (const { specifier, typeOnly } of importsOf(content)) {
            if (specifier.startsWith("@/")) registry.push(`crud-modern-new-temp/src/${specifier.slice(2)}`);
            else if (!specifier.startsWith(".") && !typeOnly) npm[packageName(specifier)] = versions[packageName(specifier)] ?? "*";
          }
          const room = dir === "fields" ? (types[name] ? "form-field" : undefined) : WIDGET_ROOMS[name];
          const rel = path.relative(templatesDir, file).replace(/\\/g, "/");
          items.push({
            idPrefix: "legacy",
            slug: `crud-modern-new-temp/${dir}/${kebab(name)}`,
            version: "0.1.0",
            name: `${name} (crud-modern template)`,
            kind: room ? "component" : "ui",
            room,
            styleLevel: room ? inferLevel(Object.keys(npm)) : undefined,
            summary: `${dir === "ui" ? "UI primitive" : dir === "fields" ? "Form input" : "Dashboard widget"} "${name}" from the crud-modern-new-temp template.`,
            source: { type: "own-template", url: "platform-backend-main/templates", path: rel },
            contentHash: contentHash([{ path: rel, content }]),
            props: extractProps(program, file).props,
            propsFrom: "parser",
            propsConfidence: 0.8, // template dependencies are not installed, some types stay unknown
            fieldTypes: types[name] ?? [],
            requires: { npm, peer: {}, registry: registry.sort(), env: [] },
            compat: { react: versions.react, tailwind: "4", language: "ts" },
            facets: { tags: ["legacy", dir, ...(types[name] ?? [])] },
            license: "own",
            licenseBy: "human",
            staticIssues: checkSource(rel, content),
            eligibleForVerified: false,
          });
        }
      }

      // 2) landing templates: page sections (JSX, read a config singleton instead of props)
      for (const t of ["landing-modern", "landing-temp-2"]) {
        const dir = path.join(templatesDir, t, "src", "components", "sections");
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter((f) => /\.(jsx|tsx)$/.test(f)).sort().map((f) => path.join(dir, f));
        const program = createProgram(path.join(templatesDir, t), files);
        for (const file of files) {
          const name = path.basename(file).replace(/\.(jsx|tsx)$/, "");
          const content = fs.readFileSync(file, "utf8");
          const npm = {};
          for (const { specifier } of importsOf(content)) if (!specifier.startsWith(".")) npm[packageName(specifier)] = "*";
          const rel = path.relative(templatesDir, file).replace(/\\/g, "/");
          const room = SECTION_ROOMS[name];
          items.push({
            idPrefix: "legacy",
            slug: `${t}/sections/${kebab(name)}`,
            version: "0.1.0",
            name: `${name} section (${t})`,
            kind: room ? "component" : "ui",
            room,
            styleLevel: room ? inferLevel(Object.keys(npm)) : undefined,
            summary: `Page section "${name}" from the ${t} landing template.`,
            source: { type: "own-template", url: "platform-backend-main/templates", path: rel },
            contentHash: contentHash([{ path: rel, content }]),
            props: extractProps(program, file).props,
            propsFrom: "parser",
            propsConfidence: 0.7,
            requires: { npm, peer: {}, registry: [], env: [] },
            compat: { language: "js" },
            facets: { tags: ["legacy", "section", t] },
            license: "own",
            licenseBy: "human",
            staticIssues: checkSource(rel, content),
            eligibleForVerified: false,
            notes: /templateConfig|from ["']\.\.\/\.\.\/config/.test(content)
              ? ["reads the template's config singleton instead of taking props (must be rewritten to accept its room's props)"]
              : [],
          });
        }
      }
      return items;
    },
  };
}
