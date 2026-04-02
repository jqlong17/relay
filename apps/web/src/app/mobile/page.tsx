import type { Session, Workspace } from "@relay/shared-types";

import { bridgeFetch } from "@/app/api/bridge/_lib";
import { MobileShell } from "@/components/mobile/mobile-shell";
import { loadUiConfig } from "@/config/ui.config";

export default async function MobilePage() {
  const uiConfig = loadUiConfig();
  const initialData = await loadInitialMobileData();

  return (
    <MobileShell
      initialActiveSession={initialData.activeSession}
      initialActiveWorkspace={initialData.activeWorkspace}
      initialSessions={initialData.sessions}
      initialWorkspaces={initialData.workspaces}
      language={uiConfig.language}
    />
  );
}

async function loadInitialMobileData() {
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
    };

    const targetSessionId = sessionsData.items[0]?.id;

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
