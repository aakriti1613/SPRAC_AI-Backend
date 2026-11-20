import type { TeamProps } from "@contracts";
import { Icon, SOCIAL_ICONS } from "@core/icons";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

export default function TeamView({ heading, members }: TeamProps) {
  const s = useSkin();
  return (
    <Section>
      <SectionTitle title={heading} />
      <s.List className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <s.Item key={m.name} className="h-full">
            <s.Hover className="h-full">
              <div className={cn(s.cardInteractive, "h-full p-6 text-center")}>
                {m.photo ? (
                  <img src={m.photo} alt="" className={cn("mx-auto h-20 w-20 rounded-full object-cover", s.level !== "basic" && "ring-4 ring-primary-soft")} />
                ) : (
                  <span
                    className={cn(
                      "mx-auto flex h-20 w-20 items-center justify-center rounded-full text-xl font-semibold",
                      s.level === "basic" ? "bg-primary-soft text-primary" : "bg-gradient-to-br from-primary to-primary-hover text-primary-foreground shadow-md"
                    )}
                    aria-hidden
                  >
                    {initials(m.name)}
                  </span>
                )}
                <h3 className="mt-4 font-semibold text-fg">{m.name}</h3>
                <p className="text-sm text-muted">{m.role}</p>
                {m.links && m.links.length > 0 && (
                  <ul className="mt-3 flex justify-center gap-2">
                    {m.links.map((l) => (
                      <li key={l.href}>
                        <SparcLink href={l.href} ariaLabel={l.label} className="text-muted hover:text-primary">
                          <Icon name={SOCIAL_ICONS[l.type]} />
                        </SparcLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </s.Hover>
          </s.Item>
        ))}
      </s.List>
    </Section>
  );
}
