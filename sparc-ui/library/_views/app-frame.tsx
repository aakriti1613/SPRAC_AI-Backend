import { useState } from "react";
import type { AppFrameProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";
import { BrandMark } from "../_shared/basic";

export default function AppFrame({ brand, navItems, user, onLogout, pageTitle, children }: AppFrameProps) {
  const s = useSkin();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav aria-label="Portal" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {navItems.map((item) => (
        <SparcLink
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-sparc px-3 py-2 text-sm",
            item.active
              ? s.level === "basic"
                ? "bg-primary-soft font-medium text-primary"
                : "bg-gradient-to-r from-primary to-primary-hover font-medium text-primary-foreground shadow-sm shadow-primary/30"
              : cn("text-muted hover:bg-bg hover:text-fg", s.level !== "basic" && "transition-all hover:translate-x-0.5")
          )}
        >
          <Icon name={item.icon ?? "Database"} />
          {item.label}
        </SparcLink>
      ))}
    </nav>
  );
  const userBox = (
    <div className="flex items-center gap-3 border-t border-border p-4">
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary" aria-hidden>
          {user.name.slice(0, 1).toUpperCase() || "?"}
        </span>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-medium text-fg">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.role ?? user.email}</p>
      </div>
      <button type="button" onClick={onLogout} className={s.button("ghost", "px-2")} aria-label="Sign out" title="Sign out">
        <Icon name="LogOut" />
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <BrandMark brand={brand} size="sm" />
        </div>
        {nav}
        {userBox}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-surface">
            <div className="flex h-16 items-center border-b border-border px-5">
              <BrandMark brand={brand} size="sm" />
            </div>
            {nav}
            {userBox}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-border bg-surface px-4 md:hidden">
          <button type="button" className={s.button("ghost", "px-2")} aria-label="Open menu" onClick={() => setOpen(true)}>
            <Icon name="Menu" className="h-5 w-5" />
          </button>
          <span className="truncate font-medium text-fg">{pageTitle ?? brand.name}</span>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
