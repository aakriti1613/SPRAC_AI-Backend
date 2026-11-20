// Adapter: npm packages, metadata only (never installed or executed).
// Curated searches per room; downloads, license, peer deps and types are
// recorded so people can find and compare options. Candidates only.
import { contentHash } from "../analyze/rules.js";

// npm's search ranks by text match and ignores popularity, and long phrases
// return junk (e.g. "animated hero section" -> an OTP input). So queries are
// short component nouns, and results must (1) really mention the noun,
// (2) not be React Native, (3) have real usage. Hero/landing sections are not
// npm packages; they come from copy-paste registries (Magic UI etc.) later.
export const NPM_QUERIES = [
  { text: "react table", room: "data-table", match: /table|grid/i },
  { text: "react datepicker", room: "form-field", match: /date/i },
  { text: "react dropzone", room: "file-upload", match: /drop|upload|file/i },
  { text: "react chart", room: "dashboard-chart", match: /chart|graph|plot/i },
  { text: "react toast", room: "notifications", match: /toast|notif/i },
  { text: "react select", room: "form-field", match: /select|combobox|dropdown/i },
  { text: "react dialog", room: "confirm-dialog", match: /dialog|modal/i },
];

const SEARCH_URL = (text, size) => `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=${size}`;
const LATEST_URL = (name) => `https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`;

/** Keep only results that are relevant and actually used. */
export function relevant(obj, query, minMonthly) {
  const p = obj.package ?? {};
  const text = `${p.name} ${p.description ?? ""} ${(p.keywords ?? []).join(" ")}`;
  if (/react-native|\breact native\b/i.test(text)) return false;
  if (String(p.name).startsWith("@types/")) return false; // type definitions, not components
  if ((obj.downloads?.monthly ?? 0) < minMonthly) return false;
  return query.match ? query.match.test(text) : true;
}

export function npmAdapter({ fetchJson, queries = NPM_QUERIES, perQuery = 5, fetchSize = 10, minMonthly = 1000 }) {
  return {
    name: "npm",
    async collect() {
      const found = new Map();
      for (const q of queries) {
        const res = await fetchJson(SEARCH_URL(q.text, fetchSize));
        const keep = (res.objects ?? [])
          .filter((o) => o.package?.name && relevant(o, q, minMonthly))
          .sort((a, b) => (b.downloads?.monthly ?? 0) - (a.downloads?.monthly ?? 0))
          .slice(0, perQuery);
        for (const obj of keep) {
          const p = obj.package;
          if (!found.has(p.name)) found.set(p.name, { pkg: p, monthly: obj.downloads?.monthly, room: q.room, query: q.text });
        }
      }
      const items = [];
      for (const { pkg, monthly, room, query } of found.values()) {
        let latest = {};
        let error;
        try {
          latest = await fetchJson(LATEST_URL(pkg.name));
        } catch (e) {
          error = e.message;
        }
        if (error) {
          items.push({ slug: pkg.name.toLowerCase(), error, stage: "fetch" });
          continue;
        }
        const license = typeof latest.license === "string" ? latest.license : latest.license?.type ?? pkg.license ?? "UNKNOWN";
        items.push({
          idPrefix: "npm",
          slug: pkg.name.toLowerCase(),
          version: /^\d+\.\d+\.\d+/.test(latest.version ?? "") ? latest.version.replace(/[^0-9a-z.+-]/gi, "") : "0.0.0",
          name: pkg.name,
          kind: "library",
          room,
          roomBy: "registry",
          summary: (latest.description || pkg.description || `npm package ${pkg.name}`).slice(0, 200),
          source: { type: "npm", url: `https://www.npmjs.com/package/${pkg.name}`, ref: latest.version },
          contentHash: contentHash([{ path: `${pkg.name}@${latest.version}`, content: JSON.stringify({ v: latest.version, peer: latest.peerDependencies ?? {} }) }]),
          requires: { npm: {}, peer: latest.peerDependencies ?? {}, registry: [], env: [] },
          requiresBy: "registry",
          compat: { react: latest.peerDependencies?.react, language: latest.types || latest.typings ? "ts" : "js" },
          facets: { category: room, tags: [...(pkg.keywords ?? []).slice(0, 8).map(String), `query:${query}`] },
          license,
          quality: {
            downloads: monthly,
            lastPublish: pkg.date,
            hasTypes: Boolean(latest.types || latest.typings),
          },
          eligibleForVerified: false,
        });
      }
      return items;
    },
  };
}
