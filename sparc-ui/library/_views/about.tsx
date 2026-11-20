import type { AboutProps } from "@contracts";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function AboutView({ heading, body, image, highlights }: AboutProps) {
  const s = useSkin();
  return (
    <Section>
      <div className={cn("grid gap-10", image && "md:grid-cols-[2fr_1fr]")}>
        <div>
          <SectionTitle title={heading} />
          <s.Reveal>
            <p className="whitespace-pre-line text-lg leading-relaxed text-fg">{body}</p>
          </s.Reveal>
          {highlights && highlights.length > 0 && (
            <s.List as="div" className="mt-8 flex flex-wrap gap-4">
              {highlights.map((h) => (
                <s.Item as="div" key={h.label}>
                  <dl className={cn(s.card, "px-5 py-3")}>
                    <dt className="text-xs text-muted">{h.label}</dt>
                    <dd className="font-semibold text-fg">
                      <s.Count value={h.value} />
                    </dd>
                  </dl>
                </s.Item>
              ))}
            </s.List>
          )}
        </div>
        {image && (
          <s.Reveal delay={0.1}>
            <s.Hover>
              <img src={image.src} alt={image.alt} className="w-full rounded-sparc border border-border object-cover" />
            </s.Hover>
          </s.Reveal>
        )}
      </div>
    </Section>
  );
}
