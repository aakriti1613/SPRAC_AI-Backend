// File store: one JSON file per component under registry/data/<source>/<slug>.json,
// so the catalogue is reviewable in Git. Versions are immutable (keyed by
// content hash); trust, problems and quality are the latest assessment.
import fs from "node:fs";
import path from "node:path";

const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function createFileStore(dir) {
  const fileFor = (source, slug) => path.join(dir, source, `${slug.replace(/[^a-z0-9._-]+/gi, "--")}.json`);

  return {
    kind: "file",
    dir,
    async get(source, slug) {
      const f = fileFor(source, slug);
      return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
    },
    /** Writes only when the content really changed. Returns true if written. */
    async put(record) {
      const f = fileFor(record.source, record.slug);
      const text = stable(record);
      if (fs.existsSync(f) && fs.readFileSync(f, "utf8") === text) return false;
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, text);
      return true;
    },
    async list(source) {
      const sources = source ? [source] : fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()) : [];
      const out = [];
      for (const s of sources) {
        const sd = path.join(dir, s);
        if (!fs.existsSync(sd)) continue;
        for (const f of fs.readdirSync(sd).filter((x) => x.endsWith(".json")).sort()) out.push(JSON.parse(fs.readFileSync(path.join(sd, f), "utf8")));
      }
      return out;
    },
    async logRun(run) {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, "runs.jsonl"), `${JSON.stringify(run)}\n`);
    },
  };
}
