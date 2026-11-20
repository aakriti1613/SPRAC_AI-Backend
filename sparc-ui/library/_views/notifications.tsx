import { useState } from "react";
import type { NotificationsProps } from "@contracts";
import { timeAgo } from "@core/format";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function Notifications({ items, onMarkRead, onMarkAllRead }: NotificationsProps) {
  const s = useSkin();
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button
        type="button"
        className={s.button("outline", "relative px-3")}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="Bell" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className={cn(s.card, "absolute right-0 z-30 mt-2 w-80 shadow-lg")} role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-medium text-fg">Notifications</p>
            {onMarkAllRead && unread > 0 && (
              <button type="button" className="text-xs text-primary hover:underline" onClick={onMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">You're all caught up.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onMarkRead(n.id)} className={cn("w-full px-4 py-3 text-left hover:bg-bg", !n.read && "bg-primary-soft/40")}>
                  <p className="flex items-center gap-2 text-sm font-medium text-fg">
                    {!n.read && <span className="h-2 w-2 rounded-full bg-primary" aria-label="unread" />}
                    {n.title}
                  </p>
                  {n.body && <p className="truncate text-sm text-muted">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-muted">{timeAgo(n.at)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
