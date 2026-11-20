// Writes the generated SPARC files. Run: npm run sparc:generate
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderRoomTypes, renderScopeDoc } from "../sparc/generate.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const GENERATED_FILES = {
  "sparc-ui/contracts/rooms.d.ts": renderRoomTypes,
  "docs/SPARC_SCOPE.md": renderScopeDoc,
};

for (const [rel, render] of Object.entries(GENERATED_FILES)) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, render());
  console.log("wrote", rel);
}
