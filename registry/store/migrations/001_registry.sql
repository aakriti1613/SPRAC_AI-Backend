-- SPARC AI component registry (dedicated Supabase project).
-- Apply in the Supabase SQL editor or with `supabase db push`.
-- Writes happen only from the server (service role); public components are readable.

create extension if not exists "pgcrypto";
create extension if not exists vector;

create table if not exists sources (
  id          text primary key,              -- own-library, own-templates, shadcn, npm, github, storybook
  config      jsonb not null default '{}',
  last_synced_at timestamptz
);

create table if not exists components (
  slug        text primary key,              -- e.g. own-library:navbar/basic/sparc
  source_id   text not null references sources(id),
  name        text not null,
  kind        text not null check (kind in ('template','component','ui','library')),
  room        text,
  style_level text check (style_level in ('basic','good','amazing','astonishing')),
  trust       text not null check (trust in ('verified','candidate','deprecated')),
  problems    jsonb not null default '[]',
  current_hash text not null,
  org_id      uuid,                          -- null = public; set for company uploads (later)
  visibility  text not null default 'public' check (visibility in ('public','org')),
  updated_at  timestamptz not null default now()
);
create index if not exists components_room_level on components (room, style_level, trust);

create table if not exists component_versions (
  content_hash text primary key,             -- sha256 of the source files: versions are immutable
  slug        text not null references components(slug) on delete cascade,
  version     text not null,
  cdl         jsonb not null,
  license     text not null,
  first_run   text,
  created_at  timestamptz not null default now()
);

create table if not exists facets (
  content_hash text not null references component_versions(content_hash) on delete cascade,
  facet       text not null,
  value       text not null,
  primary key (content_hash, facet, value)
);
create index if not exists facets_lookup on facets (facet, value);

create table if not exists dependencies (
  content_hash text not null references component_versions(content_hash) on delete cascade,
  dep_name    text not null,
  dep_range   text not null default '*',
  dep_kind    text not null check (dep_kind in ('npm','peer','registry')),
  primary key (content_hash, dep_kind, dep_name)
);

create table if not exists quality_signals (
  slug        text primary key references components(slug) on delete cascade,
  quality     jsonb not null default '{}',
  fetched_at  timestamptz not null default now()
);

-- Filled in Phase 4 (search). Model name kept per row so a model change means a clean re-embed.
create table if not exists embeddings (
  content_hash text not null references component_versions(content_hash) on delete cascade,
  model       text not null,
  dims        int not null,
  text_hash   text not null,
  embedding   vector(768) not null,
  primary key (content_hash, model)
);
create index if not exists embeddings_hnsw on embeddings using hnsw (embedding vector_cosine_ops);

create table if not exists ingest_runs (
  id          text primary key,
  source_id   text not null,
  started_at  timestamptz not null,
  finished_at timestamptz,
  summary     jsonb not null default '{}'
);

create table if not exists ingest_errors (
  run_id      text not null references ingest_runs(id) on delete cascade,
  ref         text not null,
  stage       text not null,
  message     text not null
);

-- Row level security: anyone may read public components; only the service role writes.
alter table sources enable row level security;
alter table components enable row level security;
alter table component_versions enable row level security;
alter table facets enable row level security;
alter table dependencies enable row level security;
alter table quality_signals enable row level security;
alter table embeddings enable row level security;
alter table ingest_runs enable row level security;
alter table ingest_errors enable row level security;

drop policy if exists "public read" on components;
create policy "public read" on components for select using (visibility = 'public');
drop policy if exists "public read" on component_versions;
create policy "public read" on component_versions for select
  using (exists (select 1 from components c where c.slug = component_versions.slug and c.visibility = 'public'));
drop policy if exists "public read" on facets;
create policy "public read" on facets for select using (true);
drop policy if exists "public read" on dependencies;
create policy "public read" on dependencies for select using (true);
drop policy if exists "public read" on quality_signals;
create policy "public read" on quality_signals for select using (true);
