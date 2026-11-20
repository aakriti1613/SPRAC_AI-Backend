// Safe JSON fetch for external sources: timeout, size cap, generic user agent
// (no personal data), optional GitHub token from the server environment.
const MAX_BYTES = 5 * 1024 * 1024;

export function createFetchJson({ timeoutMs = 20000, githubToken = process.env.GITHUB_TOKEN, fetchImpl = fetch } = {}) {
  return async function fetchJson(url) {
    const headers = { Accept: "application/json", "User-Agent": "sparc-registry/0.1" };
    if (githubToken && url.startsWith("https://api.github.com/")) headers.Authorization = `Bearer ${githubToken}`;
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error(`${url} -> response larger than ${MAX_BYTES} bytes`);
    return JSON.parse(text);
  };
}

/** For tests: serve fixtures by URL (exact or by a matcher function). */
export function fixtureFetchJson(routes) {
  return async (url) => {
    for (const [match, value] of routes) {
      if (typeof match === "string" ? url === match : match(url)) {
        if (value instanceof Error) throw value;
        return structuredClone(typeof value === "function" ? value(url) : value);
      }
    }
    throw new Error(`no fixture for ${url}`);
  };
}
