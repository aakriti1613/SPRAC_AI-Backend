// Supabase store: same interface as the file store, writing to the tables in
// migrations/001_registry.sql through PostgREST. Server-side only (service key).
// Env: REGISTRY_SUPABASE_URL, REGISTRY_SUPABASE_SERVICE_KEY
//
// NOTE: tested with a mocked fetch only; run it against a real registry
// project once one is created (see docs in registry/README.md).
export function createSupabaseStore({ url, serviceKey, fetchImpl = fetch }) {
  if (!url || !serviceKey) throw new Error("Supabase store needs REGISTRY_SUPABASE_URL and REGISTRY_SUPABASE_SERVICE_KEY");
  const base = `${url.replace(/\/$/, "")}/rest/v1`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  async function call(method, pathAndQuery, body, prefer) {
    const res = await fetchImpl(`${base}/${pathAndQuery}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`registry store ${method} ${pathAndQuery}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
  const upsert = (table, rows, onConflict) =>
    rows.length ? call("POST", `${table}?on_conflict=${onConflict}`, rows, "resolution=merge-duplicates,return=minimal") : null;
  const insertIgnore = (table, rows, onConflict) =>
    rows.length ? call("POST", `${table}?on_conflict=${onConflict}`, rows, "resolution=ignore-duplicates,return=minimal") : null;

  return {
    kind: "supabase",
    async get(source, slug) {
      const rows = await call("GET", `components?slug=eq.${encodeURIComponent(slug)}&select=*,component_versions(*),quality_signals(quality)`);
      const c = rows?.[0];
      if (!c) return null;
      return {
        slug: c.slug,
        source: c.source_id,
        name: c.name,
        kind: c.kind,
        room: c.room ?? undefined,
        styleLevel: c.style_level ?? undefined,
        trust: c.trust,
        problems: c.problems,
        current: c.current_hash,
        quality: c.quality_signals?.quality ?? {},
        versions: Object.fromEntries((c.component_versions ?? []).map((v) => [v.content_hash, { label: v.cdl, firstSeenRun: v.first_run }])),
      };
    },
    async put(record) {
      const current = record.versions[record.current];
      await upsert("sources", [{ id: record.source }], "id");
      await upsert(
        "components",
        [
          {
            slug: record.slug,
            source_id: record.source,
            name: record.name,
            kind: record.kind,
            room: record.room ?? null,
            style_level: record.styleLevel ?? null,
            trust: record.trust,
            problems: record.problems,
            current_hash: record.current,
            updated_at: new Date().toISOString(),
          },
        ],
        "slug"
      );
      const label = current.label;
      await insertIgnore(
        "component_versions",
        [{ content_hash: record.current, slug: record.slug, version: label.version, cdl: label, license: label.license, first_run: current.firstSeenRun }],
        "content_hash"
      );
      const facets = [
        ["kind", label.kind],
        ["room", label.room],
        ["styleLevel", label.styleLevel],
        ["category", label.facets?.category],
        ["license", label.license],
        ["source", label.source.type],
        ...label.websiteTypes.map((w) => ["websiteType", w]),
        ...label.provides.fieldTypes.map((f) => ["fieldType", f]),
        ...(label.facets?.tags ?? []).map((t) => ["tag", t]),
      ]
        .filter(([, v]) => v)
        .map(([facet, value]) => ({ content_hash: record.current, facet, value: String(value) }));
      await insertIgnore("facets", facets, "content_hash,facet,value");
      const deps = [
        ...Object.entries(label.requires.npm).map(([n, r]) => ({ dep_name: n, dep_range: r, dep_kind: "npm" })),
        ...Object.entries(label.requires.peer).map(([n, r]) => ({ dep_name: n, dep_range: r, dep_kind: "peer" })),
        ...label.requires.registry.map((n) => ({ dep_name: n, dep_range: "*", dep_kind: "registry" })),
      ].map((d) => ({ ...d, content_hash: record.current }));
      await insertIgnore("dependencies", deps, "content_hash,dep_kind,dep_name");
      await upsert("quality_signals", [{ slug: record.slug, quality: record.quality ?? {}, fetched_at: new Date().toISOString() }], "slug");
      return true;
    },
    async list(source) {
      const rows = await call("GET", `components?select=slug,source_id${source ? `&source_id=eq.${encodeURIComponent(source)}` : ""}`);
      return Promise.all((rows ?? []).map((r) => this.get(r.source_id, r.slug)));
    },
    async logRun(run) {
      await upsert(
        "ingest_runs",
        [{ id: run.runId, source_id: run.source, started_at: run.startedAt, finished_at: run.finishedAt, summary: { ...run, errors: undefined } }],
        "id"
      );
      await insertIgnore(
        "ingest_errors",
        (run.errors ?? []).map((e) => ({ run_id: run.runId, ref: e.ref, stage: e.stage, message: e.message })),
        "run_id,ref,stage"
      );
    },
  };
}
