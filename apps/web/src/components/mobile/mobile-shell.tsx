"use client";

import { type ClipboardEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";

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
  subscribeRuntimeEvents,
  uploadSessionImage,
} from "@/lib/api/bridge";
import type { BridgeRuntimeEvent, SessionAttachment } from "@/lib/api/bridge";
import { getClipboardImageFiles, readClipboardImageFiles } from "@/lib/clipboard";

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
  const topbarRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(initialActiveWorkspace);
  const [activeSession, setActiveSession] = useState<Session | null>(initialActiveSession);
  const [composerValue, setComposerValue] = useState("");
  const [attachments, setAttachments] = useState<SessionAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionDrawerOpen, setIsSessionDrawerOpen] = useState(false);
  const [isWorkspaceDrawerOpen, setIsWorkspaceDrawerOpen] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const [isRunActive, setIsRunActive] = useState(false);
  const [isRunning, startRunTransition] = useTransition();
  const hasInitialSnapshot = initialWorkspaces.length > 0 || initialSessions.length > 0 || initialActiveSession !== null;
  const activeSessionId = activeSession?.id ?? null;
  const activeMessageCount = activeSession?.messages.length ?? 0;
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const currentMessageRef = useRef<HTMLElement | null>(null);
  const sessionCacheRef = useRef(
    new Map<string, Session>(initialActiveSession ? [[initialActiveSession.id, initialActiveSession]] : []),
  );
  const storageKey = "relay.mobile.snapshot.v1";

  const syncLayoutMetrics = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const topbarHeight = topbarRef.current?.offsetHeight ?? 0;
    const composerHeight = composerRef.current?.offsetHeight ?? 0;

    if (topbarHeight > 0) {
      root.style.setProperty("--mobile-topbar-height", `${topbarHeight}px`);
    }

    if (composerHeight > 0) {
      root.style.setProperty("--mobile-composer-height", `${composerHeight}px`);
    }
  }, []);

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
      setPendingSessionId(null);
      setPendingWorkspaceId(null);
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, [bridgeOfflineMessage]);

  const refreshActiveSessionInBackground = useCallback(async (sessionId: string) => {
    try {
      const detail = await getSession(sessionId, { fresh: true });
      sessionCacheRef.current.set(sessionId, detail.item);
      setActiveSession((current) => (current && current.id === sessionId ? detail.item : current));
    } catch {}
  }, []);

  const handleRealtimeEvent = useCallback(
    (event: BridgeRuntimeEvent) => {
      const currentSessionId = activeSessionId;
      if (!currentSessionId) {
        return;
      }

      if (event.type === "thread.list.changed") {
        void refreshMobileData(undefined, { silent: true });
        return;
      }

      const eventSessionId = "sessionId" in event && typeof event.sessionId === "string" ? event.sessionId : null;
      if (eventSessionId && eventSessionId !== currentSessionId) {
        return;
      }

      if (
        event.type === "run.completed" ||
        event.type === "run.failed" ||
        event.type === "thread.updated" ||
        event.type === "thread.broken" ||
        event.type === "thread.deleted_or_missing"
      ) {
        void refreshActiveSessionInBackground(currentSessionId);
      }
    },
    [activeSessionId, refreshActiveSessionInBackground, refreshMobileData],
  );

  useEffect(() => {
    if (!hasInitialSnapshot) {
      const cached = readMobileSnapshot(storageKey);
      if (cached) {
        setWorkspaces(cached.workspaces);
        setSessions(cached.sessions);
        setActiveWorkspace(cached.activeWorkspace);
        setActiveSession(cached.activeSession);
        cached.activeSession && sessionCacheRef.current.set(cached.activeSession.id, cached.activeSession);
        setRestoredFromCache(true);
      }
      void refreshMobileData(undefined, { silent: true });
    }
  }, [hasInitialSnapshot, refreshMobileData]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    return subscribeRuntimeEvents({ sessionId: activeSessionId }, handleRealtimeEvent, () => {});
  }, [activeSessionId, handleRealtimeEvent]);

  useEffect(() => {
    writeMobileSnapshot(storageKey, {
      activeSession,
      activeWorkspace,
      sessions,
      workspaces,
    });
  }, [activeSession, activeWorkspace, sessions, workspaces]);

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
      const viewportHeight = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      root.style.setProperty("--mobile-app-height", `${viewportHeight}px`);

      if (!viewport) {
        root.style.setProperty("--mobile-viewport-bottom-offset", "0px");
        root.style.setProperty("--mobile-ios-bottom-boost", isIosSafari ? "52px" : "0px");
        syncLayoutMetrics();
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
      syncLayoutMetrics();
    };

    updateViewportOffset();

    if (!viewport) {
      window.addEventListener("resize", updateViewportOffset);
      window.addEventListener("focusin", updateViewportOffset);
      window.addEventListener("focusout", updateViewportOffset);
      return () => {
        window.removeEventListener("resize", updateViewportOffset);
        window.removeEventListener("focusin", updateViewportOffset);
        window.removeEventListener("focusout", updateViewportOffset);
        root.style.removeProperty("--mobile-app-height");
        root.style.removeProperty("--mobile-viewport-bottom-offset");
        root.style.removeProperty("--mobile-ios-bottom-boost");
      };
    }

    viewport.addEventListener("resize", updateViewportOffset);
    viewport.addEventListener("scroll", updateViewportOffset);
    window.addEventListener("orientationchange", updateViewportOffset);
    window.addEventListener("focusin", updateViewportOffset);
    window.addEventListener("focusout", updateViewportOffset);

    return () => {
      viewport.removeEventListener("resize", updateViewportOffset);
      viewport.removeEventListener("scroll", updateViewportOffset);
      window.removeEventListener("orientationchange", updateViewportOffset);
      window.removeEventListener("focusin", updateViewportOffset);
      window.removeEventListener("focusout", updateViewportOffset);
      root.style.removeProperty("--mobile-app-height");
      root.style.removeProperty("--mobile-viewport-bottom-offset");
      root.style.removeProperty("--mobile-ios-bottom-boost");
    };
  }, [syncLayoutMetrics]);

  useEffect(() => {
    syncLayoutMetrics();
    if (typeof window === "undefined") {
      return;
    }

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          syncLayoutMetrics();
        });

    if (resizeObserver && topbarRef.current) {
      resizeObserver.observe(topbarRef.current);
    }
    if (resizeObserver && composerRef.current) {
      resizeObserver.observe(composerRef.current);
    }

    window.addEventListener("resize", syncLayoutMetrics);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncLayoutMetrics);
    };
  }, [syncLayoutMetrics]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      currentMessageRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeMessageCount, activeSessionId]);

  useEffect(() => {
    if (!restoredFromCache) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRestoredFromCache(false);
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [restoredFromCache]);

  async function handleSelectSession(sessionId: string) {
    try {
      setError(null);
      setPendingSessionId(sessionId);
      setIsSessionDrawerOpen(false);
      const cached = sessionCacheRef.current.get(sessionId);
      if (cached) {
        setActiveSession(cached);
      }
      void selectSession(sessionId);
      const detail = await loadSessionDetail(sessionId, sessionCacheRef.current);
      setActiveSession(detail);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : bridgeOfflineMessage);
    } finally {
      setPendingSessionId(null);
    }
  }

  async function handleSelectWorkspace(workspace: Workspace) {
    try {
      setError(null);
      setPendingWorkspaceId(workspace.id);
      setIsWorkspaceDrawerOpen(false);
      setActiveWorkspace(workspace);
      await openWorkspace(workspace.localPath);
      await refreshMobileData();
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : bridgeOfflineMessage);
    } finally {
      setPendingWorkspaceId(null);
    }
  }

  async function handleCreateSession() {
    if (!activeWorkspace) {
      return;
    }

    try {
      setError(null);
      setPendingSessionId("__creating__");
      setIsSessionDrawerOpen(false);
      const created = await createSession(`Session ${new Date().toLocaleTimeString()}`);
      await refreshMobileData(created.item.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : bridgeOfflineMessage);
    } finally {
      setPendingSessionId(null);
    }
  }

  async function handleRun() {
    if (!activeSession || (!composerValue.trim() && attachments.length === 0)) {
      return;
    }

    const prompt = composerValue.trim();
    const originalSessionId = activeSession.id;
    let materializedSessionId = originalSessionId;
    const userMessage = createOptimisticMessage(
      activeSession.id,
      "user",
      formatUserMessagePreview(prompt, attachments),
      activeSession.messages.length + 1,
    );
    const assistantMessage = createOptimisticMessage(
      activeSession.id,
      "assistant",
      "",
      activeSession.messages.length + 2,
      "streaming",
    );

    setComposerValue("");
    setAttachments([]);
    setIsRunActive(true);
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
          await runSessionStream(originalSessionId, prompt, attachments, (event) => {
            if (event.type === "run.started" && event.sessionId !== materializedSessionId) {
              materializedSessionId = event.sessionId;
              setSessions((current) => replaceSessionId(current, originalSessionId, event.sessionId));
              const cachedSession = sessionCacheRef.current.get(originalSessionId);
              if (cachedSession) {
                sessionCacheRef.current.delete(originalSessionId);
                sessionCacheRef.current.set(event.sessionId, {
                  ...cachedSession,
                  id: event.sessionId,
                  messages: cachedSession.messages.map((message) => ({
                    ...message,
                    sessionId: event.sessionId,
                  })),
                });
              }
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
        } finally {
          setIsRunActive(false);
        }
      })();
    });
  }

  function scrollToLatest() {
    currentMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  function handleComposerFocus() {
    if (typeof window === "undefined") {
      return;
    }

    window.setTimeout(() => {
      syncLayoutMetrics();
      scrollToLatest();
      composerInputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 140);
  }

  async function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!activeSession) {
      return;
    }

    let imageFiles = getClipboardImageFiles(event.clipboardData);

    if (imageFiles.length === 0) {
      imageFiles = await readClipboardImageFiles();
    }

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    setError(null);

    try {
      const uploaded = await Promise.all(imageFiles.map((file) => uploadSessionImage(activeSession.id, file)));
      setAttachments((current) => [...current, ...uploaded.map((item) => item.item)]);
      syncLayoutMetrics();
    } catch (pasteError) {
      setError(pasteError instanceof Error ? pasteError.message : bridgeOfflineMessage);
    }
  }

  function handleRemoveAttachment(attachmentPath: string) {
    setAttachments((current) => current.filter((attachment) => attachment.path !== attachmentPath));
    syncLayoutMetrics();
  }

  const statusLabel = error
    ? messages.mobile.offline
    : isRunActive || isRunning
      ? messages.mobile.running
      : pendingWorkspaceId
        ? messages.mobile.switchingWorkspace
        : pendingSessionId === "__creating__"
          ? messages.mobile.creatingSession
          : pendingSessionId
            ? messages.mobile.switchingSession
            : isLoading
              ? messages.mobile.syncing
              : restoredFromCache
                ? messages.mobile.restored
                : messages.mobile.online;

  const statusDetail = error
    ? error
    : restoredFromCache
      ? messages.mobile.cachedSnapshot
      : `${messages.mobile.currentSession} · ${activeSession?.title ?? messages.mobile.noSession}`;

  return (
    <main className="mobile-app">
      <div className="mobile-topbar" ref={topbarRef}>
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
          sessionName={activeSession?.title ?? messages.mobile.noSession}
          sessionsLabel={messages.mobile.sessions}
          statusDetail={statusDetail}
          statusLabel={statusLabel}
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
        attachments={attachments}
        composerValue={composerValue}
        disabled={!activeSession}
        isRunning={isRunning}
        onChange={setComposerValue}
        onFocus={handleComposerFocus}
        onPaste={handleComposerPaste}
        onRemoveAttachment={handleRemoveAttachment}
        onRun={() => void handleRun()}
        placeholder=""
        textareaRef={composerInputRef}
        wrapperRef={composerRef}
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
        pendingSessionId={pendingSessionId}
        sessions={sessions.filter((session) => session.workspaceId === activeWorkspace?.id)}
        title={messages.mobile.sessions}
      />

      <MobileWorkspaceDrawer
        activeWorkspaceId={activeWorkspace?.id ?? null}
        closeLabel={messages.settings.close}
        emptyLabel={messages.workspace.noWorkspace}
        isOpen={isWorkspaceDrawerOpen}
        onClose={() => setIsWorkspaceDrawerOpen(false)}
        onSelect={(workspace) => void handleSelectWorkspace(workspace)}
        pendingWorkspaceId={pendingWorkspaceId}
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
  id = `mobile-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
): Message {
  const now = new Date().toISOString();

  return {
    id,
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

  if (event.type === "process.delta") {
    return upsertProcessMessage(session, assistantMessageId, event);
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
      message.id === assistantMessageId || (message.role === "system" && message.status === "streaming")
        ? { ...message, status: "completed", updatedAt: event.createdAt }
        : message,
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
      message.id === assistantMessageId || (message.role === "system" && message.status === "streaming")
        ? { ...message, status: "error", updatedAt: event.createdAt }
        : message,
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

function replaceSessionId(sessions: Session[], originalSessionId: string, nextSessionId: string) {
  return sessions.map((session) =>
    session.id === originalSessionId
      ? {
          ...session,
          id: nextSessionId,
        }
      : session,
  );
}

function markStreamingMessageErrored(session: Session | null) {
  if (!session) {
    return session;
  }

  const messages: Message[] = session.messages.map((message) =>
    (message.role === "assistant" || message.role === "system") && message.status === "streaming"
      ? { ...message, status: "error" }
      : message,
  );

  const nextSession: Session = {
    ...session,
    messages,
  };
  return nextSession;
}

function upsertProcessMessage(
  session: Session,
  assistantMessageId: string,
  event: Extract<RuntimeEvent, { type: "process.delta" }>,
) {
  const processMessageId = `${assistantMessageId}:${event.phase}`;
  const existingMessage = session.messages.find((message) => message.id === processMessageId);
  const nextContent = appendProcessContent(existingMessage?.content ?? "", event.phase, event.delta);

  if (existingMessage) {
    const messages = session.messages.map((message) =>
      message.id === processMessageId
        ? {
            ...message,
            content: nextContent,
            status: "streaming" as const,
            updatedAt: event.createdAt,
          }
        : message,
    );

    return {
      ...session,
      updatedAt: event.createdAt,
      messages,
    };
  }

  const assistantIndex = session.messages.findIndex((message) => message.id === assistantMessageId);
  const nextMessage = createOptimisticMessage(
    session.id,
    "system",
    nextContent,
    Math.max(1, session.messages.length),
    "streaming",
    processMessageId,
  );
  nextMessage.createdAt = event.createdAt;
  nextMessage.updatedAt = event.createdAt;

  const messages = [...session.messages];
  const insertAt = assistantIndex >= 0 ? assistantIndex : messages.length;
  messages.splice(insertAt, 0, nextMessage);

  return {
    ...session,
    updatedAt: event.createdAt,
    messages: resequenceMessages(messages),
  };
}

function appendProcessContent(
  current: string,
  phase: Extract<RuntimeEvent, { type: "process.delta" }>["phase"],
  delta: string,
) {
  const normalizedDelta = phase === "command" ? delta : delta.trimStart();
  if (!normalizedDelta) {
    return current;
  }

  const title = PROCESS_TITLES[phase];
  const sectionHeader = `**${title}**\n`;
  const sectionPrefix = current ? "\n\n" : "";

  if (!current.includes(sectionHeader)) {
    return `${current}${sectionPrefix}${sectionHeader}${normalizedDelta}`;
  }

  return `${current}${normalizedDelta}`;
}

function resequenceMessages(messages: Message[]) {
  return messages.map((message, index) => ({
    ...message,
    sequence: index + 1,
  }));
}

const PROCESS_TITLES = {
  thinking: "Thinking",
  plan: "Plan",
  command: "Command",
} as const;

type MobileSnapshot = {
  activeSession: Session | null;
  activeWorkspace: Workspace | null;
  sessions: Session[];
  workspaces: Workspace[];
};

function readMobileSnapshot(storageKey: string): MobileSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as MobileSnapshot;
  } catch {
    return null;
  }
}

function writeMobileSnapshot(storageKey: string, snapshot: MobileSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {}
}

function formatUserMessagePreview(text: string, attachments: SessionAttachment[]) {
  const attachmentPreview = attachments.map((attachment) => `[Image: ${attachment.name}]`).join("\n");

  if (text && attachmentPreview) {
    return `${text}\n${attachmentPreview}`;
  }

  return text || attachmentPreview;
}
