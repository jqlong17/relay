"use client";

import {
  type CSSProperties,
  forwardRef,
  memo,
  type Dispatch,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import type { FileTreeNode, Message, MessageStatus, RuntimeEvent, Session, Workspace } from "@relay/shared-types";
import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";
import {
  archiveSession,
  createSession,
  getFilePreview,
  getFileTree,
  getSession,
  listSessions,
  openInFinder,
  openWorkspace,
  listWorkspaces,
  openWorkspacePicker,
  renameSession,
  removeWorkspace,
  runSessionStream,
  selectSession,
} from "@/lib/api/bridge";
import type { FilePreview } from "@/lib/api/bridge";
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
};

type SessionContextMenuState = {
  left: number;
  session: Session;
  top: number;
};

type LoadedSessionDetail = Awaited<ReturnType<typeof getSession>>;

type WorkspaceSidePanelMode = "files" | "summary" | "actions";

type WorkspaceResizeHandle = "left" | "right" | "sidepanel";

type WorkspaceLayoutWidths = {
  left: number | null;
  right: number | null;
  sidepanelPrimary: number | null;
};

type CssVariableStyle = CSSProperties & Record<string, string>;

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
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [isActiveSessionLoading, setIsActiveSessionLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<WorkspaceSidePanelMode>("summary");
  const [archiveCandidate, setArchiveCandidate] = useState<Session | null>(null);
  const [renameCandidate, setRenameCandidate] = useState<Session | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [sessionContextMenu, setSessionContextMenu] = useState<SessionContextMenuState | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRunning, startRunTransition] = useTransition();
  const [isSwitchingSession, startSessionSwitchTransition] = useTransition();
  const [layoutWidths, setLayoutWidths] = useState<WorkspaceLayoutWidths>({
    left: null,
    right: null,
    sidepanelPrimary: null,
  });
  const currentMessageRef = useRef<HTMLElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const leftPanelRef = useRef<HTMLElement | null>(null);
  const rightPanelRef = useRef<HTMLElement | null>(null);
  const sidepanelFilesBodyRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowCurrentRunRef = useRef(false);
  const sessionCacheRef = useRef(new Map<string, Session>());
  const pendingSessionRequestsRef = useRef(new Map<string, Promise<LoadedSessionDetail>>());
  const activeSessionIdRef = useRef<string | null>(null);
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
  const timelineSummaryItems = useMemo(
    () => createTimelineSummaryItems(activeSession),
    [activeSession],
  );
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

  const refreshWorkspaceData = useCallback(async (nextSessionId?: string) => {
    setIsLoading(true);
    setIsSessionsLoading(true);
    setError(null);

    const workspacePromise = listWorkspaces();
    const sessionsPromise = listSessions();

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

      const targetSessionId = nextSessionId ?? sessionData.preferredSessionId ?? sessionData.items[0]?.id;
      setActiveSessionId(targetSessionId ?? null);
      activeSessionIdRef.current = targetSessionId ?? null;

      if (targetSessionId) {
        setIsActiveSessionLoading(true);
        const sessionDetail = await loadSessionDetail(targetSessionId);
        setActiveSession(sessionDetail.item);
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
      setFileTree(null);
      setIsSessionsLoading(false);
      setIsActiveSessionLoading(false);
    } finally {
      setIsLoading(false);
    }
  }, [bridgeOfflineMessage, loadSessionDetail, refreshSessionDetailInBackground, refreshSessionListInBackground]);

  useEffect(() => {
    void refreshWorkspaceData();
  }, [refreshWorkspaceData, language]);

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
      await openWorkspace(workspace.localPath);
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
        setIsActiveSessionLoading(false);
        scrollTimelineToLatest();
        return;
      }

      const sessionDetail = await loadSessionDetail(sessionId);
      if (sessionSelectionRequestIdRef.current === requestId && activeSessionIdRef.current === sessionId) {
        startSessionSwitchTransition(() => {
          setActiveSession(sessionDetail.item);
        });
        setIsActiveSessionLoading(false);
        scrollTimelineToLatest();
      }

      if (sessionDetail.source === "snapshot") {
        void refreshSessionDetailInBackground(sessionId);
      }
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : bridgeOfflineMessage);
      setIsActiveSessionLoading(false);
    }
  }, [bridgeOfflineMessage, loadSessionDetail, refreshSessionDetailInBackground, startSessionSwitchTransition]);

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
    const link = (event.target as HTMLElement | null)?.closest("a[data-file-link='true']");
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
        return;
      }

      const cachedSession = sessionCacheRef.current.get(nextActiveSessionId);
      if (cachedSession) {
        setActiveSession(cachedSession);
        return;
      }

      const sessionDetail = await getSession(nextActiveSessionId);
      cacheSessionDetail(sessionCacheRef.current, sessionDetail.item);
      setActiveSession(sessionDetail.item);
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
    if (!activeSession || !composerValue.trim()) {
      return;
    }

    const prompt = composerValue.trim();
    const originalSessionId = activeSession.id;
    let materializedSessionId = originalSessionId;
    setComposerValue("");
    shouldFollowCurrentRunRef.current = true;

    startRunTransition(() => {
      void (async () => {
        try {
          setError(null);
          const userMessage = createOptimisticMessage(activeSession.id, "user", prompt, activeSession.messages.length + 1);
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

          await runSessionStream(originalSessionId, prompt, (event) => {
            if (event.type === "run.started" && event.sessionId !== materializedSessionId) {
              materializedSessionId = event.sessionId;
              setActiveSessionId(event.sessionId);
              activeSessionIdRef.current = event.sessionId;
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
    currentMessageRef.current?.scrollIntoView({
      behavior,
      block: "nearest",
    });
  }

  function scrollTimelineToLatest() {
    requestAnimationFrame(() => {
      currentMessageRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    });
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
          <span className="eyebrow">{messages.workspace.eyebrow}</span>
          <button className="workspace-header-link" onClick={() => scrollToCurrentMessage("smooth")} type="button">
            {messages.workspace.latestMessage}
          </button>
        </div>

        <div className="workspace-log workspace-timeline" ref={timelineRef}>
          {error ? <div className="workspace-empty">{error}</div> : null}
          {!error && isSwitchingSession ? <div className="workspace-empty">{messages.workspace.loading}</div> : null}
          {!error && isActiveSessionLoading && !isSwitchingSession ? (
            <div className="workspace-empty">{messages.workspace.loading}</div>
          ) : null}
          {!error && activeSession?.messages.length === 0 ? (
            <div className="workspace-empty">{messages.workspace.noMessages}</div>
          ) : null}
          {activeSession?.messages.map((item, index, items) => (
            <TimelineMessage
              isCurrent={index === items.length - 1}
              key={item.id}
              message={item}
              onLinkClick={handleMarkdownLinkClick}
              ref={index === items.length - 1 ? currentMessageRef : null}
            />
          ))}
        </div>

        <div className="composer">
          <div className="composer-prompt">relay &gt;</div>
          <input
            className="composer-input composer-input-field"
            onChange={(event) => setComposerValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                void handleRun();
              }
            }}
            placeholder={messages.workspace.composer}
            value={composerValue}
          />
          <button className="composer-send" disabled={!activeSession || isRunning} onClick={() => void handleRun()} type="button">
            {isRunning ? messages.workspace.loading : messages.common.run}
          </button>
        </div>
      </section>

      {isSidePanelCollapsed ? (
        <button
          className="workspace-sidepanel-rail"
          onClick={() => setIsSidePanelCollapsed(false)}
          type="button"
        >
          <span className="workspace-sidepanel-rail-arrow" aria-hidden="true">‹</span>
          <span className="workspace-sidepanel-rail-label">{messages.workspace.contextTitle}</span>
        </button>
      ) : (
        <aside className="panel panel-right workspace-sidepanel" ref={rightPanelRef}>
          <button
            aria-label="Resize right panel"
            className="workspace-resizer workspace-resizer-right"
            onPointerDown={(event) => handleResizeStart("right", event)}
            type="button"
          />
          <div className="panel-head workspace-sidepanel-head">
            <div className="workspace-sidepanel-head-meta">
              <span className="eyebrow">{messages.workspace.contextTitle}</span>
              <span className="workspace-sidepanel-head-detail">
                {getSidePanelModeLabel(sidePanelMode, messages)}
              </span>
            </div>
            <button
              className="workspace-sidepanel-toggle"
              onClick={() => setIsSidePanelCollapsed(true)}
              type="button"
            >
              {messages.workspace.collapse}
            </button>
          </div>

          <div className="workspace-sidepanel-tabs" role="tablist" aria-label={messages.workspace.sidePanelAriaLabel}>
            {(["summary", "files", "actions"] as WorkspaceSidePanelMode[]).map((mode) => (
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
                  <span className="eyebrow">{messages.workspace.linkedFiles}</span>
                  <span className="workspace-sidepanel-subhead-detail">{linkedFiles.length}</span>
                </div>
                {linkedFiles.length > 0 ? (
                  <div className="workspace-summary-list">
                    {linkedFiles.map((filePath) => (
                      <button
                        className="workspace-summary-link"
                        key={filePath}
                        onClick={() => void handleOpenLinkedFile(filePath)}
                        type="button"
                      >
                        {filePath}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="workspace-sidepanel-empty">
                    <p>{messages.workspace.noLinkedFiles}</p>
                  </div>
                )}
              </section>

              <section className="workspace-sidepanel-section">
                <div className="workspace-sidepanel-subhead">
                  <span className="eyebrow">{messages.workspace.timelineLabel}</span>
                  <span className="workspace-sidepanel-subhead-detail">{timelineSummaryItems.length}</span>
                </div>
                {timelineSummaryItems.length > 0 ? (
                  <div className="workspace-summary-timeline">
                    {timelineSummaryItems.map((item) => (
                      <article className="workspace-summary-timeline-item" key={item.id}>
                        <div className="workspace-summary-timeline-top">
                          <span>{getMessageRoleLabel(item.role, messages)}</span>
                          <span>{item.time}</span>
                        </div>
                        <p>{item.content}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="workspace-sidepanel-empty">
                    <p>{messages.workspace.noTimeline}</p>
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
                        setSidePanelMode("summary");
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

function createOptimisticMessage(
  sessionId: string,
  role: Message["role"],
  content: string,
  sequence: number,
  status: MessageStatus = "completed",
): Message {
  const now = new Date().toISOString();

  return {
    id: createClientMessageId(role),
    sessionId,
    role,
    content,
    status,
    sequence,
    createdAt: now,
    updatedAt: now,
  };
}

function createClientMessageId(role: Message["role"]) {
  return `client-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const TimelineMessage = memo(
  forwardRef<HTMLElement, TimelineMessageProps>(function TimelineMessage({ isCurrent, message, onLinkClick }, ref) {
    const html = useMemo(() => renderMarkdown(message.content), [message.content]);

    return (
      <article className={`workspace-log-item workspace-log-item-${message.role}`} ref={isCurrent ? ref : null}>
        <div className="workspace-log-top">
          <span className="workspace-log-label">{message.role}</span>
          <span className="workspace-log-detail">{formatMessageTime(message.createdAt)}</span>
        </div>
        <div className="workspace-log-content" dangerouslySetInnerHTML={{ __html: html }} onClick={onLinkClick} />
      </article>
    );
  }),
  (previous, next) =>
    previous.isCurrent === next.isCurrent &&
    previous.message === next.message &&
    previous.onLinkClick === next.onLinkClick,
);

type TimelineMessageProps = {
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

function applyStreamingEvent(session: Session | null, event: RuntimeEvent, assistantMessageId: string) {
  if (!session) {
    return session;
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
      message.id === assistantMessageId ? updateMessageStatus(message, "completed", event.createdAt) : message,
    );

    return {
      ...session,
      updatedAt: event.createdAt,
      messages,
    };
  }

  if (event.type === "run.failed") {
    const messages: Message[] = session.messages.map((message) =>
      message.id === assistantMessageId ? updateMessageStatus(message, "error", event.createdAt) : message,
    );

    return {
      ...session,
      updatedAt: event.createdAt,
      messages,
    };
  }

  return session;
}

function markStreamingMessageErrored(session: Session | null) {
  if (!session) {
    return session;
  }

  const messages: Message[] = session.messages.map((message) =>
    message.role === "assistant" && message.status === "streaming" ? updateMessageStatus(message, "error") : message,
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

function buildVisibleFileTree(
  node: FileTreeNode | null,
  collapsedFolders: Set<string>,
  depth = 0,
): VisibleFileTreeNode[] {
  if (!node) {
    return [];
  }

  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isExpanded = node.kind === "folder" && !collapsedFolders.has(node.path);
  const current: VisibleFileTreeNode = {
    id: node.id,
    name: node.name,
    kind: node.kind,
    depth,
    path: node.path,
    isExpanded,
    hasChildren,
  };

  if (node.kind !== "folder" || !isExpanded || !hasChildren) {
    return [current];
  }

  return [
    current,
    ...(node.children?.flatMap((child) => buildVisibleFileTree(child, collapsedFolders, depth + 1)) ?? []),
  ];
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

function truncateSessionTitle(value: string, maxLength = 10) {
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

  return [
    {
      title: isZh ? "时间线摘要" : "timeline summary",
      description: isZh
        ? "按时间线梳理对话摘要，保留必要细节和具体文件。"
        : "Summarize the conversation as a timeline with concrete details and files.",
      prompt: isZh
        ? `请按照时间线梳理这个 session 的对话摘要，保留必要细节，涉及具体文件时要写清楚。${sessionTitle}${referencedFiles}`.trim()
        : `Please summarize this session as a timeline, keeping the necessary details and naming specific files when relevant. ${sessionTitle}${referencedFiles}`.trim(),
    },
    {
      title: isZh ? "用户决策" : "user decisions",
      description: isZh
        ? "提取用户明确做出的决策和理由；若理由没明说就不要补。"
        : "Extract explicit user decisions and reasons without inventing missing rationale.",
      prompt: isZh
        ? `请提取这个 session 中用户明确做出的决策和理由。只有用户自己明确说出的理由才能保留；如果没说，就不要补。${sessionTitle}`.trim()
        : `Please extract the explicit decisions the user made in this session and the reasons they stated. Keep only reasons the user clearly said; if none were stated, do not invent them. ${sessionTitle}`.trim(),
    },
    {
      title: isZh ? "关注点地图" : "focus map",
      description: isZh
        ? "识别用户在过程中真正关注什么、不关注什么。"
        : "Identify what the user truly cared about and what they did not.",
      prompt: isZh
        ? `请总结这个 session 里用户真正关注什么、不关注什么，并用简洁列表说明。${sessionTitle}`.trim()
        : `Please summarize what the user truly cared about in this session, and what they did not care about, using a concise list. ${sessionTitle}`.trim(),
    },
  ];
}

function getSidePanelModeLabel(mode: WorkspaceSidePanelMode, messages: ReturnType<typeof getMessages>) {
  if (mode === "files") {
    return messages.workspace.filesTitle;
  }

  if (mode === "summary") {
    return messages.workspace.summaryTab;
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
