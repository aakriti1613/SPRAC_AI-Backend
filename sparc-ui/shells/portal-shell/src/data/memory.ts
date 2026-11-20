// Demo mode: data and login live in the browser. No database needed.
// With a storageKey, data survives page reloads (localStorage).
import type { ChartPoint } from "@contracts";
import type { PortalModule } from "@core/config";
import type { AuthAdapter, DataAdapter, ListQuery, ListResult, PortalUser, Row, SessionUser } from "./types";
import { seedRows } from "./seed";

export const DEMO_EMAIL = "demo@sparc.local";
export const DEMO_PASSWORD = "demo1234";

interface State {
  tables: Record<string, Row[]>;
  users: PortalUser[];
  accounts: { email: string; password: string; name: string; avatarUrl?: string }[];
  session: string | null; // email
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

const delay = () => new Promise((r) => setTimeout(r, 0));

export function createMemoryBackend(
  modules: PortalModule[],
  { storageKey, seedCount = 12, now = () => new Date() }: { storageKey?: string; seedCount?: number; now?: () => Date } = {}
): { data: DataAdapter; auth: AuthAdapter } {
  const store = storageKey ? storage() : null;
  let state: State;
  const saved = store?.getItem(storageKey!);
  if (saved) {
    state = JSON.parse(saved) as State;
  } else {
    const base = now().getTime();
    state = {
      tables: {},
      users: [
        { name: "Demo Admin", email: DEMO_EMAIL, role: "Admin" },
        { name: "Riya Kapoor", email: "riya@example.in", role: "Staff" },
      ],
      accounts: [{ email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo Admin" }],
      session: null,
    };
    for (const m of modules) {
      state.tables[m.tableName] = seedRows(m, seedCount).map((values, i) => {
        const at = new Date(base - (seedCount - i) * 36e5 * 7).toISOString();
        return { id: `${m.tableName}-${i + 1}`, ...values, created_at: at, updated_at: at };
      });
    }
  }
  const persist = () => store?.setItem(storageKey!, JSON.stringify(state));
  const table = (name: string) => (state.tables[name] ??= []);
  let counter = 0;
  const newId = (t: string) => `${t}-${now().getTime().toString(36)}-${(counter++).toString(36)}`;

  const data: DataAdapter = {
    mode: "demo",
    async list(name, q: ListQuery): Promise<ListResult> {
      await delay();
      let rows = [...table(name)];
      const term = q.search.trim().toLowerCase();
      if (term && q.searchKeys.length) {
        rows = rows.filter((r) => q.searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(term)));
      }
      for (const [k, v] of Object.entries(q.filters)) {
        if (v !== null && v !== "") rows = rows.filter((r) => (Array.isArray(r[k]) ? (r[k] as unknown[]).includes(v) : String(r[k] ?? "") === v));
      }
      if (q.sort) {
        const dir = q.sort.dir === "desc" ? -1 : 1;
        rows.sort((a, b) => dir * compare(a[q.sort!.key], b[q.sort!.key]));
      } else {
        rows.sort((a, b) => compare(b.created_at, a.created_at));
      }
      const start = (q.page - 1) * q.pageSize;
      return { rows: rows.slice(start, start + q.pageSize), total: rows.length };
    },
    async get(name, id) {
      await delay();
      return table(name).find((r) => r.id === id) ?? null;
    },
    async create(name, values) {
      await delay();
      const at = now().toISOString();
      const row: Row = { ...values, id: newId(name), created_at: at, updated_at: at };
      table(name).push(row);
      persist();
      return row;
    },
    async update(name, id, values) {
      await delay();
      const rows = table(name);
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new Error("Record not found");
      rows[i] = { ...rows[i], ...values, id, updated_at: now().toISOString() };
      persist();
      return rows[i];
    },
    async remove(name, id) {
      await delay();
      state.tables[name] = table(name).filter((r) => r.id !== id);
      persist();
    },
    async count(name) {
      return table(name).length;
    },
    async sum(name, column) {
      return table(name).reduce((n, r) => n + (Number(r[column]) || 0), 0);
    },
    async groupCount(name, column, limit = 8): Promise<ChartPoint[]> {
      const counts = new Map<string, number>();
      for (const r of table(name)) {
        const label = r[column] === null || r[column] === undefined || r[column] === "" ? "Unspecified" : String(r[column]);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, limit);
    },
    async recent(name, limit) {
      return [...table(name)].sort((a, b) => compare(b.updated_at, a.updated_at)).slice(0, limit);
    },
    async upload(file) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });
    },
    async listUsers() {
      return [...state.users];
    },
    async addUser(email, role) {
      if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error("This person is already a user");
      state.users.push({ name: email.split("@")[0], email, role });
      persist();
    },
    async setUserRole(email, role) {
      const u = state.users.find((x) => x.email === email);
      if (!u) throw new Error("User not found");
      u.role = role;
      persist();
    },
  };

  const toUser = (email: string): SessionUser => {
    const acc = state.accounts.find((a) => a.email === email)!;
    const role = state.users.find((u) => u.email === email)?.role;
    return { id: email, email, name: acc.name, avatarUrl: acc.avatarUrl, role };
  };

  const auth: AuthAdapter = {
    mode: "demo",
    async current() {
      return state.session ? toUser(state.session) : null;
    },
    async signIn(email, password) {
      await delay();
      const acc = state.accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
      if (!acc || acc.password !== password) throw new Error("Invalid email or password");
      state.session = acc.email;
      persist();
      return toUser(acc.email);
    },
    async signUp({ name, email, password }) {
      await delay();
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (state.accounts.some((a) => a.email.toLowerCase() === email.toLowerCase())) throw new Error("An account with this email already exists");
      state.accounts.push({ email, password, name });
      if (!state.users.some((u) => u.email === email)) state.users.push({ name, email, role: "Staff" });
      state.session = email;
      persist();
      return toUser(email);
    },
    async resetPassword() {
      await delay(); // demo: nothing is sent
    },
    async signOut() {
      state.session = null;
      persist();
    },
    async updateProfile(values) {
      if (!state.session) throw new Error("Not signed in");
      const acc = state.accounts.find((a) => a.email === state.session)!;
      if (values.name !== undefined) acc.name = values.name;
      if (values.avatarUrl !== undefined) acc.avatarUrl = values.avatarUrl;
      const u = state.users.find((x) => x.email === acc.email);
      if (u && values.name) u.name = values.name;
      persist();
      return toUser(acc.email);
    },
  };

  return { data, auth };
}
