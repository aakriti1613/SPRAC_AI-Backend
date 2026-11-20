import type { HeroProps } from "@contracts";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { Highlight } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function HeroView({ eyebrow, title, highlight, subtitle, primaryCta, secondaryCta, image }: HeroProps) {
  const s = useSkin();
  const big = s.level === "amazing" || s.level === "astonishing";
  return (
    <section className={cn("relative isolate overflow-hidden", s.level !== "basic" && s.sectionAlt)}>
      <s.Backdrop variant="hero" />
      <div className={cn("mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-20 md:grid-cols-2", big && "py-28")}>
        <s.Reveal>
          {eyebrow && <p className={cn("mb-3", s.eyebrow)}>{eyebrow}</p>}
          <h1 className={cn("text-4xl font-bold tracking-tight text-fg sm:text-5xl", big && "sm:text-6xl")}>
            <Highlight text={title} highlight={highlight} />
          </h1>
          {subtitle && <p className="mt-5 max-w-xl text-lg text-muted">{subtitle}</p>}
          {(primaryCta || secondaryCta) && (
            <div className="mt-8 flex flex-wrap gap-3">
              {primaryCta && (
                <SparcLink href={primaryCta.href} className={s.button("primary", big ? "h-12 px-6 text-base" : undefined)}>
                  {primaryCta.label}
                </SparcLink>
              )}
              {secondaryCta && (
                <SparcLink href={secondaryCta.href} className={s.button("outline", big ? "h-12 px-6 text-base" : undefined)}>
                  {secondaryCta.label}
                </SparcLink>
              )}
            </div>
          )}
        </s.Reveal>
        <s.Reveal delay={0.15}>
          {image ? (
            <s.Hover>
              <img src={image.src} alt={image.alt} className={cn("w-full rounded-sparc border border-border object-cover", s.level !== "basic" && "shadow-xl")} />
            </s.Hover>
          ) : (
            <div
              className={cn("hidden aspect-[4/3] rounded-sparc md:block", s.level === "basic" ? "bg-primary-soft" : "border border-primary/20 bg-gradient-to-br from-primary-soft via-surface to-primary-soft shadow-lg")}
              aria-hidden
            />
          )}
        </s.Reveal>
      </div>
    </section>
  );
}
