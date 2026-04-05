"use client";

import {
  type CSSProperties,
  forwardRef,
  memo,
  type Dispatch,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import type {
  AutomationRule,
  FileTreeNode,
  Message,
  MessageStatus,
  RelayDevice,
  RelayDeviceDirectory,
  RuntimeEvent,
  Session,
  TimelineMemory,
  Workspace,
} from "@relay/shared-types";
import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";
import {
  archiveSession,
  createSession,
  getLocalDevice,
  getFilePreview,
  getFileTree,
  listMemories,
  listAutomations,
  getSession,
  getSessionMemories,
  listSessions,
  openInFinder,
  openWorkspace,
  listWorkspaces,
  openWorkspacePicker,
  renameSession,
  removeWorkspace,
  runSessionStream,
  selectSession,
  subscribeRuntimeEvents,
  uploadSessionImage,
} from "@/lib/api/bridge";
import type { BridgeRuntimeEvent, FilePreview, SessionAttachment } from "@/lib/api/bridge";
import { loadDeviceDirectory } from "@/lib/api/cloud-devices";
import { ensureCurrentGitHubDeviceReady } from "@/lib/auth/device-bootstrap";
import type { RelayAuthSessionResponse } from "@/lib/auth/types";
import { getClipboardImageFiles, readClipboardImageFiles } from "@/lib/clipboard";
import { renderMarkdown } from "@/lib/markdown";

type WorkspaceClientProps = {
  language: AppLanguage;
  layout?: {
    workspaceLeftWidth: string;
    workspaceCenterMinWidth: string;
    workspaceRightWidth: string;
    workspaceSidepanelPrimaryWidth: string;
  };
};

const DEFAULT_WORKSPACE_LAYOUT = {
  workspaceLeftWidth: "240px",
  workspaceCenterMinWidth: "360px",
  workspaceRightWidth: "min(50vw, 720px)",
  workspaceSidepanelPrimaryWidth: "420px",
} as const;

type VisibleFileTreeNode = {
  id: string;
  name: string;
  kind: FileTreeNode["kind"];
  depth: number;
  path: string;
  isExpanded: boolean;
  hasChildren: boolean;
  isLoaded: boolean;
};

type SessionContextMenuState = {
  left: number;
  session: Session;
  top: number;
};

type LoadedSessionDetail = Awaited<ReturnType<typeof getSession>>;

type WorkspaceSidePanelMode = "files" | "summary" | "actions" | "automation";

type WorkspaceResizeHandle = "left" | "right" | "sidepanel";

type WorkspaceLayoutWidths = {
  left: number | null;
  right: number | null;
  sidepanelPrimary: number | null;
};

type MentionCandidate = {
  id: string;
  kind: "session" | "memory";
  label: string;
  detail: string;
  sessionId: string;
  searchText: string;
  content?: string;
};

type MentionQueryState = {
  query: string;
  start: number;
  end: number;
};

type SessionGoalAutomationRule = Extract<AutomationRule, { kind: "goal-loop" }>;

type CssVariableStyle = CSSProperties & Record<string, string>;
type WorkspaceDeviceRouteState = "idle" | "loading" | "error";

const WORKSPACE_LAYOUT_STORAGE_KEY = "relay.workspace.layout.v1";
const WORKSPACE_LEFT_MIN_WIDTH = 200;
const WORKSPACE_CENTER_MIN_WIDTH = 320;
const WORKSPACE_RIGHT_MIN_WIDTH = 360;
const WORKSPACE_SIDEPANEL_PRIMARY_MIN_WIDTH = 240;
const WORKSPACE_SIDEPANEL_SECONDARY_MIN_WIDTH = 240;
const WORKSPACE_RESIZER_WIDTH = 8;

export function WorkspaceClient({ language, layout }: WorkspaceClientProps) {
  const workspaceLayout = layout ?? DEFAULT_WORKSPACE_LAYOUT;
  const messages = getMessages(language);
  const bridgeOfflineMessage = messages.workspace.bridgeOffline;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [composerValue, setComposerValue] = useState("");
  const [attachments, setAttachments] = useState<SessionAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authSession, setAuthSession] = useState<RelayAuthSessionResponse["session"] | null>(null);
  const [deviceDirectory, setDeviceDirectory] = useState<RelayDeviceDirectory | null>(null);
  const [deviceRouteError, setDeviceRouteError] = useState<string | null>(null);
  const [deviceRouteState, setDeviceRouteState] = useState<WorkspaceDeviceRouteState>("idle");
  const [localRelayDevice, setLocalRelayDevice] = useState<RelayDevice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [isActiveSessionLoading, setIsActiveSessionLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isMemoriesLoading, setIsMemoriesLoading] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [sessionMemories, setSessionMemories] = useState<TimelineMemory[]>([]);
  const [allMemories, setAllMemories] = useState<TimelineMemory[]>([]);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [isAutomationRulesLoading, setIsAutomationRulesLoading] = useState(false);
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(true);
  const [sidePanelMode, setSidePanelMode] = useState<WorkspaceSidePanelMode>("summary");
  const [archiveCandidate, setArchiveCandidate] = useState<Session | null>(null);
  const [renameCandidate, setRenameCandidate] = useState<Session | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [sessionContextMenu, setSessionContextMenu] = useState<SessionContextMenuState | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRunning, startRunTransition] = useTransition();
  const [isSwitchingSession, startSessionSwitchTransition] = useTransition();
  const [selectedMentions, setSelectedMentions] = useState<MentionCandidate[]>([]);
  const [mentionQuery, setMentionQuery] = useState<MentionQueryState | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isTimelinePinned, setIsTimelinePinned] = useState(true);
  const [hasUnreadLatestReply, setHasUnreadLatestReply] = useState(false);
  const [layoutWidths, setLayoutWidths] = useState<WorkspaceLayoutWidths>({
    left: null,
    right: null,
    sidepanelPrimary: null,
  });
  const firstMessageRef = useRef<HTMLElement | null>(null);
  const currentMessageRef = useRef<HTMLElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const leftPanelRef = useRef<HTMLElement | null>(null);
  const rightPanelRef = useRef<HTMLElement | null>(null);
  const sidepanelFilesBodyRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowCurrentRunRef = useRef(false);
  const sessionCacheRef = useRef(new Map<string, Session>());
  const pendingSessionRequestsRef = useRef(new Map<string, Promise<LoadedSessionDetail>>());
  const activeSessionIdRef = useRef<string | null>(null);
  const highlightResetTimeoutRef = useRef<number | null>(null);
  const isTimelinePinnedRef = useRef(true);
  const previousActiveSessionIdRef = useRef<string | null>(null);
  const sessionSelectionRequestIdRef = useRef(0);
  const dragStateRef = useRef<{
    handle: WorkspaceResizeHandle;
    shellWidth: number;
    sidepanelBodyWidth: number;
    startLeft: number;
    startRight: number;
    startSidepanelPrimary: number;
    startX: number;
  } | null>(null);
  const layoutInitRef = useRef(false);
  const sessionsByWorkspace = useMemo(() => {
    const grouped = new Map<string, Session[]>();

    for (const session of sessions) {
      const current = grouped.get(session.workspaceId);
      if (current) {
        current.push(session);
      } else {
        grouped.set(session.workspaceId, [session]);
      }
    }

    return grouped;
  }, [sessions]);
  const visibleFileTree = useMemo(() => buildVisibleFileTree(fileTree, collapsedFolders), [fileTree, collapsedFolders]);
  const previewHtml = useMemo(() => {
    if (!preview || preview.extension !== ".md") {
      return null;
    }

    return renderMarkdown(preview.content);
  }, [preview]);
  const linkedFiles = useMemo(
    () => collectSessionLinkedFiles(activeSession?.messages ?? []),
    [activeSession],
  );
  const actionPrompts = useMemo(
    () => createWorkspaceActionPrompts(activeSession, linkedFiles, language),
    [activeSession, language, linkedFiles],
  );
  const automationPrompt = useMemo(
    () => createWorkspaceAutomationPrompt(activeSession, linkedFiles, language),
    [activeSession, language, linkedFiles],
  );
  const currentSessionGoalAutomations = useMemo(() => {
    if (!activeSession) {
      return [];
    }

    return automationRules.filter(
      (item): item is SessionGoalAutomationRule =>
        item.kind === "goal-loop" &&
        item.actionType === "continue-session" &&
        item.sessionId === activeSession.id,
    );
  }, [activeSession, automationRules]);
  const automationActionCount = useMemo(() => {
    const baseCount = activeSession ? 2 : 1;
    return baseCount + currentSessionGoalAutomations.length;
  }, [activeSession, currentSessionGoalAutomations.length]);
  const groupedSessionMemories = useMemo(() => groupMemoriesByDate(sessionMemories), [sessionMemories]);
  const mentionCandidates = useMemo(
    () => buildMentionCandidates(sessions, allMemories, activeSessionId),
    [sessions, allMemories, activeSessionId],
  );
  const filteredMentionCandidates = useMemo(() => {
    if (!mentionQuery) {
      return [];
    }

    return filterMentionCandidates(mentionCandidates, mentionQuery.query, selectedMentions).slice(0, 8);
  }, [mentionCandidates, mentionQuery, selectedMentions]);
  const workspaceShellStyle = useMemo(() => {
    const style: CssVariableStyle = {};

    style["--workspace-left-width"] = workspaceLayout.workspaceLeftWidth;
    style["--workspace-center-min-width"] = workspaceLayout.workspaceCenterMinWidth;
    style["--workspace-right-width"] = workspaceLayout.workspaceRightWidth;

    if (layoutWidths.left) {
      style["--workspace-left-width-runtime"] = `${layoutWidths.left}px`;
    }

    if (layoutWidths.right) {
      style["--workspace-right-width-runtime"] = `${layoutWidths.right}px`;
    }

    return style;
  }, [
    layoutWidths.left,
    layoutWidths.right,
    workspaceLayout.workspaceCenterMinWidth,
    workspaceLayout.workspaceLeftWidth,
    workspaceLayout.workspaceRightWidth,
  ]);
  const sidepanelFilesBodyStyle = useMemo(() => {
    const style: CssVariableStyle = {};

    style["--workspace-sidepanel-primary-width"] = workspaceLayout.workspaceSidepanelPrimaryWidth;

    if (layoutWidths.sidepanelPrimary) {
      style["--workspace-sidepanel-primary-width-runtime"] =
        `${layoutWidths.sidepanelPrimary}px`;
    }

    return style;
  }, [layoutWidths.sidepanelPrimary, workspaceLayout.workspaceSidepanelPrimaryWidth]);
  const defaultRelayDevice =
    deviceDirectory?.items.find((item) => item.id === deviceDirectory.defaultDeviceId) ?? null;
  const isUsingDefaultRelayDevice =
    !!defaultRelayDevice && !!localRelayDevice && defaultRelayDevice.localDeviceId === localRelayDevice.id;
  const workspaceDeviceStatusText =
    deviceRouteState === "loading" && authSession?.method === "github"
      ? messages.workspace.deviceRouteLoading
      : authSession?.method === "github" && defaultRelayDevice
        ? isUsingDefaultRelayDevice
          ? messages.workspace.deviceRouteReady
          : messages.workspace.deviceRouteMismatch
        : messages.workspace.deviceRouteUnknown;

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    const cachedSession = sessionCacheRef.current.get(sessionId);
    if (cachedSession) {
      return {
        item: cachedSession,
        source: "snapshot" as const,
      };
    }

    const pendingRequest = pendingSessionRequestsRef.current.get(sessionId);
    if (pendingRequest) {
      return pendingRequest;
    }

    const request = getSession(sessionId)
      .then((sessionDetail) => {
        cacheSessionDetail(sessionCacheRef.current, sessionDetail.item);
        return sessionDetail;
      })
      .finally(() => {
        pendingSessionRequestsRef.current.delete(sessionId);
      });

    pendingSessionRequestsRef.current.set(sessionId, request);
    return request;
  }, []);

  const loadSessionMemories = useCallback(async (sessionId: string) => {
    setIsMemoriesLoading(true);

    try {
      const memoryResponse = await getSessionMemories(sessionId);
      setSessionMemories(memoryResponse.items);
    } catch (memoryError) {
      setError(memoryError instanceof Error ? memoryError.message : bridgeOfflineMessage);
      setSessionMemories([]);
    } finally {
      setIsMemoriesLoading(false);
    }
  }, [bridgeOfflineMessage]);

  const loadAutomationRules = useCallback(async () => {
    setIsAutomationRulesLoading(true);

    try {
      const automationResponse = await listAutomations();
      setAutomationRules(automationResponse.items);
    } catch (automationError) {
      setError(automationError instanceof Error ? automationError.message : bridgeOfflineMessage);
      setAutomationRules([]);
    } finally {
      setIsAutomationRulesLoading(false);
    }
  }, [bridgeOfflineMessage]);

  const refreshAutomationRulesInBackground = useCallback(async () => {
    try {
      const automationResponse = await listAutomations();
      setAutomationRules(automationResponse.items);
    } catch {}
  }, []);

  const refreshSessionDetailInBackground = useCallback(async (sessionId: string) => {
    try {
      const sessionDetail = await getSession(sessionId, { fresh: true });
      cacheSessionDetail(sessionCacheRef.current, sessionDetail.item);

      if (activeSessionIdRef.current === sessionId) {
        setActiveSession(sessionDetail.item);
      }
    } catch {}
  }, []);

  const refreshSessionListInBackground = useCallback(async (nextSessionId?: string) => {
    try {
      const freshSessionData = await listSessions({ fresh: true });
      setSessions(freshSessionData.items);

      const targetSessionId =
        nextSessionId ?? activeSessionIdRef.current ?? freshSessionData.preferredSessionId ?? freshSessionData.items[0]?.id ?? null;

      if (targetSessionId) {
        const freshDetail = await getSession(targetSessionId, { fresh: true });
        cacheSessionDetail(sessionCacheRef.current, freshDetail.item);

        if (activeSessionIdRef.current === targetSessionId) {
          setActiveSession(freshDetail.item);
        }
      }
    } catch {}
  }, []);

  const handleRealtimeEvent = useCallback(
    (event: BridgeRuntimeEvent) => {
      const currentSessionId = activeSessionIdRef.current;
      if (!currentSessionId) {
        return;
      }

      if (event.type === "thread.list.changed") {
        void refreshSessionListInBackground(currentSessionId);
        void refreshAutomationRulesInBackground();
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
        void refreshSessionDetailInBackground(currentSessionId);
        void refreshAutomationRulesInBackground();
      }
    },
    [refreshAutomationRulesInBackground, refreshSessionDetailInBackground, refreshSessionListInBackground],
  );

  const refreshWorkspaceData = useCallback(async (nextSessionId?: string) => {
    setIsLoading(true);
    setIsSessionsLoading(true);
    setIsAutomationRulesLoading(true);
    setError(null);

    const workspacePromise = listWorkspaces();
    const sessionsPromise = listSessions();
    const automationsPromise = listAutomations().catch(() => ({ items: [] as AutomationRule[] }));

    try {
      const workspaceData = await workspacePromise;
      const currentWorkspace = workspaceData.active;

      setWorkspaces(workspaceData.items);

      if (currentWorkspace) {
        const treeData = await getFileTree();
        setFileTree(treeData.item);
        setCollapsedFolders(createInitialCollapsedFolders(treeData.item));
      } else {
        setFileTree(null);
        setPreview(null);
      }

      setIsLoading(false);

      const sessionData = await sessionsPromise;
      setSessions(sessionData.items);
      setIsSessionsLoading(false);

      const automationData = await automationsPromise;
      setAutomationRules(automationData.items);
      setIsAutomationRulesLoading(false);

      const targetSessionId = nextSessionId ?? sessionData.preferredSessionId ?? sessionData.items[0]?.id;
      setActiveSessionId(targetSessionId ?? null);
      activeSessionIdRef.current = targetSessionId ?? null;

      if (targetSessionId) {
        setIsActiveSessionLoading(true);
        const sessionDetail = await loadSessionDetail(targetSessionId);
        setActiveSession(sessionDetail.item);
        await loadSessionMemories(targetSessionId);
        setIsActiveSessionLoading(false);

        if (sessionDetail.source === "snapshot") {
          void refreshSessionDetailInBackground(targetSessionId);
        }

        const preloadSessionIds = sessionData.items
          .map((session) => session.id)
          .filter((sessionId) => sessionId !== targetSessionId);

        void Promise.allSettled(preloadSessionIds.map((sessionId) => loadSessionDetail(sessionId)));
      } else {
        setActiveSession(null);
        setSessionMemories([]);
        setIsActiveSessionLoading(false);
      }

      if (sessionData.source === "snapshot") {
        void refreshSessionListInBackground(targetSessionId);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : bridgeOfflineMessage);
      setWorkspaces([]);
      setSessions([]);
      setActiveSessionId(null);
      setActiveSession(null);
      setSessionMemories([]);
      setAutomationRules([]);
      setFileTree(null);
      setIsSessionsLoading(false);
      setIsAutomationRulesLoading(false);
      setIsActiveSessionLoading(false);
    } finally {
      setIsLoading(false);
      setIsAutomationRulesLoading(false);
    }
  }, [bridgeOfflineMessage, loadSessionDetail, refreshSessionDetailInBackground, refreshSessionListInBackground]);

  useEffect(() => {
    void refreshWorkspaceData();
  }, [refreshWorkspaceData, language]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceDeviceRoute() {
      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });

        if (!sessionResponse.ok) {
          throw new Error("Failed to load the current Relay session.");
        }

        const authData = (await sessionResponse.json()) as RelayAuthSessionResponse;

        if (cancelled) {
          return;
        }

        setAuthSession(authData.session);

        if (authData.session?.method === "github" && authData.session.userId) {
          setDeviceRouteState("loading");

          try {
            const result = await ensureCurrentGitHubDeviceReady();

            if (cancelled) {
              return;
            }

            setLocalRelayDevice(result.localDevice);
            setDeviceDirectory(result.directory);
            setDeviceRouteError(null);
            setDeviceRouteState("idle");
          } catch (routeError) {
            if (cancelled) {
              return;
            }

            setDeviceRouteError(routeError instanceof Error ? routeError.message : "Failed to resolve Relay device route.");
            setDeviceRouteState("error");

            const [localDeviceResponse, directory] = await Promise.allSettled([getLocalDevice(), loadDeviceDirectory()]);

            if (cancelled) {
              return;
            }

            if (localDeviceResponse.status === "fulfilled") {
              setLocalRelayDevice(localDeviceResponse.value.item);
            }

            if (directory.status === "fulfilled") {
              setDeviceDirectory(directory.value);
            }
          }

          return;
        }

        setDeviceRouteState("idle");
        setDeviceDirectory(null);
        setDeviceRouteError(null);

        try {
          const localDeviceResponse = await getLocalDevice();

          if (!cancelled) {
            setLocalRelayDevice(localDeviceResponse.item);
          }
        } catch {
          if (!cancelled) {
            setLocalRelayDevice(null);
          }
        }
      } catch {
        if (!cancelled) {
          setDeviceRouteState("error");
        }
      }
    }

    void loadWorkspaceDeviceRoute();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    return subscribeRuntimeEvents({ sessionId: activeSessionId }, handleRealtimeEvent, () => {});
  }, [activeSessionId, handleRealtimeEvent]);

  useEffect(() => {
    if (sidePanelMode !== "automation") {
      return;
    }

    void refreshAutomationRulesInBackground();
  }, [refreshAutomationRulesInBackground, sidePanelMode]);

  useEffect(() => {
    if (!sessionContextMenu) {
      return;
    }

    function handleClose() {
      setSessionContextMenu(null);
    }

    window.addEventListener("resize", handleClose);
    window.addEventListener("scroll", handleClose, true);

    return () => {
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [sessionContextMenu]);

  useEffect(() => {
    if (layoutInitRef.current) {
      return;
    }

    const shell = shellRef.current;
    const leftPanel = leftPanelRef.current;
    const rightPanel = rightPanelRef.current;

    if (!shell || !leftPanel || !rightPanel) {
      return;
    }

    const storedLayout = readWorkspaceLayout();
    const measuredLeft = Math.round(leftPanel.getBoundingClientRect().width);
    const measuredRight = Math.round(rightPanel.getBoundingClientRect().width);
    const defaultSidepanelPrimary =
      parseCssPixelValue(getComputedStyle(document.documentElement).getPropertyValue("--workspace-sidepanel-primary-width")) ??
      Math.round(measuredRight / 2);

    layoutInitRef.current = true;
    setLayoutWidths({
      left: storedLayout?.left ?? measuredLeft,
      right: storedLayout?.right ?? measuredRight,
      sidepanelPrimary: storedLayout?.sidepanelPrimary ?? defaultSidepanelPrimary,
    });
  }, []);

  useEffect(() => {
    if (!layoutInitRef.current) {
      return;
    }

    writeWorkspaceLayout(layoutWidths);
  }, [layoutWidths]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setLayoutWidths((current) => clampWorkspaceLayout(current, shell.clientWidth, sidepanelFilesBodyRef.current?.clientWidth ?? 0));
    });

    observer.observe(shell);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const delta = event.clientX - dragState.startX;

      setLayoutWidths((current) => {
        const next = { ...current };

        if (dragState.handle === "left") {
          next.left = clampNumber(
            dragState.startLeft + delta,
            WORKSPACE_LEFT_MIN_WIDTH,
            dragState.shellWidth - dragState.startRight - WORKSPACE_CENTER_MIN_WIDTH,
          );
        }

        if (dragState.handle === "right") {
          next.right = clampNumber(
            dragState.startRight - delta,
            WORKSPACE_RIGHT_MIN_WIDTH,
            dragState.shellWidth - dragState.startLeft - WORKSPACE_CENTER_MIN_WIDTH,
          );
        }

        if (dragState.handle === "sidepanel") {
          next.sidepanelPrimary = clampNumber(
            dragState.startSidepanelPrimary + delta,
            WORKSPACE_SIDEPANEL_PRIMARY_MIN_WIDTH,
            dragState.sidepanelBodyWidth - WORKSPACE_RESIZER_WIDTH - WORKSPACE_SIDEPANEL_SECONDARY_MIN_WIDTH,
          );
        }

        return next;
      });
    }

    function handlePointerUp() {
      dragStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    if (isActiveSessionLoading || isSwitchingSession || !activeSession) {
      return;
    }

    const shouldForceLatest = previousActiveSessionIdRef.current !== activeSession.id;
    previousActiveSessionIdRef.current = activeSession.id;

    const frameId = window.requestAnimationFrame(() => {
      if (shouldForceLatest || isTimelinePinnedRef.current) {
        scrollTimelineToLatest(shouldForceLatest ? "auto" : "auto");
        setHasUnreadLatestReply(false);
        return;
      }

      setHasUnreadLatestReply(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeSession?.id, activeSession?.messages.length, isActiveSessionLoading, isSwitchingSession]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) {
      return;
    }

    const handleScroll = () => {
      const pinned = isTimelineNearBottom(timeline);
      isTimelinePinnedRef.current = pinned;
      setIsTimelinePinned(pinned);

      if (pinned) {
        setHasUnreadLatestReply(false);
      }
    };

    handleScroll();
    timeline.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      timeline.removeEventListener("scroll", handleScroll);
    };
  }, [activeSession?.id, activeSession?.messages.length]);

  useEffect(() => {
    const input = composerInputRef.current;
    if (!input) {
      return;
    }

    resetComposerInputHeight(input);
  }, [composerValue]);

  useEffect(() => {
    if (!mentionQuery) {
      setActiveMentionIndex(0);
      return;
    }

    setActiveMentionIndex((current) => {
      if (filteredMentionCandidates.length === 0) {
        return 0;
      }

      return Math.min(current, filteredMentionCandidates.length - 1);
    });
  }, [filteredMentionCandidates.length, mentionQuery]);

  async function handleOpenWorkspace() {
    try {
      setError(null);
      const opened = await openWorkspacePicker();
      if (opened.canceled) {
        return;
      }

      await refreshWorkspaceData();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : bridgeOfflineMessage);
    }
  }

  async function handleCreateSession(workspace: Workspace) {
    try {
      setError(null);
      setPreview(null);
      if (!workspace.isActive) {
        await openWorkspace(workspace.localPath);
      }
      const created = await createSession(`Session ${new Date().toLocaleTimeString()}`);
      await refreshWorkspaceData(created.item.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : bridgeOfflineMessage);
    }
  }

  const handleSelectSession = useCallback(async (sessionId: string) => {
    if (activeSessionIdRef.current === sessionId) {
      return;
    }

    const requestId = ++sessionSelectionRequestIdRef.current;

    try {
      setError(null);
      setActiveSessionId(sessionId);
      activeSessionIdRef.current = sessionId;
      setIsActiveSessionLoading(true);
      void selectSession(sessionId).catch(() => {});
      const cachedSession = sessionCacheRef.current.get(sessionId);

      if (cachedSession) {
        if (sessionSelectionRequestIdRef.current !== requestId) {
          return;
        }

        startSessionSwitchTransition(() => {
          setActiveSession(cachedSession);
        });
        await loadSessionMemories(sessionId);
        setIsActiveSessionLoading(false);
        jumpTimelineToLatest();
        return;
      }

      const sessionDetail = await loadSessionDetail(sessionId);
      if (sessionSelectionRequestIdRef.current === requestId && activeSessionIdRef.current === sessionId) {
        startSessionSwitchTransition(() => {
          setActiveSession(sessionDetail.item);
        });
        await loadSessionMemories(sessionId);
        setIsActiveSessionLoading(false);
        jumpTimelineToLatest();
      }

      if (sessionDetail.source === "snapshot") {
        void refreshSessionDetailInBackground(sessionId);
      }
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : bridgeOfflineMessage);
      setIsActiveSessionLoading(false);
    }
  }, [bridgeOfflineMessage, loadSessionDetail, loadSessionMemories, refreshSessionDetailInBackground, startSessionSwitchTransition]);

  const handlePrefetchSession = useCallback((sessionId: string) => {
    if (sessionCacheRef.current.has(sessionId) || pendingSessionRequestsRef.current.has(sessionId)) {
      return;
    }

    void loadSessionDetail(sessionId);
  }, [loadSessionDetail]);

  async function handleSelectFileTreeNode(node: VisibleFileTreeNode) {
    setIsSidePanelCollapsed(false);
    setSidePanelMode("files");

    if (node.kind === "folder") {
      const shouldExpand = collapsedFolders.has(node.path);

      if (shouldExpand && node.hasChildren && !node.isLoaded) {
        try {
          setError(null);
          const subtree = await getFileTree({ path: node.path, depth: 2 });
          setFileTree((current) => mergeFileTreeNode(current, subtree.item));
        } catch (treeError) {
          setError(treeError instanceof Error ? treeError.message : bridgeOfflineMessage);
          return;
        }
      }

      setCollapsedFolders((current) => {
        const next = new Set(current);

        if (next.has(node.path)) {
          next.delete(node.path);
        } else {
          next.add(node.path);
        }

        return next;
      });
      return;
    }

    if (node.kind !== "file") {
      return;
    }

    try {
      setIsPreviewLoading(true);
      const response = await getFilePreview(node.path);
      setPreview(response.item);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : bridgeOfflineMessage);
    } finally {
      setIsPreviewLoading(false);
    }
  }

  const handleOpenLinkedFile = useCallback(async (filePath: string) => {
    try {
      setError(null);
      setIsSidePanelCollapsed(false);
      setSidePanelMode("files");
      expandFileAncestors(filePath, setCollapsedFolders);
      setIsPreviewLoading(true);
      const response = await getFilePreview(filePath);
      setPreview(response.item);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : bridgeOfflineMessage);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [bridgeOfflineMessage]);

  const handleMarkdownLinkClick = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    const element =
      target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    const link = element?.closest("[data-file-link='true']");
    if (!link) {
      return;
    }

    event.preventDefault();
    const filePath = link.getAttribute("data-file-path");
    if (!filePath) {
      return;
    }

    void handleOpenLinkedFile(filePath);
  }, [handleOpenLinkedFile]);

  async function handleOpenNodeInFinder(node: VisibleFileTreeNode) {
    try {
      setError(null);
      await openInFinder(node.path);
    } catch (finderError) {
      setError(finderError instanceof Error ? finderError.message : bridgeOfflineMessage);
    }
  }

  async function handleArchiveSession() {
    if (!archiveCandidate) {
      return;
    }

    try {
      setIsArchiving(true);
      setError(null);
      await archiveSession(archiveCandidate.id);

      const remainingSessions = sessions.filter((session) => session.id !== archiveCandidate.id);
      const nextActiveSessionId =
        activeSessionId === archiveCandidate.id ? remainingSessions[0]?.id ?? null : activeSessionId ?? null;

      setSessions(remainingSessions);
      sessionCacheRef.current.delete(archiveCandidate.id);
      setArchiveCandidate(null);
      setActiveSessionId(nextActiveSessionId);
      activeSessionIdRef.current = nextActiveSessionId;

      if (!nextActiveSessionId) {
        setActiveSession(null);
        setSessionMemories([]);
        return;
      }

      const cachedSession = sessionCacheRef.current.get(nextActiveSessionId);
      if (cachedSession) {
        setActiveSession(cachedSession);
        await loadSessionMemories(nextActiveSessionId);
        return;
      }

      const sessionDetail = await getSession(nextActiveSessionId);
      cacheSessionDetail(sessionCacheRef.current, sessionDetail.item);
      setActiveSession(sessionDetail.item);
      await loadSessionMemories(nextActiveSessionId);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : bridgeOfflineMessage);
    } finally {
      setIsArchiving(false);
    }
  }

  function handleSessionContextMenu(event: MouseEvent<HTMLElement>, session: Session) {
    event.preventDefault();
    const panelRect = leftPanelRef.current?.getBoundingClientRect();
    const menuHeight = 68;
    const panelPadding = 8;
    const rowRect = event.currentTarget.getBoundingClientRect();
    const left = panelRect ? panelRect.right + 1 : rowRect.right + 1;
    const top = panelRect
      ? Math.min(
          panelRect.bottom - menuHeight - panelPadding,
          Math.max(panelRect.top + panelPadding, rowRect.top - 2),
        )
      : rowRect.top;

    setSessionContextMenu({
      left,
      session,
      top,
    });
  }

  function handleOpenRenameDialog(session: Session) {
    setSessionContextMenu(null);
    setRenameCandidate(session);
    setRenameValue(session.title);
  }

  function handleOpenArchiveDialog(session: Session) {
    setSessionContextMenu(null);
    setArchiveCandidate(session);
  }

  async function handleRenameSession() {
    if (!renameCandidate) {
      return;
    }

    const title = renameValue.trim();

    if (!title) {
      return;
    }

    try {
      setIsRenaming(true);
      setError(null);
      const renamed = await renameSession(renameCandidate.id, title);

      setSessions((current) =>
        current.map((session) => (session.id === renamed.item.id ? { ...session, title: renamed.item.title } : session)),
      );
      cacheSessionDetail(sessionCacheRef.current, renamed.item);

      setActiveSession((current) =>
        current && current.id === renamed.item.id ? { ...current, title: renamed.item.title } : current,
      );

      setRenameCandidate(null);
      setRenameValue("");
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : bridgeOfflineMessage);
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleRemoveWorkspace(workspaceId: string) {
    try {
      setError(null);
      setPreview(null);
      await removeWorkspace(workspaceId);
      await refreshWorkspaceData();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : bridgeOfflineMessage);
    }
  }

  async function handleRun() {
    if (!activeSession || (!composerValue.trim() && attachments.length === 0)) {
      return;
    }

    const prompt = composerValue.trim();
    const displayPrompt = createDisplayPrompt(prompt, selectedMentions, language);
    const materializedPrompt = await buildPromptWithMentions(
      prompt,
      selectedMentions,
      language,
      activeSession,
      loadSessionDetail,
    );
    const originalSessionId = activeSession.id;
    let materializedSessionId = originalSessionId;
    const pendingAttachments = attachments;
    setComposerValue("");
    resetComposerInputHeight(composerInputRef.current);
    setAttachments([]);
    setSelectedMentions([]);
    setMentionQuery(null);
    shouldFollowCurrentRunRef.current = true;

    startRunTransition(() => {
      void (async () => {
        try {
          setError(null);
          const userMessage = createOptimisticMessage(
            activeSession.id,
            "user",
            formatUserMessagePreview(displayPrompt, pendingAttachments),
            activeSession.messages.length + 1,
          );
          const assistantMessage = createOptimisticMessage(
            activeSession.id,
            "assistant",
            "",
            activeSession.messages.length + 2,
            "streaming",
          );

          setActiveSession((current) => {
            if (!current || current.id !== activeSession.id) {
              return current;
            }

            return {
              ...current,
              turnCount: current.turnCount + 1,
              updatedAt: userMessage.updatedAt,
              messages: [...current.messages, userMessage, assistantMessage],
            };
          });
          queueMicrotask(() => {
            scrollToCurrentMessage("smooth");
          });

          await runSessionStream(originalSessionId, materializedPrompt, pendingAttachments, (event) => {
            if (event.type === "run.started" && event.sessionId !== materializedSessionId) {
              materializedSessionId = event.sessionId;
              setActiveSessionId(event.sessionId);
              activeSessionIdRef.current = event.sessionId;
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
                cacheSessionDetail(sessionCacheRef.current, nextSession);
              }
              return nextSession;
            });
            queueMicrotask(() => {
              if (shouldFollowCurrentRunRef.current) {
                scrollToCurrentMessage("auto");
              }
            });
          });

          await refreshWorkspaceData(materializedSessionId);
          queueMicrotask(() => {
            scrollToCurrentMessage("smooth");
          });
          shouldFollowCurrentRunRef.current = false;
        } catch (runError) {
          setError(runError instanceof Error ? runError.message : bridgeOfflineMessage);
          setActiveSession((current) => markStreamingMessageErrored(current));
          queueMicrotask(() => {
            scrollToCurrentMessage("smooth");
          });
          shouldFollowCurrentRunRef.current = false;
        }
      })();
    });
  }

  function scrollToCurrentMessage(behavior: ScrollBehavior) {
    scrollTimelineToLatest(behavior);

    const lastMessageId = activeSession?.messages.at(-1)?.id ?? null;
    pulseMessageHighlight(lastMessageId);
  }

  function scrollToFirstMessage(behavior: ScrollBehavior) {
    firstMessageRef.current?.scrollIntoView({
      behavior,
      block: "start",
    });

    const firstMessageId = activeSession?.messages[0]?.id ?? null;
    pulseMessageHighlight(firstMessageId);
  }

  function pulseMessageHighlight(messageId: string | null) {
    if (!messageId) {
      return;
    }

    setHighlightedMessageId(messageId);

    if (highlightResetTimeoutRef.current !== null) {
      window.clearTimeout(highlightResetTimeoutRef.current);
    }

    highlightResetTimeoutRef.current = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current));
      highlightResetTimeoutRef.current = null;
    }, 1400);
  }

  async function handleComposerPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
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
    } catch (pasteError) {
      setError(pasteError instanceof Error ? pasteError.message : bridgeOfflineMessage);
    }
  }

  function handleRemoveAttachment(attachmentPath: string) {
    setAttachments((current) => current.filter((attachment) => attachment.path !== attachmentPath));
  }

  function jumpTimelineToLatest() {
    scrollTimelineToLatest("auto");
  }

  function scrollTimelineToLatest(behavior: ScrollBehavior) {
    requestAnimationFrame(() => {
      const timeline = timelineRef.current;
      if (!timeline) {
        return;
      }

      const top = timeline.scrollHeight;
      if (typeof timeline.scrollTo === "function") {
        timeline.scrollTo({ top, behavior });
      } else {
        timeline.scrollTop = top;
      }

      isTimelinePinnedRef.current = true;
      setIsTimelinePinned(true);
      setHasUnreadLatestReply(false);
    });
  }

  async function ensureMemoryCatalogLoaded() {
    if (allMemories.length > 0) {
      return;
    }

    try {
      const response = await listMemories();
      setAllMemories(response.items);
    } catch {}
  }

  function handleComposerChange(nextValue: string, cursor: number | null) {
    setComposerValue(nextValue);

    const nextMentionQuery = cursor === null ? null : findActiveMentionQuery(nextValue, cursor);
    setMentionQuery(nextMentionQuery);

    if (nextMentionQuery) {
      void ensureMemoryCatalogLoaded();
    }
  }

  function handleSelectMention(candidate: MentionCandidate) {
    setSelectedMentions((current) => {
      if (current.some((item) => item.kind === candidate.kind && item.id === candidate.id)) {
        return current;
      }

      return [...current, candidate];
    });

    setComposerValue((current) => {
      if (!mentionQuery) {
        return current;
      }

      return `${current.slice(0, mentionQuery.start)}${current.slice(mentionQuery.end)}`.replace(/\s{2,}/g, " ");
    });
    setMentionQuery(null);
    setActiveMentionIndex(0);
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  }

  function handleRemoveMention(candidate: MentionCandidate) {
    setSelectedMentions((current) => current.filter((item) => !(item.kind === candidate.kind && item.id === candidate.id)));
  }

  function handleResizeStart(handle: WorkspaceResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) {
    const shellWidth = shellRef.current?.clientWidth ?? 0;
    const leftWidth = leftPanelRef.current?.clientWidth ?? 0;
    const rightWidth = rightPanelRef.current?.clientWidth ?? 0;
    const sidepanelBodyWidth = sidepanelFilesBodyRef.current?.clientWidth ?? rightWidth;
    const sidepanelPrimaryWidth = layoutWidths.sidepanelPrimary ?? Math.round(sidepanelBodyWidth / 2);

    dragStateRef.current = {
      handle,
      shellWidth,
      sidepanelBodyWidth,
      startLeft: layoutWidths.left ?? leftWidth,
      startRight: layoutWidths.right ?? rightWidth,
      startSidepanelPrimary: sidepanelPrimaryWidth,
      startX: event.clientX,
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <section
      className={`shell workspace-shell ${isSidePanelCollapsed ? "workspace-shell-sidepanel-collapsed" : ""}`}
      ref={shellRef}
      style={workspaceShellStyle}
    >
      <aside className="panel panel-left workspace-panel-left" ref={leftPanelRef}>
        <section className="section-group section-group-form">
          <button className="workspace-open-button workspace-open-button-standalone" onClick={() => void handleOpenWorkspace()} type="button">
            {messages.workspace.openWorkspace}
          </button>
        </section>

        {workspaces.length === 0 ? (
          <section className="section-group">
            <div className="workspace-empty">{isLoading ? messages.workspace.loading : messages.workspace.noWorkspace}</div>
          </section>
        ) : (
          workspaces.map((workspace) => (
            <section className="section-group" key={workspace.id}>
              <div className="workspace-group-head">
                <h2 className="section-title">{workspace.name}</h2>
                <div className="workspace-group-actions">
                  <button
                    aria-label={`${messages.workspace.createSession} ${workspace.name}`}
                    className="workspace-create-inline-button"
                    onClick={() => void handleCreateSession(workspace)}
                    type="button"
                  >
                    {messages.workspace.createSession}
                  </button>
                  <button
                    aria-label={`${messages.common.remove} ${workspace.name}`}
                    className="workspace-remove-button"
                    onClick={() => void handleRemoveWorkspace(workspace.id)}
                    type="button"
                  >
                    {messages.common.remove}
                  </button>
                </div>
              </div>
              <div className="session-list">
                {isSessionsLoading ? (
                  <div className="workspace-empty workspace-empty-compact">{messages.workspace.loading}</div>
                ) : null}
                {(sessionsByWorkspace.get(workspace.id) ?? []).map((session) => (
                    <article
                      className={`session-item ${activeSessionId === session.id ? "session-item-active" : ""}`}
                      key={session.id}
                      onContextMenu={(event) => handleSessionContextMenu(event, session)}
                    >
                      <div className="session-row">
                        <button
                          className="session-main-button"
                          onClick={() => void handleSelectSession(session.id)}
                          onFocus={() => handlePrefetchSession(session.id)}
                          onMouseEnter={() => handlePrefetchSession(session.id)}
                          type="button"
                        >
                          <h3>{truncateSessionTitle(session.title)}</h3>
                        </button>
                      </div>
                    </article>
                  ))}
                {!isSessionsLoading && (sessionsByWorkspace.get(workspace.id) ?? []).length === 0 ? (
                  <div className="workspace-empty workspace-empty-compact">{messages.workspace.noSession}</div>
                ) : null}
              </div>
            </section>
          ))
        )}

        <button
          aria-label="Resize left panel"
          className="workspace-resizer workspace-resizer-left"
          onPointerDown={(event) => handleResizeStart("left", event)}
          type="button"
        />
      </aside>

      <section className="panel panel-center workspace-center">
        <div className="workspace-header">
          <div className="workspace-header-meta">
            <span className="eyebrow">{messages.workspace.eyebrow}</span>
            <span className={`workspace-sync-indicator ${hasUnreadLatestReply ? "workspace-sync-indicator-unread" : ""}`}>
              {hasUnreadLatestReply ? messages.workspace.unreadReplies : messages.workspace.syncedLatest}
            </span>
          </div>
          <div className="workspace-header-actions">
            <button className="workspace-header-link" onClick={() => scrollToFirstMessage("smooth")} type="button">
              {messages.workspace.earliestMessage}
            </button>
            <button className="workspace-header-link" onClick={() => scrollToCurrentMessage("smooth")} type="button">
              {messages.workspace.latestMessage}
            </button>
            {isSidePanelCollapsed ? (
              <button className="workspace-header-link" onClick={() => setIsSidePanelCollapsed(false)} type="button">
                {messages.workspace.expand}
              </button>
            ) : null}
          </div>
        </div>

        {localRelayDevice || authSession?.method === "github" ? (
          <section
            aria-label={language === "zh" ? "当前设备目标" : "Current device target"}
            className={`workspace-device-strip ${
              authSession?.method === "github" && defaultRelayDevice && !isUsingDefaultRelayDevice
                ? "workspace-device-strip-warning"
                : ""
            }`}
          >
            <div className="workspace-device-strip-main">
              <div className="workspace-device-chip">
                <span className="workspace-device-chip-label">{messages.workspace.currentDeviceLabel}</span>
                <strong className="workspace-device-chip-value">
                  {localRelayDevice?.name ?? messages.settings.loading}
                </strong>
              </div>
              {authSession?.method === "github" ? (
                <div className="workspace-device-chip">
                  <span className="workspace-device-chip-label">{messages.workspace.defaultDeviceLabel}</span>
                  <strong className="workspace-device-chip-value">
                    {defaultRelayDevice?.name ?? messages.settings.notSet}
                  </strong>
                </div>
              ) : null}
            </div>
            <p className="workspace-device-strip-copy">
              {deviceRouteError && authSession?.method === "github" ? deviceRouteError : workspaceDeviceStatusText}
            </p>
          </section>
        ) : null}

        {currentSessionGoalAutomations.length > 0 ? (
          <section
            aria-label={language === "zh" ? "当前会话自动化状态" : "Current session automation status"}
            className="workspace-goal-automation-strip"
          >
            {currentSessionGoalAutomations.map((rule) => (
              <GoalAutomationStatusCard
                key={rule.id}
                language={language}
                rule={rule}
                variant="banner"
              />
            ))}
          </section>
        ) : null}

        <div className="workspace-log workspace-timeline" ref={timelineRef}>
          {error ? <div className="workspace-empty">{error}</div> : null}
          {!error && isSwitchingSession ? <div className="workspace-empty">{messages.workspace.loading}</div> : null}
          {!error && isActiveSessionLoading && !isSwitchingSession ? (
            <div className="workspace-empty">{messages.workspace.loading}</div>
          ) : null}
          {!error && !isLoading && workspaces.length === 0 ? (
            <div className="workspace-center-empty" aria-hidden="true">
              <div className="workspace-center-empty-copy">
                <p className="workspace-center-empty-title">{messages.workspace.noWorkspacePrompt}</p>
                <p className="workspace-center-empty-body">{messages.workspace.noWorkspaceHint}</p>
              </div>
            </div>
          ) : null}
          {!error && activeSession?.messages.length === 0 ? (
            <div className="workspace-empty">{messages.workspace.noMessages}</div>
          ) : null}
          {activeSession?.messages.map((item, index, items) => (
            <TimelineMessage
              isHighlighted={highlightedMessageId === item.id}
              isCurrent={index === items.length - 1}
              key={item.id}
              message={item}
              onLinkClick={handleMarkdownLinkClick}
              ref={index === 0 ? firstMessageRef : index === items.length - 1 ? currentMessageRef : null}
            />
          ))}
        </div>
        {hasUnreadLatestReply && !isTimelinePinned ? (
          <button
            className="workspace-latest-reply-toast"
            onClick={() => scrollToCurrentMessage("smooth")}
            type="button"
          >
            {messages.workspace.newReplies}
          </button>
        ) : null}

        <div className="composer">
          <div className="composer-prompt">relay &gt;</div>
          <div className="composer-input-shell">
            {selectedMentions.length > 0 ? (
              <div className="composer-mentions" role="list" aria-label="selected context">
                {selectedMentions.map((mention) => (
                  <button
                    aria-label={`remove ${mention.label}`}
                    className="composer-mention-chip"
                    key={`${mention.kind}:${mention.id}`}
                    onClick={() => handleRemoveMention(mention)}
                    type="button"
                  >
                    <span className="composer-mention-chip-kind">{mention.kind === "memory" ? "memory" : "session"}</span>
                    <span>{mention.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="composer-inline-row">
              {attachments.length > 0 ? (
                <div className="composer-attachments" role="list" aria-label="pasted images">
                  {attachments.map((attachment, index) => (
                    <button
                      aria-label={`remove image ${index + 1}`}
                      className="composer-attachment-chip"
                      key={attachment.path}
                      onClick={() => handleRemoveAttachment(attachment.path)}
                      title={attachment.name}
                      type="button"
                    >
                      <span className="composer-attachment-label">{`图${index + 1}`}</span>
                      <span aria-hidden="true" className="composer-attachment-remove">×</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <textarea
                className="composer-input composer-input-field"
                onChange={(event) => handleComposerChange(event.target.value, event.target.selectionStart)}
                onKeyDown={(event) => {
                  if (mentionQuery && filteredMentionCandidates.length > 0) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveMentionIndex((current) => (current + 1) % filteredMentionCandidates.length);
                      return;
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveMentionIndex((current) => (current - 1 + filteredMentionCandidates.length) % filteredMentionCandidates.length);
                      return;
                    }

                    if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                      event.preventDefault();
                      handleSelectMention(filteredMentionCandidates[activeMentionIndex] ?? filteredMentionCandidates[0]);
                      return;
                    }

                    if (event.key === "Escape") {
                      setMentionQuery(null);
                      return;
                    }
                  }

                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.keyCode !== 229
                  ) {
                    event.preventDefault();
                    void handleRun();
                  }
                }}
                onPaste={handleComposerPaste}
                placeholder={messages.workspace.composer}
                ref={composerInputRef}
                rows={1}
                value={composerValue}
              />
            </div>
            {mentionQuery ? (
              <div className="composer-mention-menu" role="listbox" aria-label="context suggestions">
                {filteredMentionCandidates.length > 0 ? (
                  filteredMentionCandidates.map((candidate, index) => (
                    <button
                      aria-selected={index === activeMentionIndex}
                      className={`composer-mention-option ${index === activeMentionIndex ? "composer-mention-option-active" : ""}`}
                      key={`${candidate.kind}:${candidate.id}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSelectMention(candidate);
                      }}
                      role="option"
                      type="button"
                    >
                      <span className="composer-mention-option-kind">{candidate.kind === "memory" ? "memory" : "session"}</span>
                      <span className="composer-mention-option-main">{candidate.label}</span>
                      <span className="composer-mention-option-detail">{candidate.detail}</span>
                    </button>
                  ))
                ) : (
                  <div className="composer-mention-empty">no matching context</div>
                )}
              </div>
            ) : null}
          </div>
          <button
            className="composer-send"
            disabled={!activeSession || isRunning || (!composerValue.trim() && attachments.length === 0)}
            onClick={() => void handleRun()}
            type="button"
          >
            {isRunning ? messages.workspace.loading : messages.workspace.send}
          </button>
        </div>
      </section>

      {isSidePanelCollapsed ? null : (
        <aside className="panel panel-right workspace-sidepanel" ref={rightPanelRef}>
          <button
            aria-label="Resize right panel"
            className="workspace-resizer workspace-resizer-right"
            onPointerDown={(event) => handleResizeStart("right", event)}
            type="button"
          />
          <div className="panel-head workspace-sidepanel-head">
            <button
              className="workspace-sidepanel-toggle"
              onClick={() => setIsSidePanelCollapsed(true)}
              type="button"
            >
              {messages.workspace.collapse}
            </button>
          </div>

          <div className="workspace-sidepanel-tabs" role="tablist" aria-label={messages.workspace.sidePanelAriaLabel}>
            {(["summary", "files", "actions", "automation"] as WorkspaceSidePanelMode[]).map((mode) => (
              <button
                aria-selected={sidePanelMode === mode}
                className={`workspace-sidepanel-tab ${sidePanelMode === mode ? "workspace-sidepanel-tab-active" : ""}`}
                key={mode}
                onClick={() => setSidePanelMode(mode)}
                role="tab"
                type="button"
              >
                {getSidePanelModeLabel(mode, messages)}
              </button>
            ))}
          </div>

          {sidePanelMode === "files" ? (
            <div
              className="workspace-sidepanel-body workspace-sidepanel-body-files"
              ref={sidepanelFilesBodyRef}
              style={sidepanelFilesBodyStyle}
            >
              <div className="workspace-files-column">
                <div className="workspace-sidepanel-subhead">
                  <span className="eyebrow">{messages.workspace.filesTitle}</span>
                  <span className="workspace-sidepanel-subhead-detail">
                    {visibleFileTree.length} {messages.workspace.fileTreeNodes}
                  </span>
                </div>
                <div className="file-tree">
                  {visibleFileTree.map((node) => (
                    <div
                      className={`file-row ${node.kind === "folder" ? "file-row-folder" : "file-row-file"} ${preview?.path === node.path ? "file-row-active" : ""}`}
                      key={node.id}
                    >
                      <button
                        className="file-row-main"
                        onClick={() => void handleSelectFileTreeNode(node)}
                        type="button"
                      >
                        <span className="file-row-label" style={{ paddingLeft: `${8 + node.depth * 14}px` }}>
                          {node.kind === "folder" ? (
                            <>
                              <span className="file-row-chevron" aria-hidden="true">{node.isExpanded ? "▾" : "▸"}</span>
                              <span className="file-row-icon file-row-icon-folder" aria-hidden="true">□</span>
                            </>
                          ) : (
                            <>
                              <span className="file-row-chevron file-row-chevron-spacer" aria-hidden="true"> </span>
                              <span className="file-row-icon file-row-icon-file" aria-hidden="true">·</span>
                            </>
                          )}
                          {node.name}
                        </span>
                      </button>
                      <span className="file-row-actions">
                        <button
                          className="file-row-action"
                          onClick={() => void handleOpenNodeInFinder(node)}
                          type="button"
                        >
                          {messages.workspace.openInFinder}
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                aria-label="Resize files panel"
                className="workspace-sidepanel-resizer"
                onPointerDown={(event) => handleResizeStart("sidepanel", event)}
                type="button"
              />

              <div className="workspace-preview-column">
                <div className="workspace-sidepanel-subhead">
                  <span className="eyebrow">{preview?.name ?? messages.workspace.previewTitle}</span>
                  {preview ? (
                    <button className="workspace-preview-close" onClick={() => setPreview(null)} type="button">
                      {messages.workspace.clearPreview}
                    </button>
                  ) : null}
                </div>

                <div className="workspace-preview-body">
                  {isPreviewLoading ? <div className="workspace-empty">{messages.workspace.loadingPreview}</div> : null}
                  {!isPreviewLoading && preview ? (
                    preview.extension === ".md" ? (
                      <div
                        className="file-preview-markdown"
                        dangerouslySetInnerHTML={{ __html: previewHtml ?? "" }}
                        onClick={handleMarkdownLinkClick}
                      />
                    ) : (
                      <pre className="file-preview-pre">{preview.content}</pre>
                    )
                  ) : null}
                  {!isPreviewLoading && !preview ? (
                    <div className="workspace-sidepanel-empty">
                      <p>{messages.workspace.pickPreviewHint}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {sidePanelMode === "summary" ? (
            <div className="workspace-sidepanel-body workspace-sidepanel-scroll">
              <section className="workspace-sidepanel-section">
                <div className="workspace-sidepanel-subhead">
                  <span className="eyebrow">{messages.workspace.sessionLabel}</span>
                  <span className="workspace-sidepanel-subhead-detail">
                    {activeSession ? `${activeSession.turnCount} ${messages.workspace.turnsSuffix}` : messages.workspace.noSession}
                  </span>
                </div>
                {activeSession ? (
                  <div className="workspace-summary-card">
                    <h3>{activeSession.title}</h3>
                    <p>{messages.workspace.latestUpdate} {formatMessageTime(activeSession.updatedAt)}</p>
                  </div>
                ) : (
                  <div className="workspace-sidepanel-empty">
                    <p>{messages.workspace.noActiveSession}</p>
                  </div>
                )}
              </section>

              <section className="workspace-sidepanel-section">
                <div className="workspace-sidepanel-subhead">
                  <span className="eyebrow">{messages.sessions.memoryCopilot}</span>
                  <span className="workspace-sidepanel-subhead-detail">
                    {activeSession?.title ?? messages.workspace.noSession}
                  </span>
                </div>
                {isMemoriesLoading ? (
                  <div className="workspace-sidepanel-empty">
                    <p>{messages.workspace.loading}</p>
                  </div>
                ) : groupedSessionMemories.length > 0 ? (
                  <div className="workspace-summary-timeline">
                    {groupedSessionMemories.map((group) => (
                      <section className="workspace-summary-memory-group" key={group.date}>
                        <div className="workspace-sidepanel-subhead">
                          <span className="eyebrow">{group.date}</span>
                          <span className="workspace-sidepanel-subhead-detail">{group.items.length}</span>
                        </div>
                        {group.items.map((memory) => (
                          <article className="workspace-summary-timeline-item" key={memory.id}>
                            <div className="workspace-summary-timeline-top">
                              <span>{memory.themeTitle}</span>
                              <span>{`${memory.checkpointTurnCount} ${messages.workspace.turnsSuffix}`}</span>
                            </div>
                            <strong>{memory.title}</strong>
                            <div
                              className="workspace-log-content"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(memory.content) }}
                            />
                          </article>
                        ))}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="workspace-sidepanel-empty">
                    <p>no timeline memories yet for this session</p>
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {sidePanelMode === "actions" ? (
            <div className="workspace-sidepanel-body workspace-sidepanel-scroll">
              <section className="workspace-sidepanel-section">
                <div className="workspace-sidepanel-subhead">
                  <span className="eyebrow">{messages.workspace.quickActions}</span>
                  <span className="workspace-sidepanel-subhead-detail">{actionPrompts.length}</span>
                </div>
                <div className="workspace-actions-list">
                  {actionPrompts.map((item) => (
                    <button
                      className="workspace-action-card"
                      key={item.title}
                      onClick={() => {
                        setComposerValue(item.prompt);
                        queueMicrotask(() => {
                          composerInputRef.current?.focus();
                        });
                      }}
                      type="button"
                    >
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {sidePanelMode === "automation" ? (
            <div className="workspace-sidepanel-body workspace-sidepanel-scroll">
              <section className="workspace-sidepanel-section">
                <div className="workspace-sidepanel-subhead">
                  <span className="eyebrow">{messages.workspace.automationTab}</span>
                  <span className="workspace-sidepanel-subhead-detail">{automationActionCount}</span>
                </div>
                {activeSession ? (
                  <div className="workspace-sidepanel-section">
                    <div className="workspace-sidepanel-subhead">
                      <span className="eyebrow">{language === "zh" ? "当前会话状态" : "Current session status"}</span>
                      <span className="workspace-sidepanel-subhead-detail">{currentSessionGoalAutomations.length}</span>
                    </div>
                    {isAutomationRulesLoading ? (
                      <div className="workspace-sidepanel-empty">
                        <p>{language === "zh" ? "正在加载关联自动化..." : "Loading linked automations..."}</p>
                      </div>
                    ) : null}
                    {!isAutomationRulesLoading && currentSessionGoalAutomations.length === 0 ? (
                      <div className="workspace-sidepanel-empty">
                        <p>
                          {language === "zh"
                            ? "当前会话还没有关联的目标自动化。创建后，这里会直接显示是否完成、停在第几轮，以及最近结论。"
                            : "This session has no linked goal automation yet. Once created, its completion state, turn progress, and latest conclusion will appear here."}
                        </p>
                      </div>
                    ) : null}
                    {!isAutomationRulesLoading && currentSessionGoalAutomations.length > 0 ? (
                      <div className="workspace-actions-list">
                        {currentSessionGoalAutomations.map((rule) => (
                          <GoalAutomationStatusCard key={rule.id} language={language} rule={rule} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="workspace-actions-list">
                  {activeSession ? (
                    <button
                      className="workspace-action-card"
                      onClick={() => {
                        const target = new URL("/automation", window.location.origin);
                        target.searchParams.set("mode", "create-goal");
                        target.searchParams.set("sessionId", activeSession.id);
                        target.searchParams.set("sessionTitle", activeSession.title);
                        window.location.assign(target.toString());
                      }}
                      type="button"
                    >
                      <strong>{language === "zh" ? "为当前会话创建目标自动推进" : "Create goal automation for this session"}</strong>
                      <p>
                        {language === "zh"
                          ? "自动绑定当前 session，让 Relay 围绕目标自动多轮推进，直到完成或触发兜底停止条件。"
                          : "Bind the current session and let Relay continue multi-turn progress toward a goal until it completes or hits a safety stop."}
                      </p>
                    </button>
                  ) : null}
                  <button
                    className="workspace-action-card"
                    onClick={() => {
                      setComposerValue(automationPrompt.prompt);
                      queueMicrotask(() => {
                        composerInputRef.current?.focus();
                      });
                    }}
                    type="button"
                  >
                    <strong>{automationPrompt.title}</strong>
                    <p>{automationPrompt.description}</p>
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </aside>
      )}

      {archiveCandidate ? (
        <div className="confirm-backdrop" onClick={() => (isArchiving ? null : setArchiveCandidate(null))} role="presentation">
          <div
            aria-modal="true"
            className="confirm-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="confirm-dialog-head">
              <span className="eyebrow">{messages.workspace.archiveSessionTitle}</span>
            </div>
            <p className="confirm-dialog-body">{messages.workspace.archiveSessionConfirm}</p>
            <p className="confirm-dialog-session">{archiveCandidate.title}</p>
            <div className="confirm-dialog-actions">
              <button className="confirm-dialog-button" onClick={() => setArchiveCandidate(null)} type="button">
                {messages.common.cancel}
              </button>
              <button className="confirm-dialog-button confirm-dialog-button-danger" disabled={isArchiving} onClick={() => void handleArchiveSession()} type="button">
                {isArchiving ? messages.workspace.loading : messages.common.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sessionContextMenu ? (
        <>
          <div className="context-menu-backdrop" onClick={() => setSessionContextMenu(null)} role="presentation" />
          <div
            className="context-menu"
            onClick={(event) => event.stopPropagation()}
            role="menu"
            style={{ left: sessionContextMenu.left, top: sessionContextMenu.top }}
          >
            <button
              className="context-menu-item"
              onClick={() => handleOpenRenameDialog(sessionContextMenu.session)}
              type="button"
            >
              {messages.workspace.rename}
            </button>
            <button
              className="context-menu-item"
              onClick={() => handleOpenArchiveDialog(sessionContextMenu.session)}
              type="button"
            >
              {messages.common.archive}
            </button>
          </div>
        </>
      ) : null}

      {renameCandidate ? (
        <div className="confirm-backdrop" onClick={() => (isRenaming ? null : setRenameCandidate(null))} role="presentation">
          <div
            aria-modal="true"
            className="confirm-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="confirm-dialog-head">
              <span className="eyebrow">{messages.workspace.renameSession}</span>
            </div>
            <input
              autoFocus
              className="rename-session-input"
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  void handleRenameSession();
                }

                if (event.key === "Escape" && !isRenaming) {
                  setRenameCandidate(null);
                }
              }}
              value={renameValue}
            />
            <div className="confirm-dialog-actions">
              <button
                className="confirm-dialog-button"
                onClick={() => {
                  setRenameCandidate(null);
                  setRenameValue("");
                }}
                type="button"
              >
                {messages.common.cancel}
              </button>
              <button className="confirm-dialog-button" disabled={isRenaming || !renameValue.trim()} onClick={() => void handleRenameSession()} type="button">
                {isRenaming ? messages.workspace.loading : messages.workspace.rename}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function isTimelineNearBottom(element: HTMLDivElement, threshold = 32) {
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remaining <= threshold;
}

function resetComposerInputHeight(input: HTMLTextAreaElement | null) {
  if (!input) {
    return;
  }

  input.style.height = "0px";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}

function createOptimisticMessage(
  sessionId: string,
  role: Message["role"],
  content: string,
  sequence: number,
  status: MessageStatus = "completed",
  id = createClientMessageId(role),
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

function formatUserMessagePreview(text: string, attachments: SessionAttachment[]) {
  const attachmentPreview = attachments.map((attachment) => `[Image: ${attachment.name}]`).join("\n");

  if (text && attachmentPreview) {
    return `${text}\n${attachmentPreview}`;
  }

  return text || attachmentPreview;
}

function createClientMessageId(role: Message["role"]) {
  return `client-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const TimelineMessage = memo(
  forwardRef<HTMLElement, TimelineMessageProps>(function TimelineMessage(
    { isCurrent, isHighlighted, message, onLinkClick },
    ref,
  ) {
    const html = useMemo(
      () => (message.meta?.kind === "process" ? null : renderMarkdown(message.content)),
      [message.content, message.meta?.kind],
    );
    const processMeta = message.meta?.kind === "process" ? message.meta.process : undefined;

    return (
      <article
        className={`workspace-log-item workspace-log-item-${message.role} ${processMeta ? "workspace-log-item-process" : ""} ${isHighlighted ? "workspace-log-item-highlighted" : ""}`}
        data-message-id={message.id}
        ref={ref}
      >
        {processMeta ? (
          <div className="workspace-process-card">
            <div className="workspace-process-top">
              <div className="workspace-process-head">
                <span className={`workspace-process-phase workspace-process-phase-${processMeta.phase}`}>
                  {processMeta.phase}
                </span>
                <strong className="workspace-process-title">
                  {processMeta.label ?? PROCESS_TITLES[processMeta.phase]}
                </strong>
              </div>
              <div className="workspace-process-meta">
                <span className={`workspace-process-status workspace-process-status-${message.status ?? "completed"}`}>
                  {formatProcessStatus(message.status)}
                </span>
                <span className="workspace-process-time">{formatMessageTime(message.createdAt)}</span>
              </div>
            </div>
            {message.content.trim() ? (
              <pre className="workspace-process-body">{message.content.trimEnd()}</pre>
            ) : (
              <div className="workspace-process-body workspace-process-body-empty">waiting for output</div>
            )}
          </div>
        ) : (
          <>
            <div className="workspace-log-top">
              <span className="workspace-log-label">{message.role}</span>
              <span className="workspace-log-detail">{formatMessageTime(message.createdAt)}</span>
            </div>
            <div className="workspace-log-content" dangerouslySetInnerHTML={{ __html: html ?? "" }} onClick={onLinkClick} />
          </>
        )}
      </article>
    );
  }),
  (previous, next) =>
    previous.isHighlighted === next.isHighlighted &&
    previous.isCurrent === next.isCurrent &&
    previous.message === next.message &&
    previous.onLinkClick === next.onLinkClick,
);

type TimelineMessageProps = {
  isHighlighted: boolean;
  isCurrent: boolean;
  message: Message;
  onLinkClick: (event: MouseEvent<HTMLElement>) => void;
};

function cacheSessionDetail(cache: Map<string, Session>, session: Session) {
  cache.set(session.id, session);
}

function formatMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function GoalAutomationStatusCard({
  language,
  rule,
  variant = "sidepanel",
}: {
  language: AppLanguage;
  rule: SessionGoalAutomationRule;
  variant?: "banner" | "sidepanel";
}) {
  const conclusion = getGoalAutomationConclusion(rule, language);

  return (
    <article
      className={`workspace-action-card workspace-automation-status-card ${variant === "banner" ? "workspace-automation-status-card-banner" : ""}`}
    >
      <div className="workspace-automation-status-head">
        <div className="workspace-automation-status-title">
          {variant === "banner" ? (
            <span className="workspace-automation-status-kicker">
              {language === "zh" ? "自动化状态" : "Automation status"}
            </span>
          ) : null}
          <strong>{rule.title}</strong>
        </div>
        <span className={`automation-status-pill automation-status-${getGoalAutomationTone(rule)}`}>
          {formatGoalAutomationState(rule, language)}
        </span>
      </div>
      <div className="workspace-automation-status-detail-grid">
        <div className="workspace-automation-status-detail">
          <span>{language === "zh" ? "进度" : "Progress"}</span>
          <strong>{formatGoalAutomationProgress(rule, language)}</strong>
        </div>
        <div className="workspace-automation-status-detail">
          <span>{language === "zh" ? "结论" : "Conclusion"}</span>
          <strong>{conclusion ?? (language === "zh" ? "暂无明确结论。" : "No conclusion yet.")}</strong>
        </div>
      </div>
      <div className="workspace-automation-status-meta">
        <span>{getGoalAutomationSessionModeLabel(rule, language)}</span>
        <span>{getGoalAutomationLastRunLabel(rule, language)}</span>
      </div>
    </article>
  );
}

function formatGoalAutomationState(rule: SessionGoalAutomationRule, language: AppLanguage) {
  if (rule.runStatus === "running") {
    return language === "zh" ? "运行中" : "running";
  }

  if (rule.stopReason === "completed") {
    return language === "zh" ? "已完成" : "completed";
  }

  if (rule.stopReason === "failed" || rule.runStatus === "failed") {
    return language === "zh" ? "失败" : "failed";
  }

  if (rule.stopReason === "stopped_by_user") {
    return language === "zh" ? "已停止" : "stopped";
  }

  if (rule.stopReason === "max_turns_reached") {
    return language === "zh" ? "达到轮次上限" : "max turns";
  }

  if (rule.stopReason === "max_duration_reached") {
    return language === "zh" ? "达到时长上限" : "max duration";
  }

  if (rule.status === "paused") {
    return language === "zh" ? "已暂停" : "paused";
  }

  return language === "zh" ? "待运行" : "idle";
}

function getGoalAutomationTone(rule: SessionGoalAutomationRule) {
  if (rule.runStatus === "running") {
    return "running";
  }

  if (rule.stopReason === "completed") {
    return "completed";
  }

  if (rule.stopReason === "failed" || rule.runStatus === "failed") {
    return "failed";
  }

  if (rule.stopReason === "stopped_by_user" || rule.stopReason === "max_turns_reached" || rule.stopReason === "max_duration_reached") {
    return "stopped";
  }

  return rule.status === "paused" ? "paused" : "active";
}

function formatGoalAutomationProgress(rule: SessionGoalAutomationRule, language: AppLanguage) {
  const turns = `${rule.currentTurnCount}/${rule.maxTurns}`;

  if (rule.runStatus === "running") {
    return language === "zh" ? `当前进度 ${turns} 轮，正在继续推进。` : `Current progress ${turns} turns and still running.`;
  }

  if (rule.stopReason === "completed") {
    return language === "zh" ? `已在 ${turns} 轮内完成。` : `Completed within ${turns} turns.`;
  }

  if (rule.stopReason === "failed") {
    return language === "zh" ? `运行失败，结束于 ${turns} 轮。` : `Failed after ${turns} turns.`;
  }

  if (rule.stopReason === "stopped_by_user") {
    return language === "zh" ? `已手动停止，结束于 ${turns} 轮。` : `Stopped by user after ${turns} turns.`;
  }

  if (rule.stopReason === "max_turns_reached") {
    return language === "zh" ? `达到轮次上限，停在 ${turns} 轮。` : `Stopped at the max turn limit of ${turns}.`;
  }

  if (rule.stopReason === "max_duration_reached") {
    return language === "zh" ? `达到时长上限，停在 ${turns} 轮。` : `Stopped at the max duration after ${turns} turns.`;
  }

  return language === "zh"
    ? `尚未开始。最多 ${rule.maxTurns} 轮 / ${rule.maxDurationMinutes} 分钟。`
    : `Not started yet. Up to ${rule.maxTurns} turns / ${rule.maxDurationMinutes} minutes.`;
}

function getGoalAutomationConclusion(rule: SessionGoalAutomationRule, language: AppLanguage) {
  if (rule.lastEvaluationReason?.trim()) {
    return rule.lastEvaluationReason.trim();
  }

  if (rule.lastError?.trim()) {
    return rule.lastError.trim();
  }

  if (rule.lastAssistantSummary?.trim()) {
    return language === "zh"
      ? `最近结论：${rule.lastAssistantSummary.trim()}`
      : `Latest conclusion: ${rule.lastAssistantSummary.trim()}`;
  }

  return null;
}

function getGoalAutomationSessionModeLabel(rule: SessionGoalAutomationRule, language: AppLanguage) {
  if (rule.targetSessionMode === "existing-session") {
    return language === "zh" ? "绑定当前会话" : "bound to current session";
  }

  return language === "zh" ? "专用自动化会话" : "dedicated automation session";
}

function getGoalAutomationLastRunLabel(rule: SessionGoalAutomationRule, language: AppLanguage) {
  if (!rule.lastRunAt) {
    return language === "zh" ? "尚未运行" : "not run yet";
  }

  return language === "zh"
    ? `最近运行 ${formatMessageTime(rule.lastRunAt)}`
    : `last run ${formatMessageTime(rule.lastRunAt)}`;
}

function formatProcessStatus(status: MessageStatus | undefined) {
  if (status === "streaming") {
    return "running";
  }

  if (status === "error") {
    return "failed";
  }

  return "done";
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
        ? updateMessageStatus(
            {
              ...message,
              content: `${message.content}${event.delta}`,
              updatedAt: event.createdAt,
            },
            "streaming",
          )
        : message,
    );

    return {
      ...session,
      updatedAt: event.createdAt,
      messages,
    };
  }

  if (event.type === "message.completed" || event.type === "run.completed") {
    const messages: Message[] = session.messages.map((message) =>
      message.id === assistantMessageId || (message.role === "system" && message.status === "streaming")
        ? updateMessageStatus(message, "completed", event.createdAt)
        : message,
    );

    return {
      ...session,
      updatedAt: event.createdAt,
      messages,
    };
  }

  if (event.type === "run.failed") {
    const messages: Message[] = session.messages.map((message) =>
      message.id === assistantMessageId || (message.role === "system" && message.status === "streaming")
        ? updateMessageStatus(message, "error", event.createdAt)
        : message,
    );

    return {
      ...session,
      updatedAt: event.createdAt,
      messages,
    };
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

  return {
    ...session,
    messages,
  };
}

function updateMessageStatus(message: Message, status: MessageStatus, updatedAt = message.updatedAt): Message {
  return {
    ...message,
    status,
    updatedAt,
  };
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
    return {
      ...session,
      updatedAt: event.createdAt,
      messages: session.messages.map((message) =>
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
      ),
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

  if (!current) {
    return normalizedDelta;
  }

  return `${current}${normalizedDelta}`;
}

function createInitialProcessContent(event: Extract<RuntimeEvent, { type: "process.started" }>) {
  if (event.phase === "command" && event.label) {
    return `$ ${event.label}\n`;
  }

  return "";
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

function buildVisibleFileTree(
  node: FileTreeNode | null,
  collapsedFolders: Set<string>,
  depth = 0,
): VisibleFileTreeNode[] {
  if (!node) {
    return [];
  }

  const hasChildren = Boolean(node.children && node.children.length > 0);
  const canExpand = node.kind === "folder" && (node.hasChildren ?? hasChildren);
  const isExpanded = node.kind === "folder" && !collapsedFolders.has(node.path);
  const current: VisibleFileTreeNode = {
    id: node.id,
    name: node.name,
    kind: node.kind,
    depth,
    path: node.path,
    isExpanded,
    hasChildren: canExpand,
    isLoaded: isFileTreeFolderLoaded(node),
  };

  if (node.kind !== "folder" || !isExpanded || !current.hasChildren) {
    return [current];
  }

  return [
    current,
    ...(node.children?.flatMap((child) => buildVisibleFileTree(child, collapsedFolders, depth + 1)) ?? []),
  ];
}

function mergeFileTreeNode(current: FileTreeNode | null, subtree: FileTreeNode): FileTreeNode | null {
  if (!current) {
    return subtree;
  }

  if (current.path === subtree.path) {
    return subtree;
  }

  if (!current.children || current.children.length === 0) {
    return current;
  }

  return {
    ...current,
    children: current.children.map((child) => mergeFileTreeNode(child, subtree) ?? child),
  };
}

function createInitialCollapsedFolders(root: FileTreeNode | null) {
  const collapsed = new Set<string>();

  if (!root?.children) {
    return collapsed;
  }

  for (const child of root.children) {
    collectFolderPaths(child, collapsed);
  }

  return collapsed;
}

function isFileTreeFolderLoaded(node: FileTreeNode) {
  if (node.kind !== "folder") {
    return true;
  }

  if (!Array.isArray(node.children)) {
    return false;
  }

  if (node.children.length > 0) {
    return true;
  }

  return node.hasChildren === false;
}

function collectFolderPaths(node: FileTreeNode, collapsed: Set<string>) {
  if (node.kind !== "folder") {
    return;
  }

  collapsed.add(node.path);

  for (const child of node.children ?? []) {
    collectFolderPaths(child, collapsed);
  }
}

function expandFileAncestors(filePath: string, setCollapsedFolders: Dispatch<SetStateAction<Set<string>>>) {
  setCollapsedFolders((current) => {
    const next = new Set(current);
    const normalized = filePath.replaceAll("\\", "/");
    const parts = normalized.split("/").filter(Boolean);
    let currentPath = normalized.startsWith("/") ? "" : parts.shift() ?? "";

    for (const part of parts.slice(0, -1)) {
      currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
      next.delete(currentPath);
    }

    return next;
  });
}

function truncateSessionTitle(value: string, maxLength = 15) {
  const characters = Array.from(value);

  if (characters.length <= maxLength) {
    return value;
  }

  return `${characters.slice(0, maxLength).join("")}...`;
}

function clampNumber(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function parseCssPixelValue(rawValue: string) {
  const normalized = rawValue.trim();

  if (!normalized.endsWith("px")) {
    return null;
  }

  const parsed = Number.parseFloat(normalized.replace("px", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function readWorkspaceLayout() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<Record<keyof WorkspaceLayoutWidths, number>>;
    return {
      left: typeof parsed.left === "number" ? parsed.left : null,
      right: typeof parsed.right === "number" ? parsed.right : null,
      sidepanelPrimary: typeof parsed.sidepanelPrimary === "number" ? parsed.sidepanelPrimary : null,
    } satisfies WorkspaceLayoutWidths;
  } catch {
    return null;
  }
}

function writeWorkspaceLayout(layoutWidths: WorkspaceLayoutWidths) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify(layoutWidths));
  } catch {}
}

function clampWorkspaceLayout(
  layoutWidths: WorkspaceLayoutWidths,
  shellWidth: number,
  sidepanelBodyWidth: number,
): WorkspaceLayoutWidths {
  const left = layoutWidths.left
    ? clampNumber(layoutWidths.left, WORKSPACE_LEFT_MIN_WIDTH, shellWidth - (layoutWidths.right ?? WORKSPACE_RIGHT_MIN_WIDTH) - WORKSPACE_CENTER_MIN_WIDTH)
    : null;
  const right = layoutWidths.right
    ? clampNumber(layoutWidths.right, WORKSPACE_RIGHT_MIN_WIDTH, shellWidth - (left ?? WORKSPACE_LEFT_MIN_WIDTH) - WORKSPACE_CENTER_MIN_WIDTH)
    : null;
  const sidepanelPrimary = layoutWidths.sidepanelPrimary
    ? sidepanelBodyWidth > 0
      ? clampNumber(
          layoutWidths.sidepanelPrimary,
          WORKSPACE_SIDEPANEL_PRIMARY_MIN_WIDTH,
          Math.max(
            WORKSPACE_SIDEPANEL_PRIMARY_MIN_WIDTH,
            sidepanelBodyWidth - WORKSPACE_RESIZER_WIDTH - WORKSPACE_SIDEPANEL_SECONDARY_MIN_WIDTH,
          ),
        )
      : layoutWidths.sidepanelPrimary
    : null;

  return {
    left,
    right,
    sidepanelPrimary,
  };
}

function collectSessionLinkedFiles(messages: Message[]) {
  const filePaths = new Set<string>();

  for (const message of messages) {
    for (const filePath of extractFilePathsFromContent(message.content)) {
      filePaths.add(filePath);
    }
  }

  return [...filePaths];
}

function extractFilePathsFromContent(content: string) {
  const filePaths = new Set<string>();
  const markdownLinkPattern = /\[[^\]]+\]\((\/[^)\s]+)\)/g;
  const dataLinkPattern = /data-file-path="(\/[^"]+)"/g;

  for (const match of content.matchAll(markdownLinkPattern)) {
    if (match[1]) {
      filePaths.add(match[1]);
    }
  }

  for (const match of content.matchAll(dataLinkPattern)) {
    if (match[1]) {
      filePaths.add(match[1]);
    }
  }

  return [...filePaths];
}

function createTimelineSummaryItems(session: Session | null) {
  if (!session) {
    return [];
  }

  return session.messages.map((message) => ({
    id: message.id,
    role: message.role,
    time: formatMessageTime(message.createdAt),
    content: summarizeMessageContent(message.content),
  }));
}

function summarizeMessageContent(content: string, maxLength = 120) {
  const compact = content.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength).trimEnd()}...`;
}

function groupMemoriesByDate(memories: TimelineMemory[]) {
  const groups = new Map<string, TimelineMemory[]>();

  for (const memory of memories) {
    const current = groups.get(memory.memoryDate) ?? [];
    current.push(memory);
    groups.set(memory.memoryDate, current);
  }

  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => b.checkpointTurnCount - a.checkpointTurnCount),
    }));
}

function createWorkspaceActionPrompts(session: Session | null, linkedFiles: string[], language: AppLanguage) {
  const isZh = language === "zh";
  const referencedFiles = linkedFiles.length > 0
    ? isZh
      ? `涉及文件包括：${linkedFiles.join("、")}。`
      : `Referenced files include: ${linkedFiles.join(", ")}.`
    : "";
  const sessionTitle = session?.title
    ? isZh
      ? `当前 session 标题：${session.title}。`
      : `Current session title: ${session.title}.`
    : "";
  const recentPreferenceContext = createRecentPreferenceContext(session, language);

  return [
    {
      title: isZh ? "时间线记忆" : "timeline memory",
      description: isZh
        ? "按明确时间点梳理变化，合并用户决策与关注点地图，形成一条完整记忆。"
        : "Create one timeline memory that preserves concrete time points, decisions, and focus map.",
      prompt: isZh
        ? `请整理这个 session 的时间线记忆：必须严格按记录中的时间点梳理变化，明确写出每个关键变化发生在什么时间，不能丢失时间信息，也不要把不同时间点的内容混在一起；按时间线梳理对话摘要，保留必要细节和具体文件；提取用户明确做出的决策和理由，若理由未明说就不要补；识别用户真正关注什么、不关注什么。${sessionTitle}${referencedFiles}`.trim()
        : `Please create a timeline memory for this session: you must preserve the concrete recorded time points for each important change, explicitly state when each change happened, never drop time information, and do not merge content from different time points together; summarize the conversation as a timeline with concrete file details, extract only explicit user decisions and stated reasons, and identify what the user truly cared about or did not care about. ${sessionTitle}${referencedFiles}`.trim(),
    },
    {
      title: isZh ? "记录用户偏好" : "capture user preferences",
      description: isZh
        ? "基于最近 3 轮对话识别用户偏好，整理为可复用记忆。"
        : "Identify user preferences from the latest 3 turns and turn them into reusable memory.",
      prompt: isZh
        ? [
            "请将最近 3 轮对话处理为一条“用户偏好记忆”。",
            sessionTitle,
            referencedFiles,
            "请明确写出：",
            "1. 当前所处的场景或环境信息",
            "2. 用户是针对什么对象或问题表达偏好",
            "3. 用户表达了什么偏好、约束、取舍或反感点",
            "4. 若偏好只在特定场景成立，请明确标注适用范围",
            "5. 不要补充用户没有明确表达的长期偏好",
            recentPreferenceContext,
          ].filter(Boolean).join("\n")
        : [
            "Please turn the latest 3 turns into a reusable user-preference memory.",
            sessionTitle,
            referencedFiles,
            "Make sure to state:",
            "1. The current scene or environment",
            "2. What object, workflow, or problem the preference refers to",
            "3. The specific preference, constraint, tradeoff, or dislike the user expressed",
            "4. The scope if the preference only applies in a specific context",
            "5. Do not invent durable preferences the user did not explicitly express",
            recentPreferenceContext,
          ].filter(Boolean).join("\n"),
    },
  ];
}

function createRecentPreferenceContext(session: Session | null, language: AppLanguage) {
  if (!session) {
    return "";
  }

  const isZh = language === "zh";
  const recentMessages = session.messages.slice(-6);
  if (recentMessages.length === 0) {
    return "";
  }

  const header = isZh ? "最近 3 轮对话参考：" : "Latest 3-turn reference:";
  const lines = recentMessages.map((message, index) => {
    const roleLabel = message.role === "user"
      ? (isZh ? "用户" : "user")
      : message.role === "assistant"
        ? (isZh ? "助手" : "assistant")
        : (isZh ? "系统" : "system");

    return `${index + 1}. ${roleLabel}: ${summarizeMessageContent(message.content, 240)}`;
  });

  return [header, ...lines].join("\n");
}

function createWorkspaceAutomationPrompt(session: Session | null, linkedFiles: string[], language: AppLanguage) {
  const isZh = language === "zh";
  const referencedFiles = linkedFiles.length > 0
    ? isZh
      ? `涉及文件包括：${linkedFiles.join("、")}。`
      : `Referenced files include: ${linkedFiles.join(", ")}.`
    : "";
  const sessionTitle = session?.title
    ? isZh
      ? `当前 session 标题：${session.title}。`
      : `Current session title: ${session.title}.`
    : "";

  return {
    title: isZh ? "自动化" : "automation",
    description: isZh
      ? "为当前工作区或当前会话设计一个可重复执行的自动化任务。"
      : "Design a repeatable automation for the current workspace or session.",
    prompt: isZh
      ? [
          "请基于当前上下文帮我设计一个 Codex 自动化。",
          sessionTitle,
          referencedFiles,
          "请先给出一个最小可用方案，内容包括：",
          "1. 这个自动化应该做什么",
          "2. 适合的触发方式（按时间 / 按轮次 / 按关键词）",
          "3. 建议的名称",
          "4. 推荐的执行频率",
          "5. 一段可以直接用于创建 automation 的 prompt",
        ]
          .filter(Boolean)
          .join("\n")
      : [
          "Please design a Codex automation based on the current context.",
          sessionTitle,
          referencedFiles,
          "Start with a minimum viable setup and include:",
          "1. what the automation should do",
          "2. the best trigger mode (schedule / turn-based / keyword-based)",
          "3. a suggested short name",
          "4. a recommended run frequency",
          "5. a prompt that can be used directly to create the automation",
        ]
          .filter(Boolean)
          .join("\n"),
  };
}

function findActiveMentionQuery(value: string, cursor: number) {
  const prefix = value.slice(0, cursor);
  const match = prefix.match(/(?:^|\s)@([^\s@]*)$/);

  if (!match) {
    return null;
  }

  const token = match[0];
  const start = prefix.length - token.length + token.lastIndexOf("@");

  return {
    query: match[1] ?? "",
    start,
    end: cursor,
  };
}

function buildMentionCandidates(sessions: Session[], memories: TimelineMemory[], activeSessionId: string | null): MentionCandidate[] {
  const sessionCandidates = sessions
    .filter((session) => session.id !== activeSessionId)
    .map((session) => ({
      id: session.id,
      kind: "session" as const,
      label: session.title,
      detail: `session · ${formatMentionSessionDetail(session)}`,
      sessionId: session.id,
      searchText: `${session.title} ${session.updatedAt}`.toLowerCase(),
    }));

  const memoryCandidates = memories.map((memory) => ({
    id: memory.id,
    kind: "memory" as const,
    label: memory.title,
    detail: `${memory.themeTitle} · ${memory.memoryDate}`,
    sessionId: memory.sessionId,
    searchText: `${memory.title} ${memory.themeTitle} ${memory.memoryDate} ${memory.sessionTitleSnapshot}`.toLowerCase(),
    content: memory.content,
  }));

  return [...memoryCandidates, ...sessionCandidates];
}

function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
  selectedMentions: MentionCandidate[],
) {
  const normalizedQuery = query.trim().toLowerCase();
  const selectedKeys = new Set(selectedMentions.map((item) => `${item.kind}:${item.id}`));

  return candidates.filter((candidate) => {
    if (selectedKeys.has(`${candidate.kind}:${candidate.id}`)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return candidate.searchText.includes(normalizedQuery);
  });
}

function createDisplayPrompt(prompt: string, mentions: MentionCandidate[], language: AppLanguage) {
  if (mentions.length === 0) {
    return prompt;
  }

  const isZh = language === "zh";
  const labels = mentions.map((mention) => `@${mention.label}`).join(" ");
  return isZh ? `引用上下文：${labels}\n\n${prompt}` : `Referenced context: ${labels}\n\n${prompt}`;
}

async function buildPromptWithMentions(
  prompt: string,
  mentions: MentionCandidate[],
  language: AppLanguage,
  activeSession: Session,
  loadSessionDetail: (sessionId: string) => Promise<LoadedSessionDetail>,
) {
  if (mentions.length === 0) {
    return prompt;
  }

  const isZh = language === "zh";
  const blocks = await Promise.all(
    mentions.map(async (mention, index) => {
      if (mention.kind === "memory") {
        return null;
      }

      const session =
        mention.sessionId === activeSession.id
          ? activeSession
          : (await loadSessionDetail(mention.sessionId)).item;
      const header = isZh ? `引用会话 ${index + 1}` : `Referenced Session ${index + 1}`;
      return `${header}\n${serializeSessionReference(session, language)}`;
    }),
  );

  const memoryBlocks = mentions
    .filter((mention) => mention.kind === "memory")
    .map((mention, index) => {
      const header = isZh ? `引用记忆内容 ${index + 1}` : `Referenced Memory Content ${index + 1}`;
      return `${header}\n${mention.label}\n${mention.detail}\n${mention.content ?? ""}`.trimEnd();
    });

  const contextHeader = isZh
    ? "以下是用户显式引用的上下文，请将其作为辅助背景，不要覆盖当前用户指令。"
    : "The following context was explicitly referenced by the user. Use it as supporting context and do not override the current user request.";
  const requestHeader = isZh ? "当前用户请求" : "Current user request";

  return [contextHeader, ...blocks.filter((item): item is string => Boolean(item)), ...memoryBlocks, `${requestHeader}\n${prompt}`].join("\n\n");
}

function serializeSessionReference(session: Session, language: AppLanguage) {
  const isZh = language === "zh";
  const titleLine = isZh ? `标题：${session.title}` : `Title: ${session.title}`;
  const turnLine = isZh ? `轮数：${session.turnCount}` : `Turns: ${session.turnCount}`;
  const header = isZh ? "最近消息：" : "Recent messages:";
  const messages = session.messages
    .slice(-12)
    .map((message, index) => `${index + 1}. ${message.role}: ${summarizeMessageContent(message.content, 280)}`);

  return [titleLine, turnLine, header, ...messages].join("\n");
}

function formatMentionSessionDetail(session: Session) {
  return `${session.turnCount} turns`;
}

function getSidePanelModeLabel(mode: WorkspaceSidePanelMode, messages: ReturnType<typeof getMessages>) {
  if (mode === "files") {
    return messages.workspace.filesTitle;
  }

  if (mode === "summary") {
    return messages.workspace.summaryTab;
  }

  if (mode === "automation") {
    return messages.workspace.automationTab;
  }

  return messages.workspace.actionsTab;
}

function getMessageRoleLabel(role: Message["role"], messages: ReturnType<typeof getMessages>) {
  const isZh = messages.nav.workspace === "工作区";

  if (role === "user") {
    return isZh ? "用户" : "user";
  }

  if (role === "assistant") {
    return isZh ? "助手" : "assistant";
  }

  return role === "system" ? (isZh ? "系统" : "system") : role;
}
