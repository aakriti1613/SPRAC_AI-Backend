import type { SkillsProps } from "@contracts";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function SkillsView({ heading, groups }: SkillsProps) {
  const s = useSkin();
  const Marquee = s.Marquee;
  if (Marquee) {
    // Astonishing: each group becomes an endless row of chips.
    return (
      <Section>
        <SectionTitle title={heading} />
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.name}>
              <h3 className="mb-3 font-semibold text-fg">{g.name}</h3>
              <Marquee>
                {g.items.map((item) => (
                  <span key={item} className={cn(s.chip, "whitespace-nowrap")}>
                    {item}
                  </span>
                ))}
              </Marquee>
            </div>
          ))}
        </div>
      </Section>
    );
  }
  return (
    <Section>
      <SectionTitle title={heading} />
      <s.List as="div" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <s.Item as="div" key={g.name} className={cn(s.cardInteractive, "p-5")}>
            <h3 className="mb-3 font-semibold text-fg">{g.name}</h3>
            <ul className="flex flex-wrap gap-2">
              {g.items.map((item) => (
                <li key={item} className={s.chip}>
                  {item}
                </li>
              ))}
            </ul>
          </s.Item>
        ))}
      </s.List>
    </Section>
  );
}
