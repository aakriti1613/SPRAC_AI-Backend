import type { PricingProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function PricingView({ heading, subtitle, plans }: PricingProps) {
  const s = useSkin();
  return (
    <Section alt>
      <SectionTitle title={heading} subtitle={subtitle} center />
      <s.List className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        {plans.map((p) => (
          <s.Item key={p.name} className="h-full">
            <s.Hover className="h-full">
              <div className={cn(s.cardInteractive, "flex h-full flex-col p-6", p.highlighted && cn("border-2", s.cardFeatured))}>
                {p.highlighted && <span className="mb-3 self-start rounded-sparc bg-primary px-2 py-0.5 text-xs text-primary-foreground">Recommended</span>}
                <h3 className="font-semibold text-fg">{p.name}</h3>
                <p className="mt-3">
                  <span className="text-3xl font-bold text-fg">{p.price}</span>
                  {p.period && <span className="text-sm text-muted"> {p.period}</span>}
                </p>
                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-fg">
                      <Icon name="Check" className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}
                    </li>
                  ))}
                </ul>
                <SparcLink href={p.cta.href} className={s.button(p.highlighted ? "primary" : "outline", "mt-6")}>
                  {p.cta.label}
                </SparcLink>
              </div>
            </s.Hover>
          </s.Item>
        ))}
      </s.List>
    </Section>
  );
}
