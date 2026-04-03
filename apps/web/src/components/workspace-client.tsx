"use client";

import { type Dispatch, type MouseEvent, type SetStateAction, useCallback, useEffect, useRef, useState, useTransition } from "react";

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

type WorkspaceClientProps = {
  language: AppLanguage;
};

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

export function WorkspaceClient({ language }: WorkspaceClientProps) {
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
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [isFilesPanelCollapsed, setIsFilesPanelCollapsed] = useState(false);
  const [archiveCandidate, setArchiveCandidate] = useState<Session | null>(null);
  const [renameCandidate, setRenameCandidate] = useState<Session | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [sessionContextMenu, setSessionContextMenu] = useState<SessionContextMenuState | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRunning, startRunTransition] = useTransition();
  const currentMessageRef = useRef<HTMLElement | null>(null);
  const leftPanelRef = useRef<HTMLElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowCurrentRunRef = useRef(false);
  const sessionCacheRef = useRef(new Map<string, Session>());
  const pendingSessionRequestsRef = useRef(new Map<string, Promise<Session>>());
  const activeSessionIdRef = useRef<string | null>(null);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    const cachedSession = sessionCacheRef.current.get(sessionId);
    if (cachedSession) {
      return cachedSession;
    }

    const pendingRequest = pendingSessionRequestsRef.current.get(sessionId);
    if (pendingRequest) {
      return pendingRequest;
    }

    const request = getSession(sessionId)
      .then((sessionDetail) => {
        cacheSessionDetail(sessionCacheRef.current, sessionDetail.item);
        return sessionDetail.item;
      })
      .finally(() => {
        pendingSessionRequestsRef.current.delete(sessionId);
      });

    pendingSessionRequestsRef.current.set(sessionId, request);
    return request;
  }, []);

  const refreshWorkspaceData = useCallback(async (nextSessionId?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const [workspaceData, sessionData] = await Promise.all([listWorkspaces(), listSessions()]);
      const currentWorkspace = workspaceData.active;

      setWorkspaces(workspaceData.items);
      setSessions(sessionData.items);

      if (currentWorkspace) {
        const treeData = await getFileTree();
        setFileTree(treeData.item);
        setCollapsedFolders(createInitialCollapsedFolders(treeData.item));
      } else {
        setFileTree(null);
        setPreview(null);
      }

      const targetSessionId = nextSessionId ?? sessionData.preferredSessionId ?? sessionData.items[0]?.id;
      setActiveSessionId(targetSessionId ?? null);
      activeSessionIdRef.current = targetSessionId ?? null;

      if (targetSessionId) {
        const sessionDetail = await loadSessionDetail(targetSessionId);
        setActiveSession(sessionDetail);

        const preloadSessionIds = sessionData.items
          .map((session) => session.id)
          .filter((sessionId) => sessionId !== targetSessionId);

        void Promise.allSettled(preloadSessionIds.map((sessionId) => loadSessionDetail(sessionId)));
      } else {
        setActiveSession(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : bridgeOfflineMessage);
      setWorkspaces([]);
      setSessions([]);
      setActiveSessionId(null);
      setActiveSession(null);
      setFileTree(null);
    } finally {
      setIsLoading(false);
    }
  }, [bridgeOfflineMessage, loadSessionDetail]);

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

  async function handleSelectSession(sessionId: string) {
    if (activeSessionIdRef.current === sessionId) {
      return;
    }

    try {
      setError(null);
      setActiveSessionId(sessionId);
      activeSessionIdRef.current = sessionId;
      void selectSession(sessionId);
      const cachedSession = sessionCacheRef.current.get(sessionId);

      if (cachedSession) {
        setActiveSession(cachedSession);
        scrollTimelineToLatest();
        return;
      }

      const sessionDetail = await loadSessionDetail(sessionId);
      if (activeSessionIdRef.current === sessionId) {
        setActiveSession(sessionDetail);
        scrollTimelineToLatest();
      }
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : bridgeOfflineMessage);
    }
  }

  function handlePrefetchSession(sessionId: string) {
    if (sessionCacheRef.current.has(sessionId) || pendingSessionRequestsRef.current.has(sessionId)) {
      return;
    }

    void loadSessionDetail(sessionId);
  }

  async function handleSelectFileTreeNode(node: VisibleFileTreeNode) {
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

  async function handleOpenLinkedFile(filePath: string) {
    try {
      setError(null);
      setIsFilesPanelCollapsed(false);
      expandFileAncestors(filePath, setCollapsedFolders);
      setIsPreviewLoading(true);
      const response = await getFilePreview(filePath);
      setPreview(response.item);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : bridgeOfflineMessage);
    } finally {
      setIsPreviewLoading(false);
    }
  }

  function handleMarkdownLinkClick(event: MouseEvent<HTMLElement>) {
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
  }

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

  return (
    <section className={`shell workspace-shell ${isFilesPanelCollapsed ? "workspace-shell-files-collapsed" : ""}`}>
      <aside className="panel panel-left" ref={leftPanelRef}>
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
                {sessions
                  .filter((session) => session.workspaceId === workspace.id)
                  .map((session) => (
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
                {sessions.filter((session) => session.workspaceId === workspace.id).length === 0 ? (
                  <div className="workspace-empty workspace-empty-compact">{messages.workspace.noSession}</div>
                ) : null}
              </div>
            </section>
          ))
        )}
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
          {!error && activeSession?.messages.length === 0 ? (
            <div className="workspace-empty">{messages.workspace.noMessages}</div>
          ) : null}
          {activeSession?.messages.map((item, index, items) => (
            <article
              className={`workspace-log-item workspace-log-item-${item.role}`}
              key={item.id}
              ref={index === items.length - 1 ? currentMessageRef : null}
            >
              <div className="workspace-log-top">
                <span className="workspace-log-label">{item.role}</span>
                <span className="workspace-log-detail">{formatMessageTime(item.createdAt)}</span>
              </div>
              <div
                className="workspace-log-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }}
                onClick={handleMarkdownLinkClick}
              />
            </article>
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

      {isFilesPanelCollapsed ? (
        <button
          className="workspace-files-rail"
          onClick={() => setIsFilesPanelCollapsed(false)}
          type="button"
        >
          <span className="workspace-files-rail-arrow" aria-hidden="true">‹</span>
          <span className="workspace-files-rail-label">{messages.workspace.filesTitle}</span>
        </button>
      ) : (
        <aside className="panel panel-right workspace-files-panel">
          <div className="panel-head workspace-files-panel-head">
            <span className="eyebrow">{messages.workspace.filesTitle}</span>
            <button
              className="workspace-files-panel-toggle"
              onClick={() => setIsFilesPanelCollapsed(true)}
              type="button"
            >
              collapse
            </button>
          </div>

          <div className="file-tree">
            {buildVisibleFileTree(fileTree, collapsedFolders).map((node) => (
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
                    finder
                  </button>
                </span>
              </div>
            ))}
          </div>

          <aside className={`file-preview-drawer ${preview ? "file-preview-drawer-open" : ""}`}>
            <div className="file-preview-head">
              <div className="file-preview-meta">
                <span className="eyebrow">{preview?.name ?? "preview"}</span>
              </div>
              <button className="file-preview-close" onClick={() => setPreview(null)} type="button">
                close
              </button>
            </div>

            <div className="file-preview-body">
              {isPreviewLoading ? <div className="workspace-empty">loading preview...</div> : null}
              {!isPreviewLoading && preview ? (
                preview.extension === ".md" ? (
                  <div
                    className="file-preview-markdown"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(preview.content) }}
                    onClick={handleMarkdownLinkClick}
                  />
                ) : (
                  <pre className="file-preview-pre">{preview.content}</pre>
                )
              ) : null}
            </div>
          </aside>
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
              rename
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
              <span className="eyebrow">rename session</span>
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
                {isRenaming ? messages.workspace.loading : "rename"}
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

function renderMarkdown(markdown: string) {
  const escaped = escapeHtml(markdown);
  const codeBlocks: string[] = [];

  let html = escaped.replace(/```([\s\S]*?)```/g, (_match, code) => {
    const token = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return token;
  });

  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label, href) =>
      `<a class="thread-link" data-file-link="true" data-file-path="${escapeHtmlAttribute(normalizeLinkedFilePath(href))}" href="${escapeHtmlAttribute(href)}">${label}</a>`,
  );
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^(?:-|\*) (.*)$/gm, "<li>$1</li>");
  html = html.replace(/^\d+\. (.*)$/gm, "<li data-ordered=\"true\">$1</li>");

  const blocks = html.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  html = blocks
    .map((block) => {
      if (block.startsWith("__CODE_BLOCK_")) {
        return block;
      }

      if (block.startsWith("<h1>") || block.startsWith("<h2>") || block.startsWith("<h3>")) {
        return block;
      }

      if (block.includes("<li")) {
        const isOrdered = block.includes('data-ordered="true"');
        const normalizedList = block.replace(/ data-ordered="true"/g, "");
        return isOrdered ? `<ol>${normalizedList}</ol>` : `<ul>${normalizedList}</ul>`;
      }

      return `<p>${block.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");

  codeBlocks.forEach((codeBlock, index) => {
    html = html.replace(`__CODE_BLOCK_${index}__`, codeBlock);
  });

  return html;
}

function normalizeLinkedFilePath(rawHref: string) {
  return rawHref.replace(/#L\d+(C\d+)?$/i, "").replace(/:\d+(?::\d+)?$/i, "");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value);
}

function truncateSessionTitle(value: string, maxLength = 10) {
  const characters = Array.from(value);

  if (characters.length <= maxLength) {
    return value;
  }

  return `${characters.slice(0, maxLength).join("")}...`;
}
