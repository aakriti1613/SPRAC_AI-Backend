import type { DashboardStatCardProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function DashboardStatCardView({ label, value, icon, trend, hint, href }: DashboardStatCardProps) {
  const s = useSkin();
  const body = (
    <div className={cn(href ? s.cardInteractive : s.card, "relative h-full overflow-hidden p-5", href && "transition-colors hover:border-primary")}>
      {s.level !== "basic" && <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary-soft/70 blur-2xl" />}
      <div className="relative flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        <span className={cn(s.iconBadge, "h-9 w-9")}>
          <Icon name={icon ?? "Database"} />
        </span>
      </div>
      <p className={cn("relative mt-3 text-2xl font-semibold text-fg", s.level === "amazing" && "text-3xl")}>
        <s.Count value={value} />
      </p>
      {(trend !== undefined || hint) && (
        <p className="relative mt-1 flex items-center gap-1 text-xs text-muted">
          {trend !== undefined && (
            <span className={cn("inline-flex items-center", trend > 0 ? "text-success" : trend < 0 ? "text-danger" : "text-muted")}>
              <Icon name={trend > 0 ? "TrendingUp" : trend < 0 ? "TrendingDown" : "Minus"} className="h-3.5 w-3.5" />
              {Math.abs(trend)}%
            </span>
          )}
          {hint}
        </p>
      )}
    </div>
  );
  return (
    <s.Hover className="h-full">
      {href ? (
        <SparcLink href={href} className="block h-full rounded-sparc">
          {body}
        </SparcLink>
      ) : (
        body
      )}
    </s.Hover>
  );
}
