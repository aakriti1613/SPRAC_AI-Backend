import type { ActivityLogProps } from "@contracts";
import { timeAgo } from "@core/format";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function ActivityLog({ heading, items, loading }: ActivityLogProps) {
  const s = useSkin();
  return (
    <section className={cn(s.card, "p-5")} aria-label={heading}>
      <h2 className="mb-4 font-semibold text-fg">{heading}</h2>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-bg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No activity yet.</p>
      ) : (
        <s.List as="ol" className="space-y-3">
          {items.map((a, i) => (
            <s.Item key={`${a.at}-${i}`} className="flex items-start gap-3 text-sm">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary", s.level !== "basic" && "ring-4 ring-primary-soft")} aria-hidden />
              <p className="flex-1 text-fg">
                <span className="font-medium">{a.actor}</span> {a.action} {a.target}
              </p>
              <time dateTime={a.at} className="shrink-0 text-xs text-muted">
                {timeAgo(a.at)}
              </time>
            </s.Item>
          ))}
        </s.List>
      )}
    </section>
  );
}
