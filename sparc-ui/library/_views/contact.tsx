import type { ContactProps } from "@contracts";
import { Icon, SOCIAL_ICONS } from "@core/icons";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function ContactView({ heading, text, links, availability }: ContactProps) {
  const s = useSkin();
  return (
    <Section>
      <SectionTitle title={heading} subtitle={text} />
      {availability && (
        <p className="-mt-6 mb-8 inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-sm text-success">
          <span className={cn("h-2 w-2 rounded-full bg-success", s.level !== "basic" && "animate-pulse")} aria-hidden /> {availability}
        </p>
      )}
      <s.List className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <s.Item key={l.href}>
            <s.Hover>
              <SparcLink href={l.href} className={cn(s.cardInteractive, "flex items-center gap-3 p-4 hover:border-primary")}>
                <span className={cn(s.iconBadge, "h-9 w-9 shrink-0")}>
                  <Icon name={SOCIAL_ICONS[l.type]} className="h-5 w-5" />
                </span>
                <span className="truncate text-fg">{l.label}</span>
              </SparcLink>
            </s.Hover>
          </s.Item>
        ))}
      </s.List>
    </Section>
  );
}
