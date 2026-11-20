import { useState } from "react";
import type { NavbarProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { BrandMark } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function NavbarView({ brand, links, cta }: NavbarProps) {
  const s = useSkin();
  const [open, setOpen] = useState(false);
  return (
    <header className={cn("sticky top-0 z-30", s.navbar)}>
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6" aria-label="Main">
        <SparcLink href="/" ariaLabel={`${brand.name} home`}>
          <BrandMark brand={brand} />
        </SparcLink>
        <ul className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <SparcLink
                href={l.href}
                className={cn(
                  "relative text-sm text-muted transition-colors hover:text-fg",
                  s.level !== "basic" && "after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-primary after:transition-all hover:after:w-full",
                  l.active && "font-medium text-fg"
                )}
              >
                {l.label}
              </SparcLink>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          {cta && (
            <SparcLink href={cta.href} className={s.button("primary", "hidden sm:inline-flex")}>
              {cta.label}
            </SparcLink>
          )}
          <button type="button" className={s.button("ghost", "px-2 md:hidden")} aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? "X" : "Menu"} className="h-5 w-5" />
          </button>
        </div>
      </nav>
      {open && (
        <ul className="space-y-1 border-t border-border px-6 py-3 md:hidden">
          {links.map((l) => (
            <li key={l.href}>
              <SparcLink href={l.href} className="block rounded-sparc px-2 py-2 text-sm text-fg hover:bg-bg" onClick={() => setOpen(false)}>
                {l.label}
              </SparcLink>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
