import type { CtaBannerProps } from "@contracts";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function CtaBannerView({ title, subtitle, cta }: CtaBannerProps) {
  const s = useSkin();
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12">
      <s.Reveal>
        <div
          className={cn(
            "relative isolate flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-sparc px-8 py-10 text-primary-foreground",
            s.level === "basic" ? "bg-primary" : "bg-gradient-to-r from-primary to-primary-hover shadow-lg shadow-primary/25",
            s.level === "astonishing" && "py-14"
          )}
        >
          <s.Backdrop variant="cta" />
          <div>
            <h2 className="text-2xl font-semibold">{title}</h2>
            {subtitle && <p className="mt-2 opacity-90">{subtitle}</p>}
          </div>
          <SparcLink
            href={cta.href}
            className={cn(
              "inline-flex h-control items-center rounded-sparc bg-surface px-5 text-sm font-medium text-fg transition-all hover:opacity-90",
              s.level !== "basic" && "shadow-md hover:-translate-y-0.5 hover:shadow-lg"
            )}
          >
            {cta.label}
          </SparcLink>
        </div>
      </s.Reveal>
    </section>
  );
}
