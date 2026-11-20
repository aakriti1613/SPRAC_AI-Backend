import type { ProjectsProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function ProjectsView({ heading, items }: ProjectsProps) {
  const s = useSkin();
  return (
    <Section alt>
      <SectionTitle title={heading} />
      <s.List className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <s.Item key={p.title} className="h-full">
            <s.Hover className="h-full">
              <article className={cn(s.cardInteractive, "flex h-full flex-col overflow-hidden", p.featured && s.cardFeatured)}>
                {p.image && <img src={p.image} alt="" className="aspect-video w-full object-cover" />}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-fg">{p.title}</h3>
                    {p.featured && <span className="rounded-sparc bg-primary-soft px-2 py-0.5 text-xs text-primary">Featured</span>}
                  </div>
                  <p className="mt-2 flex-1 text-sm text-muted">{p.description}</p>
                  {p.tags && p.tags.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {p.tags.map((t) => (
                        <li key={t} className="rounded-sparc bg-bg px-2 py-0.5 text-xs text-muted">
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(p.href || p.repoHref) && (
                    <div className="mt-4 flex gap-4 text-sm">
                      {p.href && (
                        <SparcLink href={p.href} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Icon name="Globe" /> Live
                        </SparcLink>
                      )}
                      {p.repoHref && (
                        <SparcLink href={p.repoHref} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Icon name="Code" /> Code
                        </SparcLink>
                      )}
                    </div>
                  )}
                </div>
              </article>
            </s.Hover>
          </s.Item>
        ))}
      </s.List>
    </Section>
  );
}
