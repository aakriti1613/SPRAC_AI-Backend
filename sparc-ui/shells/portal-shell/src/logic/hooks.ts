// Headless logic hooks: written ONCE, shared by every style level's skins.
// Pages call these and pass the results into rooms (<Slot>) as props.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityItem, ChartPoint, Column, FieldDef, FilterDef, NotificationItem, SettingsSection, SortState } from "@contracts";
import type { PortalModule } from "@core/config";
import { formatCurrency } from "@core/format";
import type { Row } from "../data/types";
import { messageOf, usePortal } from "./portal";
import { emptyValue, validateRecord } from "./validation";

const SEARCHABLE = new Set(["text", "email", "phone", "url", "textarea", "select", "radio"]);

export function displayName(module: PortalModule, row: Row): string {
  for (const key of module.listColumns) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  const text = module.fields.find((f) => f.type === "text" && typeof row[f.key] === "string");
  return text ? String(row[text.key]) : `${module.singularName} ${row.id}`;
}

// ---------------------------------------------------------------------------
// Settings (saved in this browser)
// ---------------------------------------------------------------------------
const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "lists",
    title: "Lists",
    fields: [
      { key: "default_page_size", label: "Rows per page", type: "select", required: true, options: ["10", "20", "50"], width: "half" },
      { key: "show_demo_banner", label: "Show the demo-mode banner", type: "toggle", required: false, width: "half" },
    ],
  },
];
const DEFAULT_SETTINGS = { default_page_size: "10", show_demo_banner: true };

const settingsKey = (brand: string) => `sparc-settings:${brand}`;

export function readSettings(brand: string): typeof DEFAULT_SETTINGS {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(settingsKey(brand)) ?? "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function useSettings() {
  const { brand } = usePortal();
  const [values, setValues] = useState<Record<string, unknown>>(() => readSettings(brand.name));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const save = useCallback(
    async (next: Record<string, unknown>) => {
      setSaving(true);
      setError(undefined);
      try {
        localStorage.setItem(settingsKey(brand.name), JSON.stringify({ ...readSettings(brand.name), ...next }));
        setValues(readSettings(brand.name));
      } catch (e) {
        setError(messageOf(e));
      } finally {
        setSaving(false);
      }
    },
    [brand.name]
  );
  return { sections: SETTINGS_SECTIONS, values, save, saving, error };
}

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------
export function useCrudList(module: PortalModule) {
  const { data, brand } = usePortal();
  const features = module.tableFeatures;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<Record<string, string | null>>({});
  const [sort, setSort] = useState<SortState | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => Number(readSettings(brand.name).default_page_size) || 10);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ rows: Row[]; total: number; loading: boolean; error?: string }>({ rows: [], total: 0, loading: true });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const searchKeys = useMemo(() => module.fields.filter((f) => SEARCHABLE.has(f.type)).map((f) => f.key), [module]);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    data
      .list(module.tableName, {
        search: features.search ? debounced : "",
        searchKeys,
        filters: features.filter ? filters : {},
        sort: features.sort ? sort : undefined,
        page: features.pagination ? page : 1,
        pageSize: features.pagination ? pageSize : 1000,
      })
      .then((r) => alive && setState({ rows: r.rows, total: r.total, loading: false }))
      .catch((e) => alive && setState({ rows: [], total: 0, loading: false, error: messageOf(e) }));
    return () => {
      alive = false;
    };
  }, [data, module.tableName, debounced, filters, sort, page, pageSize, searchKeys, features, version]);

  const columns: Column[] = useMemo(
    () =>
      module.listColumns
        .map((key) => module.fields.find((f) => f.key === key))
        .filter((f): f is FieldDef => Boolean(f))
        .map((f) => ({ key: f.key, label: f.label, type: f.type, sortable: features.sort })),
    [module, features.sort]
  );

  const filterDefs: FilterDef[] = useMemo(
    () =>
      features.filter
        ? module.fields
            .filter((f) => (f.type === "select" || f.type === "radio") && f.options?.length)
            .map((f) => ({ key: f.key, label: f.label, options: f.options ?? [] }))
        : [],
    [module, features.filter]
  );

  const remove = useCallback(
    async (id: string) => {
      await data.remove(module.tableName, id);
      setVersion((v) => v + 1);
    },
    [data, module.tableName]
  );

  return {
    ...state,
    columns,
    filterDefs,
    search,
    setSearch: (v: string) => {
      setSearch(v);
      setPage(1);
    },
    filters,
    setFilter: (key: string, value: string | null) => {
      setFilters((f) => ({ ...f, [key]: value }));
      setPage(1);
    },
    resetFilters: () => {
      setFilters({});
      setSearch("");
      setPage(1);
    },
    sort,
    setSort: (s: SortState) => {
      setSort(s);
      setPage(1);
    },
    page: { page, pageSize, total: state.total },
    setPage: (p: number, size: number) => {
      setPage(size !== pageSize ? 1 : p);
      setPageSize(size);
    },
    isFiltered: Boolean(debounced.trim()) || Object.values(filters).some((v) => v),
    remove,
    reload: () => setVersion((v) => v + 1),
  };
}

// ---------------------------------------------------------------------------
// One record + its form
// ---------------------------------------------------------------------------
export function useRecord(module: PortalModule, id: string | undefined) {
  const { data } = usePortal();
  const [state, setState] = useState<{ record: Row | null; loading: boolean; error?: string }>({ record: null, loading: Boolean(id) });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    data
      .get(module.tableName, id)
      .then((record) => alive && setState({ record, loading: false }))
      .catch((e) => alive && setState({ record: null, loading: false, error: messageOf(e) }));
    return () => {
      alive = false;
    };
  }, [data, module.tableName, id]);
  const remove = useCallback(async () => {
    if (id) await data.remove(module.tableName, id);
  }, [data, module.tableName, id]);
  return { ...state, remove };
}

export function useRecordForm(module: PortalModule, id: string | undefined) {
  const { data } = usePortal();
  const existing = useRecord(module, id);
  const blank = useMemo(() => Object.fromEntries(module.fields.map((f) => [f.key, emptyValue(f)])), [module]);
  const [values, setValues] = useState<Record<string, unknown>>(blank);
  const [loadedFor, setLoadedFor] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();

  // Fill the form once the existing record arrives.
  if (id && existing.record && loadedFor !== id) {
    setLoadedFor(id);
    setValues(Object.fromEntries(module.fields.map((f) => [f.key, existing.record![f.key] ?? emptyValue(f)])));
  }

  const onChange = useCallback((key: string, value: unknown) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }, []);

  const submit = useCallback(async (): Promise<Row | null> => {
    setFormError(undefined);
    const result = validateRecord(module.fields, values);
    if (!result.ok) {
      setErrors(result.errors);
      return null;
    }
    setSubmitting(true);
    try {
      return id ? await data.update(module.tableName, id, result.data) : await data.create(module.tableName, result.data);
    } catch (e) {
      setFormError(messageOf(e));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [data, id, module, values]);

  return {
    values,
    errors: formError ? { ...errors, _form: formError } : errors,
    onChange,
    submit,
    submitting,
    loading: existing.loading,
    notFound: Boolean(id) && !existing.loading && !existing.record,
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export interface DashboardStat {
  key: string;
  label: string;
  value: string;
  icon?: string;
  href?: string;
}

export function useDashboard(withChart: boolean) {
  const { data, config } = usePortal();
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [chart, setChart] = useState<{ title: string; data: ChartPoint[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: DashboardStat[] = [];
      for (const m of config.modules) {
        out.push({ key: `count-${m.id}`, label: m.pluralName, value: String(await data.count(m.tableName)), icon: m.icon, href: `/${m.id}` });
      }
      for (const m of config.modules) {
        const money = m.fields.find((f) => f.type === "currency");
        if (money && out.length < 6) {
          out.push({ key: `sum-${m.id}`, label: `Total ${money.label.toLowerCase()}`, value: formatCurrency(await data.sum(m.tableName, money.key)), icon: "BadgeIndianRupee", href: `/${m.id}` });
        }
      }
      let nextChart: { title: string; data: ChartPoint[] } | null = null;
      if (withChart) {
        for (const m of config.modules) {
          const field = m.fields.find((f) => (f.type === "select" || f.type === "radio") && f.options?.length);
          if (field) {
            nextChart = { title: `${m.pluralName} by ${field.label.toLowerCase()}`, data: await data.groupCount(m.tableName, field.key) };
            break;
          }
        }
      }
      if (alive) {
        setStats(out);
        setChart(nextChart);
      }
    })()
      .catch((e) => alive && setError(messageOf(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [data, config.modules, withChart]);

  return { stats, chart, loading, error };
}

// ---------------------------------------------------------------------------
// Recent changes -> notifications + activity log (derived from records)
// ---------------------------------------------------------------------------
interface RecentEntry {
  id: string;
  module: PortalModule;
  name: string;
  at: string;
  kind: "added" | "updated";
}

const readKey = (brand: string) => `sparc-read:${brand}`;

export function useRecentChanges(limit = 8) {
  const { data, config, brand } = usePortal();
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(readKey(brand.name)) ?? "[]"));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    let alive = true;
    Promise.all(
      config.modules.map(async (m) =>
        (await data.recent(m.tableName, limit)).map<RecentEntry>((row) => ({
          id: `${m.id}:${row.id}:${row.updated_at ?? ""}`,
          module: m,
          name: displayName(m, row),
          at: String(row.updated_at ?? row.created_at ?? new Date(0).toISOString()),
          kind: row.updated_at && row.created_at && row.updated_at !== row.created_at ? "updated" : "added",
        }))
      )
    )
      .then((lists) => alive && setEntries(lists.flat().sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)))
      .catch(() => alive && setEntries([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [data, config.modules, limit]);

  const persistRead = (ids: Set<string>) => {
    setReadIds(new Set(ids));
    try {
      localStorage.setItem(readKey(brand.name), JSON.stringify([...ids]));
    } catch {
      /* storage unavailable */
    }
  };

  const notifications: NotificationItem[] = entries.map((e) => ({
    id: e.id,
    title: `${e.module.singularName} ${e.kind}`,
    body: e.name,
    at: e.at,
    read: readIds.has(e.id),
  }));
  const activity: ActivityItem[] = entries.map((e) => ({
    actor: "A team member",
    action: e.kind,
    target: `${e.module.singularName.toLowerCase()} “${e.name}”`,
    at: e.at,
  }));

  return {
    loading,
    notifications,
    activity,
    markRead: (id: string) => persistRead(new Set([...readIds, id])),
    markAllRead: () => persistRead(new Set([...readIds, ...entries.map((e) => e.id)])),
  };
}

// ---------------------------------------------------------------------------
// Export (CSV opens in Excel)
// ---------------------------------------------------------------------------
export function toCsv(module: PortalModule, rows: Row[]): string {
  const cols = module.fields;
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => esc(c.label)).join(","), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(","))].join("\n");
}

export function useExport(module: PortalModule) {
  const { data } = usePortal();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    try {
      const { rows } = await data.list(module.tableName, { search: "", searchKeys: [], filters: {}, page: 1, pageSize: 10000 });
      const csv = toCsv(module, rows);
      if (typeof URL.createObjectURL === "function") {
        const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${module.id}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      return csv;
    } finally {
      setBusy(false);
    }
  }, [data, module]);
  return { busy, run };
}

// ---------------------------------------------------------------------------
// Users & roles
// ---------------------------------------------------------------------------
export function useUsers() {
  const { data, config } = usePortal();
  const [users, setUsers] = useState<{ name: string; email: string; role: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(() => data.listUsers().then(setUsers).catch((e) => setError(messageOf(e))), [data]);
  useEffect(() => {
    load();
  }, [load]);
  const wrap = (fn: (email: string, role: string) => Promise<void>) => async (email: string, role: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn(email, role);
      await load();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  return {
    users,
    roles: config.roles?.length ? config.roles : ["Admin", "Staff", "Viewer"],
    invite: wrap((e, r) => data.addUser(e, r)),
    changeRole: wrap((e, r) => data.setUserRole(e, r)),
    busy,
    error,
  };
}
