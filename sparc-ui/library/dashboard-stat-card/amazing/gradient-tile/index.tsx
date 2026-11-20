// Promoted from the prototype: crud-modern-new-temp/src/components/widgets/StatCard.tsx.
// Cleaning done (see meta.json): accepts the room's props (icon by NAME, value as
// text), theme tokens instead of fixed colours, respects reduce-motion; the
// sparkline was dropped because the contract does not provide that data.
import type { DashboardStatCardProps } from "@contracts";
import { motion } from "motion/react";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { SkinProvider } from "../../../_skins/context";
import { amazingSkin } from "../../../_skins/amazing";
import { Count } from "../../../_skins/motion";

export default function GradientTileStatCard({ label, value, icon, trend, hint, href }: DashboardStatCardProps) {
  const tile = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      className="relative h-full overflow-hidden rounded-sparc bg-gradient-to-br from-primary to-primary-hover p-5 text-primary-foreground shadow-lg shadow-primary/25"
    >
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary-foreground/10" />
      <div className="relative flex items-center justify-between">
        <p className="text-sm opacity-90">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-sparc bg-primary-foreground/15">
          <Icon name={icon ?? "Database"} />
        </span>
      </div>
      <p className="relative mt-3 text-3xl font-semibold">
        <Count value={value} />
      </p>
      {(trend !== undefined || hint) && (
        <p className="relative mt-1 flex items-center gap-1 text-xs opacity-90">
          {trend !== undefined && (
            <span className="inline-flex items-center gap-0.5 font-medium">
              <Icon name={trend > 0 ? "TrendingUp" : trend < 0 ? "TrendingDown" : "Minus"} className="h-3.5 w-3.5" />
              {Math.abs(trend)}%
            </span>
          )}
          {hint}
        </p>
      )}
    </motion.div>
  );
  return (
    <SkinProvider skin={amazingSkin}>
      {href ? (
        <SparcLink href={href} className="block h-full rounded-sparc">
          {tile}
        </SparcLink>
      ) : (
        tile
      )}
    </SkinProvider>
  );
}
