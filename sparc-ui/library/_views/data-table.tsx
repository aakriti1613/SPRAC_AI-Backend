import type { DataTableProps } from "@contracts";
import { formatValue } from "@core/format";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

const ACTION_ICONS = { view: "Eye", edit: "Pencil", delete: "Trash2" } as const;

export default function DataTable({ columns, rows, loading, sort, onSortChange, page, onPageChange, rowActions, onRowClick, emptyText }: DataTableProps) {
  const s = useSkin();
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const first = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.total, page.page * page.pageSize);

  return (
    <div className={cn(s.card, "overflow-hidden")}>
      {/* relative: keeps absolutely-positioned children (e.g. sr-only labels) inside the scroll box */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-bg text-xs uppercase tracking-wide text-muted">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" className="px-4 py-3 font-medium" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sortable && onSortChange ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 uppercase hover:text-fg"
                        onClick={() => onSortChange({ key: c.key, dir: active && sort!.dir === "asc" ? "desc" : "asc" })}
                      >
                        {c.label}
                        {active && <Icon name={sort!.dir === "asc" ? "ArrowUp" : "ArrowDown"} className="h-3 w-3" />}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
              {rowActions && rowActions.length > 0 && (
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && rows.length === 0
              ? Array.from({ length: 4 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={columns.length + 1} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-bg" />
                    </td>
                  </tr>
                ))
              : rows.map((row, i) => (
                  <tr
                    key={String(row.id ?? i)}
                    className={cn("bg-surface", onRowClick && "cursor-pointer hover:bg-bg")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className="max-w-[18rem] truncate px-4 py-3 text-fg">
                        {formatValue(c.type, row[c.key])}
                      </td>
                    ))}
                    {rowActions && rowActions.length > 0 && (
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {rowActions.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            aria-label={a.label}
                            title={a.label}
                            className={cn(s.button("ghost", "h-8 px-2"), a.id === "delete" && "text-danger")}
                            onClick={(e) => {
                              e.stopPropagation();
                              a.onSelect(row);
                            }}
                          >
                            <Icon name={ACTION_ICONS[a.id]} />
                          </button>
                        ))}
                      </td>
                    )}
                  </tr>
                ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-muted">
                  {emptyText ?? "No records."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted">
        <span>
          {first}–{last} of {page.total}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            Rows
            <select className={cn(s.input, "h-8 w-20 py-0")} value={page.pageSize} onChange={(e) => onPageChange(1, Number(e.target.value))}>
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={s.button("outline", "h-8 px-2")} disabled={page.page <= 1} onClick={() => onPageChange(page.page - 1, page.pageSize)} aria-label="Previous page">
            <Icon name="ChevronLeft" />
          </button>
          <span>
            {page.page} / {pages}
          </span>
          <button type="button" className={s.button("outline", "h-8 px-2")} disabled={page.page >= pages} onClick={() => onPageChange(page.page + 1, page.pageSize)} aria-label="Next page">
            <Icon name="ChevronRight" />
          </button>
        </div>
      </div>
    </div>
  );
}
