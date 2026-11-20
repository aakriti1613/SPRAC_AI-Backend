import type { EmptyStateProps } from "@contracts";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function EmptyState({ title, message, icon, actionLabel, onAction }: EmptyStateProps) {
  const s = useSkin();
  return (
    <s.Reveal>
    <div className={cn(s.card, "relative isolate flex flex-col items-center overflow-hidden px-6 py-14 text-center")}>
      <s.Backdrop variant="page" />
      <span className={cn(s.iconBadge, "h-12 w-12 rounded-full")}>
        <Icon name={icon ?? "Inbox"} className="h-6 w-6" />
      </span>
      <h2 className="mt-4 font-semibold text-fg">{title}</h2>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {actionLabel && onAction && (
        <button type="button" className={s.button("primary", "mt-6")} onClick={onAction}>
          <Icon name="Plus" /> {actionLabel}
        </button>
      )}
    </div>
    </s.Reveal>
  );
}
