// Signed-in layout: fills the app-frame room with the menu, user and page.
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { NavLink } from "@contracts";
import { Slot } from "@core/slots";
import { useRecentChanges } from "../logic/hooks";
import { usePortal, useSession } from "../logic/portal";

function Notifications() {
  const recent = useRecentChanges();
  return (
    <Slot
      room="notifications"
      props={{ items: recent.notifications, onMarkRead: recent.markRead, onMarkAllRead: recent.markAllRead }}
    />
  );
}

export function Frame({ title, children }: { title?: string; children: ReactNode }) {
  const { config, brand, enabled } = usePortal();
  const { user, signOut } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const items: NavLink[] = [
    { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
    ...config.modules.map((m) => ({ label: m.pluralName, href: `/${m.id}`, icon: m.icon ?? "Database" })),
    { label: "Profile", href: "/profile", icon: "UserRound" },
    ...(enabled.has("settings") ? [{ label: "Settings", href: "/settings", icon: "Settings" }] : []),
    ...(enabled.has("users-roles") ? [{ label: "Users", href: "/users", icon: "Users" }] : []),
  ].map((item) => ({ ...item, active: isActive(item.href) }));

  return (
    <Slot
      room="app-frame"
      props={{
        brand,
        navItems: items,
        user: { name: user?.name ?? "", email: user?.email ?? "", avatarUrl: user?.avatarUrl, role: user?.role },
        onLogout: () => {
          signOut().then(() => navigate("/login", { replace: true }));
        },
        pageTitle: title,
        children: (
          <>
            {enabled.has("notifications") && (
              <div className="mb-4 flex justify-end">
                <Notifications />
              </div>
            )}
            {children}
          </>
        ),
      }}
    />
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-sparc border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
      {message}
    </p>
  );
}
