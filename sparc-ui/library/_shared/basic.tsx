// Small building blocks shared by every view. They read the current skin, so
// the same structure looks Basic, Good, Amazing or Astonishing.
import type { ReactNode } from "react";
import type { Brand, TimelineItem } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export function BrandMark({ brand, size = "md" }: { brand: Brand; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm";
  return (
    <span className="flex items-center gap-2.5">
      {brand.logoUrl ? (
        <img src={brand.logoUrl} alt="" className={cn(box, "rounded-sparc object-cover")} />
      ) : (
        <span className={cn(box, "flex items-center justify-center rounded-sparc bg-primary font-semibold text-primary-foreground")} aria-hidden>
          {(brand.logoText || brand.name.slice(0, 2)).toUpperCase()}
        </span>
      )}
      <span className="font-semibold text-fg">{brand.name}</span>
    </span>
  );
}

export function SectionTitle({ title, subtitle, center }: { title: string; subtitle?: string; center?: boolean }) {
  const s = useSkin();
  return (
    <s.Reveal className={cn("mb-10", center && "text-center")}>
      <h2 className={s.heading}>{title}</h2>
      {subtitle && <p className={cn("mt-3 max-w-2xl text-muted", center && "mx-auto")}>{subtitle}</p>}
    </s.Reveal>
  );
}

export function Section({ children, className, alt }: { children: ReactNode; className?: string; alt?: boolean }) {
  const s = useSkin();
  return (
    <section className={cn(alt && s.sectionAlt)}>
      <div className={cn("mx-auto w-full max-w-6xl px-6 py-16", className)}>{children}</div>
    </section>
  );
}

export function Timeline({ heading, items }: { heading: string; items: TimelineItem[] }) {
  const s = useSkin();
  return (
    <Section>
      <SectionTitle title={heading} />
      <s.List as="ol" className="relative space-y-8 border-l border-border pl-6">
        {items.map((item, i) => (
          <s.Item key={`${item.title}-${i}`} className="relative">
            <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-primary" aria-hidden />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-fg">
                {item.title} <span className="font-normal text-muted">· {item.organization}</span>
              </h3>
              <span className="text-sm text-muted">
                {item.period}
                {item.location ? ` · ${item.location}` : ""}
              </span>
            </div>
            {item.description && <p className="mt-2 text-sm text-muted">{item.description}</p>}
            {item.bullets && item.bullets.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg">
                {item.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </s.Item>
        ))}
      </s.List>
    </Section>
  );
}

/** Puts emphasis on `highlight` inside `text`. */
export function Highlight({ text, highlight }: { text: string; highlight?: string }) {
  const s = useSkin();
  if (!highlight || !text.includes(highlight)) return <>{text}</>;
  const [before, after] = text.split(highlight, 2);
  return (
    <>
      {before}
      <span className={s.highlight}>{highlight}</span>
      {after}
    </>
  );
}

export function FieldShell({
  id,
  label,
  required,
  helpText,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : helpText ? (
        <p className="text-xs text-muted">{helpText}</p>
      ) : null}
    </div>
  );
}
