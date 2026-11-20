// Adapter: GitHub repositories, metadata only (stars, activity, license,
// topics). Archived repos are marked as such. Candidates only.
import { contentHash } from "../analyze/rules.js";

export const GITHUB_QUERIES = [
  "topic:react-components language:TypeScript stars:>2000",
  "topic:tailwindcss-components stars:>500",
];

const SEARCH_URL = (q, n) => `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=${n}`;

export function githubAdapter({ fetchJson, queries = GITHUB_QUERIES, perQuery = 10 }) {
  return {
    name: "github",
    async collect() {
      const repos = new Map();
      for (const q of queries) {
        const res = await fetchJson(SEARCH_URL(q, perQuery));
        for (const r of res.items ?? []) if (!repos.has(r.full_name)) repos.set(r.full_name, { repo: r, query: q });
      }
      return [...repos.values()].map(({ repo, query }) => ({
        idPrefix: "github",
        slug: repo.full_name.toLowerCase(),
        version: "0.0.0",
        name: repo.full_name,
        kind: "library",
        summary: (repo.description || `GitHub repository ${repo.full_name}`).slice(0, 200),
        source: { type: "github", url: repo.html_url, ref: repo.default_branch },
        contentHash: contentHash([{ path: repo.full_name, content: JSON.stringify({ pushed: repo.pushed_at, archived: repo.archived }) }]),
        requiresBy: "registry",
        facets: { category: "library", tags: [...(repo.topics ?? []).slice(0, 10), `query:${query}`] },
        license: repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : "UNKNOWN",
        quality: { stars: repo.stargazers_count, lastPublish: repo.pushed_at },
        eligibleForVerified: false,
        notes: repo.archived ? ["repository is archived (no longer maintained)"] : [],
      }));
    },
  };
}
