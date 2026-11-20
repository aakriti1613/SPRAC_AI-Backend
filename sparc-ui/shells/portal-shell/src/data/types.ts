// What the portal shell needs from a backend. Two implementations:
//   memory.ts   — demo mode (data in the browser, no setup)
//   supabase.ts — real database + auth
import type { ChartPoint } from "@contracts";

export type Row = Record<string, unknown> & { id: string; created_at?: string; updated_at?: string };

export interface ListQuery {
  search: string;
  /** Columns the search looks in (text-like fields only). */
  searchKeys: string[];
  filters: Record<string, string | null>;
  sort?: { key: string; dir: "asc" | "desc" };
  page: number;
  pageSize: number;
}

export interface ListResult {
  rows: Row[];
  total: number;
}

export interface PortalUser {
  name: string;
  email: string;
  role: string;
}

export interface DataAdapter {
  mode: "demo" | "supabase";
  list(table: string, query: ListQuery): Promise<ListResult>;
  get(table: string, id: string): Promise<Row | null>;
  create(table: string, values: Record<string, unknown>): Promise<Row>;
  update(table: string, id: string, values: Record<string, unknown>): Promise<Row>;
  remove(table: string, id: string): Promise<void>;
  count(table: string): Promise<number>;
  sum(table: string, column: string): Promise<number>;
  groupCount(table: string, column: string, limit?: number): Promise<ChartPoint[]>;
  /** Most recently changed rows. */
  recent(table: string, limit: number): Promise<Row[]>;
  /** Store a file and return its URL. */
  upload(file: File): Promise<string>;
  listUsers(): Promise<PortalUser[]>;
  addUser(email: string, role: string): Promise<void>;
  setUserRole(email: string, role: string): Promise<void>;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role?: string;
}

export interface AuthAdapter {
  mode: "demo" | "supabase";
  current(): Promise<SessionUser | null>;
  signIn(email: string, password: string): Promise<SessionUser>;
  /** Returns null when the account must first be confirmed by email. */
  signUp(values: { name: string; email: string; password: string }): Promise<SessionUser | null>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  updateProfile(values: { name?: string; avatarUrl?: string }): Promise<SessionUser>;
}
