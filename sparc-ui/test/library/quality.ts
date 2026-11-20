// Shared helpers for the library quality checks (size + accessibility).
// Results are written to library/quality.*.json, which the backend registry
// reads when it labels components (Phase 3). Re-generate with:
//   npm run library:measure
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

export const LIBRARY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "library");
export const WRITE = process.env.WRITE_QUALITY === "1";

/** Every component folder: library/<room>/<level>/<id>/index.tsx */
export function discoverComponents(): { key: string; room: string; level: string; id: string; file: string }[] {
  const out = [];
  for (const room of fs.readdirSync(LIBRARY_DIR).sort()) {
    if (room.startsWith("_") || !fs.statSync(path.join(LIBRARY_DIR, room)).isDirectory()) continue;
    for (const level of fs.readdirSync(path.join(LIBRARY_DIR, room)).sort()) {
      for (const id of fs.readdirSync(path.join(LIBRARY_DIR, room, level)).sort()) {
        const file = path.join(LIBRARY_DIR, room, level, id, "index.tsx");
        if (fs.existsSync(file)) out.push({ key: `${room}/${level}/${id}`, room, level, id, file });
      }
    }
  }
  return out;
}

/** Write the report (WRITE_QUALITY=1) or check the committed one is still true. */
export function saveOrCompare(name: string, report: Record<string, unknown>) {
  const file = path.join(LIBRARY_DIR, `quality.${name}.json`);
  const sorted = Object.fromEntries(Object.entries(report).sort(([a], [b]) => a.localeCompare(b)));
  const text = `${JSON.stringify(sorted, null, 2)}\n`;
  if (WRITE) {
    fs.writeFileSync(file, text);
    return;
  }
  expect(fs.existsSync(file), `${path.basename(file)} is missing — run: npm run library:measure`).toBe(true);
  expect(JSON.parse(fs.readFileSync(file, "utf8")), `${path.basename(file)} is out of date — run: npm run library:measure`).toEqual(sorted);
}
