import type { Session, Workspace } from "@relay/shared-types";

import { bridgeFetch } from "@/app/api/bridge/_lib";
import { MobileShell } from "@/components/mobile/mobile-shell";
import { loadUiConfig } from "@/config/ui.config";
import { getSessionActor, getSessionCookieName, readSessionToken } from "@/lib/auth/session";
import type { RelayAuthSessionResponse } from "@/lib/auth/types";
import type { BridgeRouteStatus } from "@/lib/api/bridge-route-status";
import { resolveBridgeRouteStatus } from "@/lib/realtime/bridge-target";
import { cookies } from "next/headers";

export default async function MobilePage() {
  const uiConfig = loadUiConfig();
  const connection = await loadInitialMobileConnection();
  const initialData = await loadInitialMobileData(connection.routeStatus);

  return (
    <MobileShell
      initialActiveSession={initialData.activeSession}
      initialAuthSession={connection.authSession}
      initialDeviceRoute={connection.routeStatus}
      initialActiveWorkspace={initialData.activeWorkspace}
      initialSessions={initialData.sessions}
      initialWorkspaces={initialData.workspaces}
      language={uiConfig.language}
    />
  );
}

async function loadInitialMobileConnection(): Promise<{
  authSession: RelayAuthSessionResponse["session"];
  routeStatus: BridgeRouteStatus | null;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const authSession = getSessionActor(await readSessionToken(token));

  try {
    return {
      authSession,
      routeStatus: await resolveBridgeRouteStatus(),
    };
  } catch {
    return {
      authSession,
      routeStatus: null,
    };
  }
}

async function loadInitialMobileData(routeStatus: BridgeRouteStatus | null) {
  if (routeStatus?.kind === "unavailable") {
    return {
      workspaces: [] as Workspace[],
      activeWorkspace: null as Workspace | null,
      sessions: [] as Session[],
      activeSession: null as Session | null,
    };
  }

  try {
    const [workspacesResponse, sessionsResponse] = await Promise.all([
      bridgeFetch("/workspaces"),
      bridgeFetch("/sessions"),
    ]);

    if (!workspacesResponse.ok || !sessionsResponse.ok) {
      return {
        workspaces: [] as Workspace[],
        activeWorkspace: null as Workspace | null,
        sessions: [] as Session[],
        activeSession: null as Session | null,
      };
    }

    const workspacesData = (await workspacesResponse.json()) as {
      items: Workspace[];
      active: Workspace | null;
    };
    const sessionsData = (await sessionsResponse.json()) as {
      items: Session[];
      activeWorkspaceId: string | null;
      preferredSessionId?: string | null;
    };

    const targetSessionId = sessionsData.preferredSessionId ?? sessionsData.items[0]?.id;

    if (!targetSessionId) {
      return {
        workspaces: workspacesData.items,
        activeWorkspace: workspacesData.active,
        sessions: sessionsData.items,
        activeSession: null as Session | null,
      };
    }

    const sessionResponse = await bridgeFetch(`/sessions/${targetSessionId}`);
    const sessionData = sessionResponse.ok
      ? ((await sessionResponse.json()) as { item: Session }).item
      : null;

    return {
      workspaces: workspacesData.items,
      activeWorkspace: workspacesData.active,
      sessions: sessionsData.items,
      activeSession: sessionData,
    };
  } catch {
    return {
      workspaces: [] as Workspace[],
      activeWorkspace: null as Workspace | null,
      sessions: [] as Session[],
      activeSession: null as Session | null,
    };
  }
}
