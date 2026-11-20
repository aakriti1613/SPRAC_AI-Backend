import type { ServicesProps } from "@contracts";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function ServicesView({ heading, subtitle, items }: ServicesProps) {
  const s = useSkin();
  return (
    <Section alt>
      <SectionTitle title={heading} subtitle={subtitle} />
      <s.List className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <s.Item key={item.title} className="h-full">
            <s.Hover className="h-full">
              <div className={cn(s.cardInteractive, "h-full p-6")}>
                <span className={cn(s.iconBadge, "mb-4 h-10 w-10")}>
                  <Icon name={item.icon ?? "Sparkles"} className="h-5 w-5" />
                </span>
                <h3 className="font-semibold text-fg">{item.title}</h3>
                <p className="mt-2 text-sm text-muted">{item.description}</p>
              </div>
            </s.Hover>
          </s.Item>
        ))}
      </s.List>
    </Section>
  );
}
