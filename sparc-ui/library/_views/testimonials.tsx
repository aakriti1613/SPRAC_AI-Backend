import type { Testimonial, TestimonialsProps } from "@contracts";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";
import type { Skin } from "../_skins/types";

function Quote({ t, s, className }: { t: Testimonial; s: Skin; className?: string }) {
  return (
    <figure className={cn(s.cardInteractive, "p-6", className)}>
      <blockquote className="text-fg">“{t.quote}”</blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        {t.avatar ? (
          <img src={t.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary" aria-hidden>
            {t.author.slice(0, 1)}
          </span>
        )}
        <span className="text-sm">
          <span className="block font-medium text-fg">{t.author}</span>
          {t.role && <span className="block text-muted">{t.role}</span>}
        </span>
      </figcaption>
    </figure>
  );
}

export default function TestimonialsView({ heading, items }: TestimonialsProps) {
  const s = useSkin();
  const Marquee = s.Marquee;
  return (
    <Section alt>
      <SectionTitle title={heading} />
      {Marquee && items.length > 1 ? (
        <Marquee>
          {items.map((t, i) => (
            <Quote key={`${t.author}-${i}`} t={t} s={s} className="w-80 shrink-0" />
          ))}
        </Marquee>
      ) : (
        <s.List className="grid gap-6 md:grid-cols-2">
          {items.map((t, i) => (
            <s.Item key={`${t.author}-${i}`}>
              <Quote t={t} s={s} />
            </s.Item>
          ))}
        </s.List>
      )}
    </Section>
  );
}
