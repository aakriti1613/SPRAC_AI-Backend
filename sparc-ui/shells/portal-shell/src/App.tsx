// Portal shell (dhaancha) for the "admin-portal" website type.
// Routes come from the blueprint's pages; every page fills its rooms through
// <Slot>, so the chosen components can change without touching this code.
import { useEffect, type ReactElement, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { activePages } from "@core/blueprint";
import type { PortalConfig } from "@core/config";
import { SlotsProvider, type SlotRegistry } from "@core/slots";
import { applyTheme } from "@core/theme";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./data/memory";
import type { AuthAdapter, DataAdapter } from "./data/types";
import { readSettings } from "./logic/hooks";
import { PortalProvider, usePortal, useSession } from "./logic/portal";
import { ForgotPasswordPage, LoginPage, SignupPage } from "./pages/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { ModuleRoute } from "./pages/module";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProfilePage, SettingsPage, UsersPage } from "./pages/account";

const PUBLIC_PAGES = new Set(["login", "signup", "forgot-password", "not-found"]);

/** Page id (from the blueprint) -> what to render. */
export const PAGE_ELEMENTS: Record<string, ReactElement> = {
  login: <LoginPage />,
  signup: <SignupPage />,
  "forgot-password": <ForgotPasswordPage />,
  dashboard: <DashboardPage />,
  "module-list": <ModuleRoute page="list" />,
  "module-new": <ModuleRoute page="new" />,
  "module-edit": <ModuleRoute page="edit" />,
  "module-detail": <ModuleRoute page="detail" />,
  profile: <ProfilePage />,
  settings: <SettingsPage />,
  users: <UsersPage />,
  "not-found": <NotFoundPage />,
};

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) return <div className="p-10 text-sm text-muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function DemoBanner() {
  const { data, brand } = usePortal();
  if (data.mode !== "demo" || !readSettings(brand.name).show_demo_banner) return null;
  return (
    <div className="bg-warning/15 px-4 py-2 text-center text-xs text-fg" data-testid="demo-banner">
      Demo mode: data is saved only in this browser. Sign in with <b>{DEMO_EMAIL}</b> / <b>{DEMO_PASSWORD}</b>.
    </div>
  );
}

function PortalRoutes() {
  const { blueprint, enabled } = usePortal();
  return (
    <Routes>
      {activePages(blueprint, enabled).map((page) => {
        const element = PAGE_ELEMENTS[page.id];
        if (!element) throw new Error(`portal shell has no page for blueprint page "${page.id}"`);
        return <Route key={page.id} path={page.path} element={PUBLIC_PAGES.has(page.id) ? element : <RequireAuth>{element}</RequireAuth>} />;
      })}
    </Routes>
  );
}

export function PortalApp({ config, data, auth, registry }: { config: PortalConfig; data: DataAdapter; auth: AuthAdapter; registry: SlotRegistry }) {
  useEffect(() => {
    applyTheme(config.theme);
    document.title = config.brand.name;
  }, [config]);
  return (
    <SlotsProvider registry={registry}>
      <PortalProvider config={config} data={data} auth={auth}>
        <DemoBanner />
        <PortalRoutes />
      </PortalProvider>
    </SlotsProvider>
  );
}
