import type { FooterProps } from "@contracts";
import { Icon, SOCIAL_ICONS } from "@core/icons";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { BrandMark } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function FooterView({ brand, text, links, socialLinks, copyright }: FooterProps) {
  const s = useSkin();
  return (
    <footer className={cn("border-t border-border bg-surface", s.level !== "basic" && "bg-gradient-to-b from-surface to-primary-soft/30")}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <BrandMark brand={brand} size="sm" />
          {text && <p className="text-sm text-muted">{text}</p>}
        </div>
        {links && links.length > 0 && (
          <ul className="flex flex-wrap gap-4 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <SparcLink href={l.href} className="text-muted transition-colors hover:text-fg">
                  {l.label}
                </SparcLink>
              </li>
            ))}
          </ul>
        )}
        {socialLinks && socialLinks.length > 0 && (
          <ul className="flex gap-2">
            {socialLinks.map((sl) => (
              <li key={sl.href}>
                <SparcLink href={sl.href} ariaLabel={sl.label} className={cn("flex h-9 w-9 items-center justify-center rounded-sparc border border-border text-muted transition-colors hover:border-primary hover:text-primary", s.level !== "basic" && "shadow-sm")}>
                  <Icon name={SOCIAL_ICONS[sl.type]} />
                </SparcLink>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-border px-6 py-4 text-center text-xs text-muted">{copyright}</p>
    </footer>
  );
}
