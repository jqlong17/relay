"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { Message, MessageStatus, RuntimeEvent, Session, Workspace } from "@relay/shared-types";
import { MobileComposer } from "@/components/mobile/mobile-composer";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { MobileSessionDrawer } from "@/components/mobile/mobile-session-drawer";
import { MobileThread } from "@/components/mobile/mobile-thread";
import { MobileWorkspaceDrawer } from "@/components/mobile/mobile-workspace-drawer";
import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";
import {
  createSession,
  getSession,
  listSessions,
  listWorkspaces,
  openWorkspace,
  runSessionStream,
  selectSession,
} from "@/lib/api/bridge";

type MobileShellProps = {
  initialActiveSession: Session | null;
  initialActiveWorkspace: Workspace | null;
  initialSessions: Session[];
  initialWorkspaces: Workspace[];
  language: AppLanguage;
};

export function MobileShell({
  initialActiveSession,
  initialActiveWorkspace,
  initialSessions,
  initialWorkspaces,
  language,
}: MobileShellProps) {
  const messages = getMessages(language);
  const bridgeOfflineMessage = messages.workspace.bridgeOffline;
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(initialActiveWorkspace);
  const [activeSession, setActiveSession] = useState<Session | null>(initialActiveSession);
  const [composerValue, setComposerValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionDrawerOpen, setIsSessionDrawerOpen] = useState(false);
  const [isWorkspaceDrawerOpen, setIsWorkspaceDrawerOpen] = useState(false);
  const [isRunning, startRunTransition] = useTransition();
  const hasInitialSnapshot = initialWorkspaces.length > 0 || initialSessions.length > 0 || initialActiveSession !== null;
  const activeSessionId = activeSession?.id ?? null;
  const activeMessageCount = activeSession?.messages.length ?? 0;
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const currentMessageRef = useRef<HTMLElement | null>(null);
  const sessionCacheRef = useRef(
    new Map<string, Session>(initialActiveSession ? [[initialActiveSession.id, initialActiveSession]] : []),
  );

  const refreshMobileData = useCallback(async (nextSessionId?: string, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [workspaceData, sessionData] = await Promise.all([listWorkspaces(), listSessions()]);
      const currentWorkspace = workspaceData.active;

      setWorkspaces(workspaceData.items);
      setActiveWorkspace(currentWorkspace);
      setSessions(sessionData.items);

      const targetSessionId = nextSessionId ?? sessionData.preferredSessionId ?? sessionData.items[0]?.id;
      if (!targetSessionId) {
        setActiveSession(null);
        return;
      }

      const detail = await loadSessionDetail(targetSessionId, sessionCacheRef.current);
      setActiveSession(detail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : bridgeOfflineMessage);
      setWorkspaces([]);
      setSessions([]);
      setActiveWorkspace(null);
      setActiveSession(null);
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, [bridgeOfflineMessage]);

  useEffect(() => {
    if (!hasInitialSnapshot) {
      void refreshMobileData(undefined, { silent: true });
    }
  }, [hasInitialSnapshot, refreshMobileData]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = document.documentElement;
    const viewport = window.visualViewport;
    const userAgent = window.navigator.userAgent;
    const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
    const isIosSafari = isAppleMobile && isSafari;

    const updateViewportOffset = () => {
      if (!viewport) {
        root.style.setProperty("--mobile-viewport-bottom-offset", "0px");
        root.style.setProperty("--mobile-ios-bottom-boost", isIosSafari ? "52px" : "0px");
        return;
      }

      const bottomOffset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const iosBottomBoost =
        isIosSafari
          ? bottomOffset < 8
            ? "56px"
            : bottomOffset < 48
              ? "22px"
              : "0px"
          : "0px";

      root.style.setProperty("--mobile-viewport-bottom-offset", `${bottomOffset}px`);
      root.style.setProperty("--mobile-ios-bottom-boost", iosBottomBoost);
    };

    updateViewportOffset();

    if (!viewport) {
      window.addEventListener("resize", updateViewportOffset);
      return () => {
        window.removeEventListener("resize", updateViewportOffset);
        root.style.removeProperty("--mobile-viewport-bottom-offset");
        root.style.removeProperty("--mobile-ios-bottom-boost");
      };
    }

    viewport.addEventListener("resize", updateViewportOffset);
    viewport.addEventListener("scroll", updateViewportOffset);
    window.addEventListener("orientationchange", updateViewportOffset);

    return () => {
      viewport.removeEventListener("resize", updateViewportOffset);
      viewport.removeEventListener("scroll", updateViewportOffset);
      window.removeEventListener("orientationchange", updateViewportOffset);
      root.style.removeProperty("--mobile-viewport-bottom-offset");
      root.style.removeProperty("--mobile-ios-bottom-boost");
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      currentMessageRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeMessageCount, activeSessionId]);

  async function handleSelectSession(sessionId: string) {
    try {
      setError(null);
      void selectSession(sessionId);
      const detail = await loadSessionDetail(sessionId, sessionCacheRef.current);
      setActiveSession(detail);
      setIsSessionDrawerOpen(false);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : bridgeOfflineMessage);
    }
  }

  async function handleSelectWorkspace(workspace: Workspace) {
    try {
      setError(null);
      await openWorkspace(workspace.localPath);
      setIsWorkspaceDrawerOpen(false);
      await refreshMobileData();
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : bridgeOfflineMessage);
    }
  }

  async function handleCreateSession() {
    if (!activeWorkspace) {
      return;
    }

    try {
      setError(null);
      const created = await createSession(`Session ${new Date().toLocaleTimeString()}`);
      await refreshMobileData(created.item.id);
      setIsSessionDrawerOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : bridgeOfflineMessage);
    }
  }

  async function handleRun() {
    if (!activeSession || !composerValue.trim()) {
      return;
    }

    const prompt = composerValue.trim();
    const originalSessionId = activeSession.id;
    let materializedSessionId = originalSessionId;
    const userMessage = createOptimisticMessage(activeSession.id, "user", prompt, activeSession.messages.length + 1);
    const assistantMessage = createOptimisticMessage(
      activeSession.id,
      "assistant",
      "",
      activeSession.messages.length + 2,
      "streaming",
    );

    setComposerValue("");
    setActiveSession((current) => {
      if (!current || current.id !== activeSession.id) {
        return current;
      }

      const messages: Message[] = [...current.messages, userMessage, assistantMessage];
      const nextSession: Session = {
        ...current,
        turnCount: current.turnCount + 1,
        updatedAt: userMessage.updatedAt,
        messages,
      };
      sessionCacheRef.current.set(nextSession.id, nextSession);
      return nextSession;
    });
    queueMicrotask(scrollToLatest);

    startRunTransition(() => {
      void (async () => {
        try {
          await runSessionStream(originalSessionId, prompt, (event) => {
            if (event.type === "run.started" && event.sessionId !== materializedSessionId) {
              materializedSessionId = event.sessionId;
              setActiveSession((current) =>
                current && current.id === originalSessionId
                  ? {
                      ...current,
                      id: event.sessionId,
                      messages: current.messages.map((message) => ({
                        ...message,
                        sessionId: event.sessionId,
                      })),
                    }
                  : current,
              );
            }

            setActiveSession((current) => {
              const nextSession = applyStreamingEvent(current, event, assistantMessage.id);
              if (nextSession) {
                sessionCacheRef.current.set(nextSession.id, nextSession);
              }
              return nextSession;
            });
            queueMicrotask(scrollToLatest);
          });

          const refreshedSession = await loadSessionDetail(materializedSessionId, sessionCacheRef.current, true);
          setActiveSession(refreshedSession);
          queueMicrotask(scrollToLatest);
        } catch (runError) {
          setError(runError instanceof Error ? runError.message : bridgeOfflineMessage);
          setActiveSession((current) => markStreamingMessageErrored(current));
        }
      })();
    });
  }

  function scrollToLatest() {
    currentMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  return (
    <main className="mobile-app">
      <div className="mobile-topbar">
        <MobileHeader
          brand="Relay"
          isSessionsOpen={isSessionDrawerOpen}
          isWorkspacesOpen={isWorkspaceDrawerOpen}
          onOpenSessions={() => {
            setIsWorkspaceDrawerOpen(false);
            setIsSessionDrawerOpen((current) => !current);
          }}
          onOpenWorkspaces={() => {
            setIsSessionDrawerOpen(false);
            setIsWorkspaceDrawerOpen((current) => !current);
          }}
          sessionsLabel={messages.mobile.sessions}
          statusLabel={messages.mobile.online}
          workspaceName={activeWorkspace?.name ?? messages.workspace.noWorkspace}
          workspacesLabel={messages.mobile.workspaces}
        />

        {error ? <div className="mobile-banner mobile-banner-error">{error}</div> : null}
        {!error && isLoading ? <div className="mobile-banner">{messages.workspace.loading}</div> : null}
      </div>

      <MobileThread
        currentMessageRef={currentMessageRef}
        emptyLabel={messages.workspace.noMessages}
        messages={activeSession?.messages ?? []}
        timelineRef={timelineRef}
      />

      <MobileComposer
        composerValue={composerValue}
        disabled={!activeSession}
        isRunning={isRunning}
        onChange={setComposerValue}
        onRun={() => void handleRun()}
        placeholder=""
        runLabel={messages.common.run}
        runningLabel={messages.workspace.loading}
      />

      <MobileSessionDrawer
        activeSessionId={activeSession?.id ?? null}
        closeLabel={messages.settings.close}
        createLabel={messages.workspace.createSession}
        emptyLabel={messages.workspace.noSession}
        isOpen={isSessionDrawerOpen}
        onClose={() => setIsSessionDrawerOpen(false)}
        onCreate={() => void handleCreateSession()}
        onSelect={(sessionId) => void handleSelectSession(sessionId)}
        sessions={sessions.filter((session) => session.workspaceId === activeWorkspace?.id)}
        title={messages.mobile.sessions}
      />

      <MobileWorkspaceDrawer
        closeLabel={messages.settings.close}
        emptyLabel={messages.workspace.noWorkspace}
        isOpen={isWorkspaceDrawerOpen}
        onClose={() => setIsWorkspaceDrawerOpen(false)}
        onSelect={(workspace) => void handleSelectWorkspace(workspace)}
        title={messages.mobile.workspaces}
        workspaces={workspaces}
      />
    </main>
  );
}

async function loadSessionDetail(
  sessionId: string,
  cache: Map<string, Session>,
  force = false,
) {
  if (!force) {
    const cached = cache.get(sessionId);
    if (cached) {
      return cached;
    }
  }

  const detail = await getSession(sessionId);
  cache.set(sessionId, detail.item);
  return detail.item;
}

function createOptimisticMessage(
  sessionId: string,
  role: Message["role"],
  content: string,
  sequence: number,
  status: MessageStatus = "completed",
): Message {
  const now = new Date().toISOString();

  return {
    id: `mobile-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    sessionId,
    role,
    content,
    status,
    sequence,
    createdAt: now,
    updatedAt: now,
  };
}

function applyStreamingEvent(session: Session | null, event: RuntimeEvent, assistantMessageId: string) {
  if (!session) {
    return session;
  }

  if (event.type === "message.delta") {
    const messages: Message[] = session.messages.map((message) =>
      message.id === assistantMessageId
        ? {
            ...message,
            content: `${message.content}${event.delta}`,
            status: "streaming",
            updatedAt: event.createdAt,
          }
        : message,
    );

    const nextSession: Session = {
      ...session,
      updatedAt: event.createdAt,
      messages,
    };
    return nextSession;
  }

  if (event.type === "message.completed" || event.type === "run.completed") {
    const messages: Message[] = session.messages.map((message) =>
      message.id === assistantMessageId ? { ...message, status: "completed", updatedAt: event.createdAt } : message,
    );

    const nextSession: Session = {
      ...session,
      updatedAt: event.createdAt,
      messages,
    };
    return nextSession;
  }

  if (event.type === "run.failed") {
    const messages: Message[] = session.messages.map((message) =>
      message.id === assistantMessageId ? { ...message, status: "error", updatedAt: event.createdAt } : message,
    );

    const nextSession: Session = {
      ...session,
      updatedAt: event.createdAt,
      messages,
    };
    return nextSession;
  }

  return session;
}

function markStreamingMessageErrored(session: Session | null) {
  if (!session) {
    return session;
  }

  const messages: Message[] = session.messages.map((message) =>
    message.role === "assistant" && message.status === "streaming" ? { ...message, status: "error" } : message,
  );

  const nextSession: Session = {
    ...session,
    messages,
  };
  return nextSession;
}
