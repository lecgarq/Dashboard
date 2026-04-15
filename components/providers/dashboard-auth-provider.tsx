"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";

export type DashboardRole = "VIEWER" | "EDITOR" | "ADMIN";

type DashboardAuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: Session["user"] | null;
  role: DashboardRole;
  providers: string[];
  moduleAccess: string[];
  isAuthenticated: boolean;
  isAdmin: boolean;
  isEditor: boolean;
  isViewer: boolean;
  isManager: boolean;
  hasGoogle: boolean;
  hasGoogleChat: boolean;
  hasAutodesk: boolean;
  hasCredentials: boolean;
  hasModuleAccess: (module?: string | null) => boolean;
};

const DashboardAuthContext = createContext<DashboardAuthContextValue | null>(null);

export function DashboardAuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();

  const user = session?.user ?? null;
  const role = ((user as { role?: DashboardRole } | null)?.role ?? "VIEWER") as DashboardRole;
  const providers = ((user as { providers?: string[] } | null)?.providers ?? []).filter(Boolean);
  const moduleAccess = ((user as { moduleAccess?: string[] } | null)?.moduleAccess ?? []).filter(Boolean);
  const accessSet = useMemo(() => new Set(moduleAccess), [moduleAccess]);

  const isAuthenticated = status === "authenticated";
  const isAdmin = role === "ADMIN";
  const isEditor = isAdmin || role === "EDITOR";
  const isViewer = isAuthenticated;
  const isManager = isEditor;
  const hasGoogle = providers.includes("google");
  const hasGoogleChat = providers.includes("google-chat");
  const hasAutodesk = providers.includes("autodesk");
  const hasCredentials = Boolean((user as { hasCredentials?: boolean } | null)?.hasCredentials);

  // Real-time updates via SSE
  useEffect(() => {
    if (status !== "authenticated" || !user?.id) return;

    const source = new EventSource("/api/events/users");

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.userId === user.id) {
          void update();
        }
      } catch (err) {
        // Heartbeat or malformed data
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [user?.id, status, update]);

  const hasModuleAccess = useCallback(
    (module?: string | null) => {
      if (!module) return true;
      if (isAdmin) return true;
      return accessSet.has(module);
    },
    [accessSet, isAdmin]
  );

  const value = useMemo<DashboardAuthContextValue>(
    () => ({
      status,
      user,
      role,
      providers,
      moduleAccess,
      isAuthenticated,
      isAdmin,
      isEditor,
      isViewer,
      isManager,
      hasGoogle,
      hasGoogleChat,
      hasAutodesk,
      hasCredentials,
      hasModuleAccess,
    }),
    [
      hasAutodesk,
      hasCredentials,
      hasGoogle,
      hasGoogleChat,
      hasModuleAccess,
      isAdmin,
      isAuthenticated,
      isEditor,
      isManager,
      isViewer,
      moduleAccess,
      providers,
      role,
      status,
      user,
    ]
  );

  return <DashboardAuthContext.Provider value={value}>{children}</DashboardAuthContext.Provider>;
}

export function useDashboardAuth() {
  const context = useContext(DashboardAuthContext);
  if (!context) {
    throw new Error("useDashboardAuth must be used within DashboardAuthProvider");
  }
  return context;
}
