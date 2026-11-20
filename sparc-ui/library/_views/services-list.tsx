import type { ServicesListProps } from "@contracts";
import { Icon } from "@core/icons";
import { money } from "@core/money";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function ServicesListView({ heading, subtitle, services, currency, selectedId, onSelect }: ServicesListProps) {
  const s = useSkin();
  return (
    <Section alt>
      <SectionTitle title={heading} subtitle={subtitle} />
      <s.List className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((svc) => {
          const chosen = svc.id === selectedId;
          return (
            <s.Item key={svc.id} className="h-full">
              <s.Hover className="h-full">
                <button
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => onSelect(svc.id)}
                  className={cn(s.cardInteractive, "flex h-full w-full flex-col p-6 text-left", chosen && cn("border-2", s.cardFeatured))}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-fg">{svc.name}</span>
                    {chosen && <Icon name="CircleCheck" className="h-5 w-5 shrink-0 text-primary" label="Selected" />}
                  </span>
                  {svc.description && <span className="mt-2 text-sm text-muted">{svc.description}</span>}
                  <span className="mt-4 flex items-center gap-4 text-sm text-fg">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="CalendarClock" /> {svc.durationMin} min
                    </span>
                    <span className="font-semibold">{svc.price === undefined || svc.price === 0 ? "Free" : money(svc.price, currency)}</span>
                  </span>
                </button>
              </s.Hover>
            </s.Item>
          );
        })}
      </s.List>
    </Section>
  );
}
