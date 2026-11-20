// Portal-wide context: config, blueprint, which rooms are on, data + auth.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Brand, RoomId } from "@contracts";
import { enabledRooms, getBlueprint, type ActiveBlueprint } from "@core/blueprint";
import type { PortalConfig, PortalModule } from "@core/config";
import type { AuthAdapter, DataAdapter, SessionUser } from "../data/types";

interface PortalContextValue {
  config: PortalConfig;
  blueprint: ActiveBlueprint;
  enabled: Set<RoomId>;
  data: DataAdapter;
  auth: AuthAdapter;
  brand: Brand;
  moduleById(id: string | undefined): PortalModule | undefined;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used inside <PortalProvider>");
  return ctx;
}

interface SessionValue {
  user: SessionUser | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(values: { name: string; email: string; password: string }): Promise<"signed-in" | "confirm-email">;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  updateProfile(values: { name?: string; avatarUrl?: string }): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <PortalProvider>");
  return ctx;
}

export function PortalProvider({
  config,
  data,
  auth,
  children,
}: {
  config: PortalConfig;
  data: DataAdapter;
  auth: AuthAdapter;
  children: ReactNode;
}) {
  const blueprint = getBlueprint("admin-portal");
  const enabled = useMemo(() => enabledRooms(blueprint, config.rooms.enabled), [blueprint, config.rooms.enabled]);
  const portal = useMemo<PortalContextValue>(
    () => ({
      config,
      blueprint,
      enabled,
      data,
      auth,
      brand: config.brand,
      moduleById: (id) => config.modules.find((m) => m.id === id),
    }),
    [config, blueprint, enabled, data, auth]
  );

  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    auth
      .current()
      .then((u) => alive && setUser(u))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [auth]);

  const signIn = useCallback(async (email: string, password: string) => setUser(await auth.signIn(email, password)), [auth]);
  const signUp = useCallback(
    async (values: { name: string; email: string; password: string }) => {
      const u = await auth.signUp(values);
      if (u) setUser(u);
      return u ? ("signed-in" as const) : ("confirm-email" as const);
    },
    [auth]
  );
  const resetPassword = useCallback((email: string) => auth.resetPassword(email), [auth]);
  const signOut = useCallback(async () => {
    await auth.signOut();
    setUser(null);
  }, [auth]);
  const updateProfile = useCallback(async (values: { name?: string; avatarUrl?: string }) => setUser(await auth.updateProfile(values)), [auth]);

  const session = useMemo<SessionValue>(
    () => ({ user, loading, signIn, signUp, resetPassword, signOut, updateProfile }),
    [user, loading, signIn, signUp, resetPassword, signOut, updateProfile]
  );

  return (
    <PortalContext.Provider value={portal}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </PortalContext.Provider>
  );
}

/** Turn any thrown value into a message for the UI. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
