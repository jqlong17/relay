"use client";

import { type ClipboardEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { Message, MessageStatus, RuntimeEvent, Session, Workspace } from "@relay/shared-types";
import { MobileComposer } from "@/components/mobile/mobile-composer";
import { MobileLayoutDebugPanel } from "@/components/mobile/mobile-layout-debug-panel";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { MobileMemoriesDrawer } from "@/components/mobile/mobile-memories-drawer";
import { MobileSessionDrawer } from "@/components/mobile/mobile-session-drawer";
import { MobileThread } from "@/components/mobile/mobile-thread";
import { MobileTopTabs } from "@/components/mobile/mobile-top-tabs";
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
import {
  captureMobileLayoutSnapshot,
  createMobileLayoutDiagnosticsStore,
  describeDiagnosticTarget,
  isMobileLayoutDiagnosticsEnabled,
  type MobileLayoutDiagnosticEntry,
  type MobileLayoutDiagnosticsStore,
} from "@/lib/debug/mobile-layout-diagnostics";

type MobilePanelKey = "workspaces" | "sessions" | "memories";

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
  const appRef = useRef<HTMLElement | null>(null);
  const topbarRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerFocusStabilizeTimerRef = useRef<number | null>(null);
  const composerFocusRafRef = useRef<number | null>(null);
  const diagnosticsStoreRef = useRef<MobileLayoutDiagnosticsStore | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(initialActiveWorkspace);
  const [activeSession, setActiveSession] = useState<Session | null>(initialActiveSession);
  const [composerValue, setComposerValue] = useState("");
  const [attachments, setAttachments] = useState<SessionAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activePanel, setActivePanel] = useState<MobilePanelKey | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const [manualWorkspacePath, setManualWorkspacePath] = useState("");
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const [isRunActive, setIsRunActive] = useState(false);
  const [diagnosticEntries, setDiagnosticEntries] = useState<MobileLayoutDiagnosticEntry[]>([]);
  const [isDiagnosticsEnabled, setIsDiagnosticsEnabled] = useState(false);
  const [isRunning, startRunTransition] = useTransition();
  const hasInitialSnapshot = initialWorkspaces.length > 0 || initialSessions.length > 0 || initialActiveSession !== null;
  const activeSessionId = activeSession?.id ?? null;
  const activeMessageCount = activeSession?.messages.length ?? 0;
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const currentMessageRef = useRef<HTMLElement | null>(null);
  const isUnmountedRef = useRef(false);
  const sessionCacheRef = useRef(
    new Map<string, Session>(initialActiveSession ? [[initialActiveSession.id, initialActiveSession]] : []),
  );
  const storageKey = "relay.mobile.snapshot.v1";
  const favoriteWorkspaceStorageKey = "relay.mobile.favorite-workspaces.v1";
  const [starredWorkspaceIds, setStarredWorkspaceIds] = useState<string[]>([]);

  const recordLayoutDiagnostic = useCallback((type: string, note = "", target?: EventTarget | null) => {
    const diagnosticsStore = diagnosticsStoreRef.current;
    if (!diagnosticsStore || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    diagnosticsStore.record({
      note,
      snapshot: captureMobileLayoutSnapshot({
        appRoot: appRef.current,
        composer: composerRef.current,
        input: composerInputRef.current,
        timeline: timelineRef.current,
        topbar: topbarRef.current,
      }),
      target: describeDiagnosticTarget(target ?? document.activeElement),
      type,
    });
  }, []);

  const clearComposerFocusStabilization = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (composerFocusStabilizeTimerRef.current !== null) {
      window.clearTimeout(composerFocusStabilizeTimerRef.current);
      composerFocusStabilizeTimerRef.current = null;
    }
    if (composerFocusRafRef.current !== null) {
      window.cancelAnimationFrame(composerFocusRafRef.current);
      composerFocusRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      clearComposerFocusStabilization();
    };
  }, [clearComposerFocusStabilization]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const enabled = isMobileLayoutDiagnosticsEnabled(window.location.search, window.localStorage);
    setIsDiagnosticsEnabled(enabled);

    if (!enabled) {
      diagnosticsStoreRef.current = null;
      setDiagnosticEntries([]);
      return;
    }

    const diagnosticsStore = createMobileLayoutDiagnosticsStore({
      onChange: setDiagnosticEntries,
      sessionStorage: window.sessionStorage,
    });
    diagnosticsStoreRef.current = diagnosticsStore;
    setDiagnosticEntries(diagnosticsStore.getEntries());
    recordLayoutDiagnostic("diagnostics.enabled", "mobile layout diagnostics ready");

    return () => {
      if (diagnosticsStoreRef.current === diagnosticsStore) {
        diagnosticsStoreRef.current = null;
      }
    };
  }, [recordLayoutDiagnostic]);

  const syncLayoutMetrics = useCallback((reason = "") => {
    if (typeof window === "undefined") {
      return;
    }

    const appRoot = appRef.current;
    if (!appRoot) {
      return;
    }

    const topbarHeight = topbarRef.current?.offsetHeight ?? 0;
    const composerHeight = composerRef.current?.offsetHeight ?? 0;

    if (topbarHeight > 0) {
      appRoot.style.setProperty("--mobile-topbar-height", `${topbarHeight}px`);
    }

    if (composerHeight > 0) {
      appRoot.style.setProperty("--mobile-composer-height", `${composerHeight}px`);
    }

    if (composerHeight > 0) {
      const viewport = window.visualViewport;
      const viewportBottom = viewport ? Math.min(window.innerHeight, viewport.height + viewport.offsetTop) : window.innerHeight;
      const iosBottomBoost = parseCssPixelValue(getComputedStyle(appRoot).getPropertyValue("--mobile-ios-bottom-boost")) ?? 0;
      const keyboardFallbackReserve =
        parseCssPixelValue(getComputedStyle(appRoot).getPropertyValue("--mobile-keyboard-fallback-reserve")) ?? 0;
      const composerTop = Math.max(
        topbarHeight,
        viewportBottom - composerHeight - iosBottomBoost - keyboardFallbackReserve,
      );
      appRoot.style.setProperty("--mobile-composer-top", `${composerTop}px`);
    }
    if (reason) {
      recordLayoutDiagnostic("layout.sync", reason);
    }
  }, [recordLayoutDiagnostic]);

  const refreshMobileData = useCallback(async (nextSessionId?: string, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [workspaceData, sessionData] = await Promise.all([listWorkspaces(), listSessions()]);
      const currentWorkspace = workspaceData.active;

      if (isUnmountedRef.current) {
        return;
      }

      setWorkspaces(workspaceData.items);
      setActiveWorkspace(currentWorkspace);
      setSessions(sessionData.items);

      const targetSessionId = nextSessionId ?? sessionData.preferredSessionId ?? sessionData.items[0]?.id;
      if (!targetSessionId) {
        if (isUnmountedRef.current) {
          return;
        }
        setActiveSession(null);
        return;
      }

      const detail = await loadSessionDetail(targetSessionId, sessionCacheRef.current);
      if (isUnmountedRef.current) {
        return;
      }
      setActiveSession(detail);
    } catch (loadError) {
      if (isUnmountedRef.current) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : bridgeOfflineMessage);
      setWorkspaces([]);
      setSessions([]);
      setActiveWorkspace(null);
      setActiveSession(null);
    } finally {
      if (isUnmountedRef.current) {
        return;
      }
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
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(favoriteWorkspaceStorageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        setStarredWorkspaceIds(parsed.filter((item) => typeof item === "string"));
      }
    } catch {}
  }, []);

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

    try {
      window.localStorage.setItem(favoriteWorkspaceStorageKey, JSON.stringify(starredWorkspaceIds));
    } catch {}
  }, [starredWorkspaceIds]);

  useEffect(() => {
    if (!isDiagnosticsEnabled) {
      return;
    }

    const appRoot = appRef.current;
    if (!appRoot) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      recordLayoutDiagnostic("pointer.down", `pointerType=${event.pointerType}`, event.target);
    };

    const handleTouchStart = (event: TouchEvent) => {
      recordLayoutDiagnostic("touch.start", "touchstart", event.target);
    };

    appRoot.addEventListener("pointerdown", handlePointerDown, true);
    appRoot.addEventListener("touchstart", handleTouchStart, true);

    return () => {
      appRoot.removeEventListener("pointerdown", handlePointerDown, true);
      appRoot.removeEventListener("touchstart", handleTouchStart, true);
    };
  }, [isDiagnosticsEnabled, recordLayoutDiagnostic]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const appRoot = appRef.current;
    if (!appRoot) {
      return;
    }
    const viewport = window.visualViewport;
    const userAgent = window.navigator.userAgent;
    const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
    const isIosSafari = isAppleMobile && isSafari;
    const isWeChatWebView = /MicroMessenger/i.test(userAgent);
    const hasTextInputFocus = () => {
      const activeElement = document.activeElement;
      if (!activeElement) {
        return false;
      }

      if (activeElement instanceof HTMLTextAreaElement) {
        return true;
      }

      if (activeElement instanceof HTMLInputElement) {
        const nonTextTypes = new Set([
          "button",
          "checkbox",
          "color",
          "file",
          "hidden",
          "image",
          "radio",
          "range",
          "reset",
          "submit",
        ]);
        return !nonTextTypes.has(activeElement.type);
      }

      return activeElement instanceof HTMLElement && activeElement.isContentEditable;
    };
    const updateViewportOffset = (reason: string) => {
      const viewportHeight = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      const bottomOffset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      const textInputFocused = hasTextInputFocus();
      const viewportShrank = viewport ? window.innerHeight - viewport.height > 24 : false;
      const keyboardFallbackReserve =
        isAppleMobile && textInputFocused && !viewportShrank
          ? `${Math.round(
              clamp(
                window.innerHeight * (isWeChatWebView ? 0.22 : 0.16),
                isWeChatWebView ? 148 : 108,
                isWeChatWebView ? 196 : 156,
              ),
            )}px`
          : "0px";
      appRoot.style.setProperty("--mobile-app-height", `${viewportHeight}px`);

      if (!viewport) {
        appRoot.style.setProperty("--mobile-viewport-bottom-offset", "0px");
        appRoot.style.setProperty("--mobile-ios-bottom-boost", isIosSafari && textInputFocused ? "80px" : "0px");
        appRoot.style.setProperty("--mobile-keyboard-fallback-reserve", keyboardFallbackReserve);
        syncLayoutMetrics(`viewport:${reason}`);
        recordLayoutDiagnostic("viewport.update", reason);
        return;
      }

      const iosBottomBoost =
        isIosSafari
          ? textInputFocused
            ? bottomOffset < 8
              ? "80px"
              : "48px"
            : bottomOffset < 48
              ? "22px"
              : "0px"
          : "0px";

      appRoot.style.setProperty("--mobile-viewport-bottom-offset", `${bottomOffset}px`);
      appRoot.style.setProperty("--mobile-ios-bottom-boost", iosBottomBoost);
      appRoot.style.setProperty("--mobile-keyboard-fallback-reserve", keyboardFallbackReserve);
      syncLayoutMetrics(`viewport:${reason}`);
      recordLayoutDiagnostic("viewport.update", reason);
    };

    const handleWindowResize = () => updateViewportOffset("window.resize");
    const handleFocusIn = (event: FocusEvent) => {
      updateViewportOffset("focusin");
      recordLayoutDiagnostic("focus.in", "", event.target);
    };
    const handleFocusOut = (event: FocusEvent) => {
      updateViewportOffset("focusout");
      recordLayoutDiagnostic("focus.out", "", event.target);
    };
    const handleViewportResize = () => updateViewportOffset("visualViewport.resize");
    const handleViewportScroll = () => updateViewportOffset("visualViewport.scroll");
    const handleOrientationChange = () => updateViewportOffset("orientationchange");

    updateViewportOffset("effect.mount");

    if (!viewport) {
      window.addEventListener("resize", handleWindowResize);
      window.addEventListener("focusin", handleFocusIn);
      window.addEventListener("focusout", handleFocusOut);
      return () => {
        window.removeEventListener("resize", handleWindowResize);
        window.removeEventListener("focusin", handleFocusIn);
        window.removeEventListener("focusout", handleFocusOut);
        appRoot.style.removeProperty("--mobile-app-height");
        appRoot.style.removeProperty("--mobile-composer-top");
        appRoot.style.removeProperty("--mobile-viewport-bottom-offset");
        appRoot.style.removeProperty("--mobile-ios-bottom-boost");
        appRoot.style.removeProperty("--mobile-keyboard-fallback-reserve");
      };
    }

    viewport.addEventListener("resize", handleViewportResize);
    viewport.addEventListener("scroll", handleViewportScroll);
    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    return () => {
      viewport.removeEventListener("resize", handleViewportResize);
      viewport.removeEventListener("scroll", handleViewportScroll);
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
      appRoot.style.removeProperty("--mobile-app-height");
      appRoot.style.removeProperty("--mobile-composer-top");
      appRoot.style.removeProperty("--mobile-viewport-bottom-offset");
      appRoot.style.removeProperty("--mobile-ios-bottom-boost");
      appRoot.style.removeProperty("--mobile-keyboard-fallback-reserve");
    };
  }, [recordLayoutDiagnostic, syncLayoutMetrics]);

  useEffect(() => {
    syncLayoutMetrics("effect:initial-layout");
    if (typeof window === "undefined") {
      return;
    }

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          syncLayoutMetrics("resize-observer");
        });

    if (resizeObserver && topbarRef.current) {
      resizeObserver.observe(topbarRef.current);
    }
    if (resizeObserver && composerRef.current) {
      resizeObserver.observe(composerRef.current);
    }

    const handleWindowResize = () => syncLayoutMetrics("window.resize.layout");
    window.addEventListener("resize", handleWindowResize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleWindowResize);
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
      setActivePanel(null);
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
      setActivePanel(null);
      setActiveWorkspace(workspace);
      await openWorkspace(workspace.localPath);
      await refreshMobileData();
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : bridgeOfflineMessage);
    } finally {
      setPendingWorkspaceId(null);
    }
  }

  async function handleOpenWorkspaceByPath(localPath: string, pendingId: string) {
    try {
      setError(null);
      setPendingWorkspaceId(pendingId);
      await openWorkspace(localPath);
      setActivePanel(null);
      setManualWorkspacePath("");
      await refreshMobileData();
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : bridgeOfflineMessage);
    } finally {
      setPendingWorkspaceId(null);
    }
  }

  function handleToggleStarWorkspace(workspaceId: string) {
    setStarredWorkspaceIds((current) =>
      current.includes(workspaceId) ? current.filter((item) => item !== workspaceId) : [...current, workspaceId],
    );
  }

  async function handleCreateSession() {
    if (!activeWorkspace) {
      return;
    }

    try {
      setError(null);
      setPendingSessionId("__creating__");
      setActivePanel(null);
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

    recordLayoutDiagnostic("composer.focus", "textarea focus");
    const isIosBrowser = /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
    const timeline = timelineRef.current;
    const lockedScrollTop = timeline?.scrollTop ?? 0;
    let stabilizationFrames = 0;

    const stabilizeViewport = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      if (timeline) {
        timeline.scrollTop = lockedScrollTop;
      }

      stabilizationFrames += 1;
      if (stabilizationFrames < 4) {
        composerFocusRafRef.current = window.requestAnimationFrame(stabilizeViewport);
      } else {
        composerFocusRafRef.current = null;
      }
    };

    clearComposerFocusStabilization();

    window.setTimeout(() => {
      syncLayoutMetrics("composer.focus.timeout");
      scrollToLatest();
      composerInputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 140);

    if (isIosBrowser) {
      recordLayoutDiagnostic("composer.focus.stabilize", "ios scroll stabilization start");
      composerFocusRafRef.current = window.requestAnimationFrame(stabilizeViewport);
      composerFocusStabilizeTimerRef.current = window.setTimeout(() => {
        composerFocusRafRef.current = window.requestAnimationFrame(stabilizeViewport);
      }, 120);
    }
  }

  function handleComposerBlur() {
    recordLayoutDiagnostic("composer.blur", "textarea blur");
    clearComposerFocusStabilization();
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
      syncLayoutMetrics("composer.paste.attachments");
    } catch (pasteError) {
      setError(pasteError instanceof Error ? pasteError.message : bridgeOfflineMessage);
    }
  }

  function handleRemoveAttachment(attachmentPath: string) {
    setAttachments((current) => current.filter((attachment) => attachment.path !== attachmentPath));
    syncLayoutMetrics("composer.remove-attachment");
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
      : isRunActive || isRunning
        ? messages.workspace.loading
        : isLoading
          ? messages.mobile.syncing
          : pendingWorkspaceId
            ? messages.mobile.switchingWorkspace
            : pendingSessionId === "__creating__"
              ? messages.mobile.creatingSession
              : pendingSessionId
            ? messages.mobile.switchingSession
                : "";
  return (
    <main className="mobile-app" ref={appRef}>
      <div className="mobile-topbar" ref={topbarRef}>
        <MobileHeader
          actions={
            <MobileTopTabs
              activeKey={activePanel}
              items={[
                { key: "workspaces", label: messages.mobile.workspaces },
                { key: "sessions", label: messages.mobile.sessions },
                { key: "memories", label: messages.nav.memories },
              ]}
              onChange={(key) => {
                setActivePanel((current) => (current === key ? null : (key as MobilePanelKey)));
              }}
            />
          }
          brand="Relay"
          sessionName={activeSession?.title ?? messages.mobile.noSession}
          statusDetail={statusDetail}
          statusLabel={statusLabel}
          workspaceName={activeWorkspace?.name ?? messages.workspace.noWorkspace}
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
      {isDiagnosticsEnabled ? (
        <MobileLayoutDebugPanel
          entries={diagnosticEntries}
          onClear={() => {
            diagnosticsStoreRef.current?.clear();
          }}
        />
      ) : null}
      <MobileComposer
        attachments={attachments}
        composerValue={composerValue}
        disabled={!activeSession}
        isRunning={isRunning}
        onBlur={handleComposerBlur}
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
        isOpen={activePanel === "sessions"}
        onClose={() => setActivePanel(null)}
        onCreate={() => void handleCreateSession()}
        onSelect={(sessionId) => void handleSelectSession(sessionId)}
        pendingSessionId={pendingSessionId}
        sessions={sessions.filter((session) => session.workspaceId === activeWorkspace?.id)}
        title={messages.mobile.sessions}
      />

      <MobileWorkspaceDrawer
        activeWorkspaceId={activeWorkspace?.id ?? null}
        closeLabel={messages.settings.close}
        advancedLabel={messages.mobile.advancedWorkspace}
        currentLabel={messages.mobile.currentWorkspace}
        emptyLabel={messages.workspace.noWorkspace}
        favoriteLabel={messages.mobile.favoriteWorkspace}
        isOpen={activePanel === "workspaces"}
        manualPath={manualWorkspacePath}
        manualPathLabel={messages.mobile.workspacePathLabel}
        manualPathPlaceholder={messages.mobile.workspacePathPlaceholder}
        noFavoritesLabel={messages.mobile.noStarredWorkspaces}
        openManualLabel={messages.mobile.openWorkspacePath}
        onClose={() => setActivePanel(null)}
        onManualPathChange={setManualWorkspacePath}
        onOpenManualPath={() => void handleOpenWorkspaceByPath(manualWorkspacePath, "__manual__")}
        onSelect={(workspace) => void handleSelectWorkspace(workspace)}
        onToggleStar={handleToggleStarWorkspace}
        pendingWorkspaceId={pendingWorkspaceId}
        recentLabel={messages.mobile.recentWorkspaces}
        recentHintLabel={messages.mobile.recentWorkspacesHint}
        starredWorkspaceIds={starredWorkspaceIds}
        starredLabel={messages.mobile.starredWorkspaces}
        title={messages.mobile.workspaces}
        unfavoriteLabel={messages.mobile.unfavoriteWorkspace}
        workspaces={workspaces}
      />

      <MobileMemoriesDrawer
        closeLabel={messages.settings.close}
        detailTitleLabel={messages.mobile.memoryDetails}
        emptyLabel={messages.mobile.noMemories}
        isOpen={activePanel === "memories"}
        loadingLabel={messages.workspace.loading}
        memoriesLabel={messages.memories.memories}
        noDetailsLabel={messages.mobile.noMemoriesForDate}
        onClose={() => setActivePanel(null)}
        sourceSessionsLabel={messages.memories.sourceSessions}
        title={messages.nav.memories}
        weekdays={messages.mobile.memoryWeekdays}
        yearLabel={messages.mobile.year}
        locale={language === "zh" ? "zh-CN" : "en-US"}
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
  meta?: Message["meta"],
): Message {
  const now = new Date().toISOString();

  return {
    id,
    sessionId,
    role,
    content,
    status,
    meta,
    sequence,
    createdAt: now,
    updatedAt: now,
  };
}

function parseCssPixelValue(rawValue: string) {
  const normalized = rawValue.trim();

  if (!normalized.endsWith("px")) {
    return null;
  }

  const parsed = Number.parseFloat(normalized.replace("px", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function applyStreamingEvent(session: Session | null, event: RuntimeEvent, assistantMessageId: string) {
  if (!session) {
    return session;
  }

  if (event.type === "process.started") {
    return upsertProcessMessage(session, assistantMessageId, event);
  }

  if (event.type === "process.delta") {
    return upsertProcessMessage(session, assistantMessageId, event);
  }

  if (event.type === "process.completed") {
    return completeProcessMessage(session, assistantMessageId, event);
  }

  if (event.type === "message.delta") {
    const messages: Message[] = session.messages.map((message) =>
      message.id === assistantMessageId
        ? updateMessageStatus({
            ...message,
            content: `${message.content}${event.delta}`,
            updatedAt: event.createdAt,
          }, "streaming")
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
        ? updateMessageStatus(message, "completed", event.createdAt)
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
        ? updateMessageStatus(message, "error", event.createdAt)
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
      ? updateMessageStatus(message, "error")
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
  event: Extract<RuntimeEvent, { type: "process.delta" | "process.started" }>,
) {
  const processMessageId = `${assistantMessageId}:process:${event.phase}:${event.itemId}`;
  const existingMessage = session.messages.find((message) => message.id === processMessageId);
  const nextContent = event.type === "process.started"
    ? createInitialProcessContent(event)
    : appendProcessContent(existingMessage?.content ?? "", event.phase, event.delta);

  if (existingMessage) {
    const messages = session.messages.map((message) =>
      message.id === processMessageId
        ? updateMessageStatus(
            {
              ...message,
              content: nextContent,
              meta: {
                kind: "process",
                process: {
                  itemId: event.itemId,
                  phase: event.phase,
                  label: event.type === "process.started" ? event.label : message.meta?.process?.label,
                },
              },
            },
            "streaming",
            event.createdAt,
          )
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
    {
      kind: "process",
      process: {
        itemId: event.itemId,
        phase: event.phase,
        label: event.type === "process.started" ? event.label : PROCESS_TITLES[event.phase],
      },
    },
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

function completeProcessMessage(
  session: Session,
  assistantMessageId: string,
  event: Extract<RuntimeEvent, { type: "process.completed" }>,
) {
  const processMessageId = `${assistantMessageId}:process:${event.phase}:${event.itemId}`;

  return {
    ...session,
    updatedAt: event.createdAt,
    messages: session.messages.map((message) =>
      message.id === processMessageId
        ? updateMessageStatus(message, "completed", event.createdAt)
        : message,
    ),
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

  return `${current}${normalizedDelta}`;
}

function createInitialProcessContent(event: Extract<RuntimeEvent, { type: "process.started" }>) {
  if (event.phase === "command" && event.label) {
    return `$ ${event.label}\n`;
  }

  return "";
}

function updateMessageStatus(message: Message, status: MessageStatus, updatedAt = message.updatedAt): Message {
  return {
    ...message,
    status,
    updatedAt,
  };
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
