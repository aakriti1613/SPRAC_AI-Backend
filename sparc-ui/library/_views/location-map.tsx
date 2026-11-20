import type { LocationMapProps } from "@contracts";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function LocationMapView({ heading, address, mapEmbedUrl, hours }: LocationMapProps) {
  const s = useSkin();
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return (
    <Section>
      <SectionTitle title={heading} />
      <div className={cn("grid gap-6", mapEmbedUrl && "md:grid-cols-2")}>
        <s.Reveal>
          <div className={cn(s.card, "space-y-4 p-6")}>
            <p className="flex items-start gap-3 text-fg">
              <span className={cn(s.iconBadge, "h-9 w-9 shrink-0")}>
                <Icon name="MapPin" className="h-5 w-5" />
              </span>
              <span className="whitespace-pre-line pt-1.5">{address}</span>
            </p>
            {hours && hours.length > 0 && (
              <ul className="space-y-1 pl-12 text-sm text-muted">
                {hours.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
            <a href={directions} target="_blank" rel="noreferrer" className="inline-block pl-12 text-sm text-primary underline">
              Get directions
            </a>
          </div>
        </s.Reveal>
        {mapEmbedUrl && (
          <s.Reveal delay={0.1}>
            <iframe title={`Map: ${address}`} src={mapEmbedUrl} loading="lazy" className="h-72 w-full rounded-sparc border border-border" referrerPolicy="no-referrer-when-downgrade" />
          </s.Reveal>
        )}
      </div>
    </Section>
  );
}
