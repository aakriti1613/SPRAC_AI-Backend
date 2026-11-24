// File store for evidence: an append-only event log plus numbered snapshots.
//
//   <dir>/events.jsonl        every feedback event, one JSON per line (the audit log)
//   <dir>/snapshots/v<N>.json the folded evidence after update N
//   <dir>/current.json        which snapshot is in use ({ version })
//
// Builds read a snapshot and write its version into sparc.lock.json, so a build can
// be repeated with exactly the evidence it used. update() runs BETWEEN builds.
// rollback(version) points back to an earlier snapshot (nothing is deleted).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_SNAPSHOT, SETTINGS, foldEvents, validateEvent } from "./model.js";

export const DEFAULT_EVIDENCE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");

export function createEvidenceStore(dir = process.env.SPARC_EVIDENCE_DIR || DEFAULT_EVIDENCE_DIR) {
  const eventsFile = path.join(dir, "events.jsonl");
  const snapDir = path.join(dir, "snapshots");
  const currentFile = path.join(dir, "current.json");
  const readJson = (f, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      return fallback;
    }
  };
  const versions = () =>
    fs.existsSync(snapDir)
      ? fs
          .readdirSync(snapDir)
          .map((f) => /^v(\d+)\.json$/.exec(f)?.[1])
          .filter(Boolean)
          .map(Number)
          .sort((a, b) => a - b)
      : [];

  return {
    dir,
    /** Append valid events; invalid ones are returned, not stored. */
    record(events) {
      const bad = [];
      const good = [];
      for (const e of events) (validateEvent(e).length ? bad : good).push(e);
      if (good.length) {
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(eventsFile, good.map((e) => JSON.stringify(e)).join("\n") + "\n");
      }
      return { stored: good.length, rejected: bad };
    },
    events() {
      if (!fs.existsSync(eventsFile)) return [];
      return fs
        .readFileSync(eventsFile, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null; // a damaged line is skipped, never trusted
          }
        })
        .filter(Boolean);
    },
    /** Fold every event into a new snapshot and make it current. */
    update({ now = new Date() } = {}) {
      const events = this.events();
      const folded = foldEvents(events, { now });
      const version = (versions().at(-1) ?? 0) + 1;
      const snapshot = { version, createdAt: new Date(now).toISOString(), events: events.length, settings: SETTINGS, ...folded };
      fs.mkdirSync(snapDir, { recursive: true });
      fs.writeFileSync(path.join(snapDir, `v${version}.json`), `${JSON.stringify(snapshot)}\n`);
      fs.writeFileSync(currentFile, `${JSON.stringify({ version })}\n`);
      return snapshot;
    },
    /** The current snapshot, or a given version (for rebuilding from a lock). Empty when there is none. */
    load(version) {
      const v = version ?? readJson(currentFile, null)?.version;
      if (!v) return EMPTY_SNAPSHOT;
      return readJson(path.join(snapDir, `v${v}.json`), EMPTY_SNAPSHOT);
    },
    versions,
    /** Use an earlier snapshot again (e.g. after a bad batch of feedback). */
    rollback(version) {
      if (!versions().includes(Number(version))) throw new Error(`no evidence snapshot v${version}`);
      fs.writeFileSync(currentFile, `${JSON.stringify({ version: Number(version) })}\n`);
      return this.load();
    },
  };
}
