import type { StatsProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function StatsView({ items }: StatsProps) {
  const s = useSkin();
  return (
    <section className={cn("border-y border-border bg-surface", s.level !== "basic" && "bg-gradient-to-r from-primary-soft/40 via-surface to-primary-soft/40")}>
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-10 text-center md:grid-cols-4">
        {items.map((st) => (
          <div key={st.label} className="flex flex-col-reverse">
            <dt className="mt-1 text-sm text-muted">{st.label}</dt>
            <dd className={cn("text-3xl font-bold", s.level === "basic" || s.level === "good" ? "text-primary" : s.highlight, s.level === "astonishing" && "text-4xl")}>
              <s.Count value={st.value} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
