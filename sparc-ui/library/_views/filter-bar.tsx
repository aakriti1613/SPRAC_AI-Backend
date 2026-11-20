import type { FilterBarProps } from "@contracts";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function FilterBar({ search, onSearchChange, filters, values, onFilterChange, onReset }: FilterBarProps) {
  const s = useSkin();
  const active = Boolean(search) || Object.values(values).some(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <div className="relative min-w-[14rem] flex-1">
        <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          aria-label="Search"
          placeholder="Search…"
          className={cn(s.input, "pl-9")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {filters.map((f) => (
        <select
          key={f.key}
          aria-label={f.label}
          className={cn(s.input, "w-auto min-w-[9rem]")}
          value={String(values[f.key] ?? "")}
          onChange={(e) => onFilterChange(f.key, e.target.value || null)}
        >
          <option value="">All {f.label.toLowerCase()}</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ))}
      {onReset && active && (
        <button type="button" className={s.button("ghost")} onClick={onReset}>
          <Icon name="X" /> Clear
        </button>
      )}
    </div>
  );
}
