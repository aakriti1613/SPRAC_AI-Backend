// Real backend: Supabase database + auth. Tables and the helper SQL functions
// (portal_group_count, portal_sum) are created by the platform's provisioning
// step (platform-backend-main/lib/schemaGenerator.js).
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { ChartPoint } from "@contracts";
import type { AuthAdapter, DataAdapter, ListQuery, ListResult, Row, SessionUser } from "./types";

const UPLOAD_BUCKET = "uploads";

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Characters that would break a PostgREST `or=` filter. */
const cleanTerm = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

function toSessionUser(user: User): SessionUser {
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta.full_name || [meta.firstName, meta.lastName].filter(Boolean).join(" ") || (user.email ?? "").split("@")[0];
  return { id: user.id, email: user.email ?? "", name, avatarUrl: meta.avatar_url, role: meta.role };
}

export function createSupabaseBackend(url: string, anonKey: string): { data: DataAdapter; auth: AuthAdapter; client: SupabaseClient } {
  const client = createClient(url, anonKey);

  const data: DataAdapter = {
    mode: "supabase",
    async list(table, q: ListQuery): Promise<ListResult> {
      let query = client.from(table).select("*", { count: "exact" });
      const term = cleanTerm(q.search);
      if (term && q.searchKeys.length) query = query.or(q.searchKeys.map((k) => `${k}.ilike.*${term}*`).join(","));
      for (const [k, v] of Object.entries(q.filters)) if (v !== null && v !== "") query = query.eq(k, v);
      query = q.sort ? query.order(q.sort.key, { ascending: q.sort.dir === "asc" }) : query.order("created_at", { ascending: false });
      const from = (q.page - 1) * q.pageSize;
      const { data: rows, count, error } = await query.range(from, from + q.pageSize - 1);
      fail(error);
      return { rows: (rows ?? []) as Row[], total: count ?? 0 };
    },
    async get(table, id) {
      const { data: row, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
      fail(error);
      return (row as Row) ?? null;
    },
    async create(table, values) {
      const { data: row, error } = await client.from(table).insert(values).select().single();
      fail(error);
      return row as Row;
    },
    async update(table, id, values) {
      const { data: row, error } = await client.from(table).update(values).eq("id", id).select().single();
      fail(error);
      return row as Row;
    },
    async remove(table, id) {
      const { error } = await client.from(table).delete().eq("id", id);
      fail(error);
    },
    async count(table) {
      const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
      fail(error);
      return count ?? 0;
    },
    async sum(table, column) {
      const { data: value, error } = await client.rpc("portal_sum", { p_table: table, p_column: column });
      fail(error);
      return Number(value) || 0;
    },
    async groupCount(table, column, limit = 8): Promise<ChartPoint[]> {
      const { data: rows, error } = await client.rpc("portal_group_count", { p_table: table, p_column: column, p_limit: limit });
      fail(error);
      return ((rows ?? []) as { label: string; value: number | string }[]).map((r) => ({ label: r.label, value: Number(r.value) }));
    },
    async recent(table, limit) {
      const { data: rows, error } = await client.from(table).select("*").order("updated_at", { ascending: false }).limit(limit);
      fail(error);
      return (rows ?? []) as Row[];
    },
    async upload(file) {
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await client.storage.from(UPLOAD_BUCKET).upload(path, file);
      if (error) throw new Error(`Upload failed (${error.message}). Ask the admin to create a public "${UPLOAD_BUCKET}" storage bucket.`);
      return client.storage.from(UPLOAD_BUCKET).getPublicUrl(path).data.publicUrl;
    },
    async listUsers() {
      const { data: rows, error } = await client.from("organization_users").select("first_name,last_name,email,role").order("email");
      fail(error);
      return ((rows ?? []) as { first_name: string; last_name: string; email: string; role: string }[]).map((r) => ({
        name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
        email: r.email,
        role: r.role,
      }));
    },
    async addUser(email, role) {
      const { error } = await client.from("organization_users").insert({ email, role, status: "Invited", first_name: email.split("@")[0] });
      fail(error);
    },
    async setUserRole(email, role) {
      const { error } = await client.from("organization_users").update({ role }).eq("email", email);
      fail(error);
    },
  };

  const auth: AuthAdapter = {
    mode: "supabase",
    async current() {
      const { data: s } = await client.auth.getSession();
      return s.session ? toSessionUser(s.session.user) : null;
    },
    async signIn(email, password) {
      const { data: d, error } = await client.auth.signInWithPassword({ email, password });
      fail(error);
      return toSessionUser(d.user!);
    },
    async signUp({ name, email, password }) {
      const { data: d, error } = await client.auth.signUp({ email, password, options: { data: { full_name: name } } });
      fail(error);
      return d.session ? toSessionUser(d.session.user) : null;
    },
    async resetPassword(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
      fail(error);
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      fail(error);
    },
    async updateProfile(values) {
      const meta: Record<string, string> = {};
      if (values.name !== undefined) meta.full_name = values.name;
      if (values.avatarUrl !== undefined) meta.avatar_url = values.avatarUrl;
      const { data: d, error } = await client.auth.updateUser({ data: meta });
      fail(error);
      if (!d.user) throw new Error("Not signed in");
      return toSessionUser(d.user);
    },
  };

  return { data, auth, client };
}
