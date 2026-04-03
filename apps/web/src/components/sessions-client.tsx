"use client";

import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { FileTreeNode, Session, Workspace } from "@relay/shared-types";
import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";
import { getFilePreview, getFileTree, getSession, listSessions, listWorkspaces, openWorkspace, selectSession } from "@/lib/api/bridge";
import type { FilePreview } from "@/lib/api/bridge";
import { renderMarkdown } from "@/lib/markdown";

type SessionsClientProps = {
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

export function SessionsClient({ language }: SessionsClientProps) {
  const messages = getMessages(language);
  const bridgeOfflineMessage = messages.workspace.bridgeOffline;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleFileTree = useMemo(
    () => buildVisibleFileTree(fileTree, collapsedFolders),
    [fileTree, collapsedFolders],
  );

  const loadFileTree = useCallback(async () => {
    const treeResponse = await getFileTree();
    setFileTree(treeResponse.item);
    setCollapsedFolders(createInitialCollapsedFolders(treeResponse.item));
  }, []);

  const ensureSessionWorkspaceActive = useCallback(
    async (session: Session, knownWorkspaces: Workspace[]) => {
      const sessionWorkspace = knownWorkspaces.find((workspace) => workspace.id === session.workspaceId);
      if (!sessionWorkspace) {
        return;
      }

      if (!sessionWorkspace.isActive) {
        await openWorkspace(sessionWorkspace.localPath);
        setWorkspaces((current) =>
          current.map((workspace) => ({
            ...workspace,
            isActive: workspace.id === sessionWorkspace.id,
          })),
        );
      }

      await loadFileTree();
    },
    [loadFileTree],
  );

  const loadSessionDetail = useCallback(
    async (sessionId: string, knownWorkspaces: Workspace[]) => {
      const detail = await getSession(sessionId);
      const nextSession = detail.item;
      await ensureSessionWorkspaceActive(nextSession, knownWorkspaces);
      setActiveSession(nextSession);
      setActiveSessionId(nextSession.id);
      return nextSession;
    },
    [ensureSessionWorkspaceActive],
  );

  const refreshSessionsPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [workspaceData, sessionData] = await Promise.all([listWorkspaces(), listSessions()]);
      setWorkspaces(workspaceData.items);
      setSessions(sessionData.items);

      if (sessionData.items.length === 0) {
        setActiveSession(null);
        setActiveSessionId(null);
        setFileTree(null);
        setPreview(null);
        return;
      }

      const targetSessionId = activeSessionId ?? sessionData.preferredSessionId ?? sessionData.items[0]?.id ?? null;
      if (!targetSessionId) {
        return;
      }

      await loadSessionDetail(targetSessionId, workspaceData.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : bridgeOfflineMessage);
      setWorkspaces([]);
      setSessions([]);
      setActiveSession(null);
      setActiveSessionId(null);
      setFileTree(null);
      setPreview(null);
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId, bridgeOfflineMessage, loadSessionDetail]);

  useEffect(() => {
    void refreshSessionsPage();
  }, [refreshSessionsPage]);

  async function handleSelectSession(sessionId: string) {
    if (sessionId === activeSessionId) {
      return;
    }

    try {
      setError(null);
      setPreview(null);
      void selectSession(sessionId);
      await loadSessionDetail(sessionId, workspaces);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : bridgeOfflineMessage);
    }
  }

  async function openLinkedFile(filePath: string) {
    try {
      setError(null);
      setIsPreviewLoading(true);
      expandFileAncestors(filePath, setCollapsedFolders);
      const previewResponse = await getFilePreview(filePath);
      setPreview(previewResponse.item);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : bridgeOfflineMessage);
    } finally {
      setIsPreviewLoading(false);
    }
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

    await openLinkedFile(node.path);
  }

  function handleMessageLinkClick(event: MouseEvent<HTMLElement>) {
    const link = (event.target as HTMLElement | null)?.closest("a[data-file-link='true']");
    if (!link) {
      return;
    }

    event.preventDefault();
    const filePath = link.getAttribute("data-file-path");
    if (!filePath) {
      return;
    }

    void openLinkedFile(filePath);
  }

  return (
    <section className="sessions-shell">
      <aside className="panel panel-left sessions-rail">
        {error ? <div className="workspace-empty">{error}</div> : null}
        {isLoading ? <div className="workspace-empty">{messages.workspace.loading}</div> : null}
        {!isLoading && sessions.length === 0 ? <div className="workspace-empty">{messages.workspace.noSession}</div> : null}
        {!isLoading && sessions.length > 0 ? (
          <section className="section-group">
            <div className="workspace-group-head">
              <h2 className="section-title">{workspaces.find((workspace) => workspace.isActive)?.name ?? "sessions"}</h2>
              <span className="workspace-branch">
                {workspaces.find((workspace) => workspace.isActive)?.branch ?? "active workspace"}
              </span>
            </div>
            <div className="session-list">
              {sessions.map((session) => (
                <article
                  className={`session-item ${activeSessionId === session.id ? "session-item-active" : ""}`}
                  key={session.id}
                >
                  <button className="session-row session-main-button" onClick={() => void handleSelectSession(session.id)} type="button">
                    <h3>{truncateSessionTitle(session.title)}</h3>
                    <span className="session-rail-time">{formatRelativeSessionTime(session.updatedAt)}</span>
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </aside>

      <section className="panel panel-center sessions-thread-panel">
        {activeSession ? (
          <>
            <div className="sessions-header">
              <div className="sessions-header-top">
                <span className="eyebrow">{messages.sessions.headerEyebrow}</span>
                <span className="sessions-header-meta">
                  {workspaces.find((workspace) => workspace.id === activeSession.workspaceId)?.localPath ?? activeSession.workspaceId}
                </span>
              </div>
              <h1 className="sessions-header-title">{activeSession.title}</h1>
            </div>

            <div className="session-thread">
              {activeSession.messages.length === 0 ? <div className="workspace-empty">{messages.workspace.noMessages}</div> : null}
              {activeSession.messages.map((message) => (
                <article className={`thread-item thread-item-${message.role}`} key={message.id}>
                  <div className="thread-role">{message.role}</div>
                  <div
                    className="thread-item-body"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                    onClick={handleMessageLinkClick}
                  />
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="workspace-empty">{messages.workspace.noSession}</div>
        )}
      </section>

      <aside className="panel panel-right sessions-memory-panel">
        <div className="panel-head">
          <div className="sessions-memory-head">
            <span className="eyebrow">{messages.sessions.memoryCopilot}</span>
          </div>
        </div>

        <section className="memory-panel">
          <div className="memory-chat-list">
            <article className="memory-chat-item memory-chat-item-assistant">
              <div className="memory-chat-role">default shortcut</div>
              <p>
                请按照时间线梳理 session 中的对话摘要，保留必要细节，尤其要写清楚涉及到的具体文件。请记录用户做出的决策及其理由，但理由只有在用户明确说出时才记录；如果用户没有明确说明，不要推断。核心关注用户在对话过程中究竟关注什么、不关注什么，并把这些点清楚记录下来。
              </p>
            </article>
          </div>

          <div className="sessions-files-panel">
            <div className="workspace-files-panel-head">
              <span className="eyebrow">{messages.workspace.filesTitle}</span>
            </div>

            <div className="file-tree">
              {fileTree ? (
                visibleFileTree.map((node) => (
                  <button
                    className={`file-row ${node.kind === "folder" ? "file-row-folder" : "file-row-file"} ${preview?.path === node.path ? "file-row-active" : ""}`}
                    key={node.id}
                    onClick={() => void handleSelectFileTreeNode(node)}
                    style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
                    type="button"
                  >
                    <span className="file-row-main">
                      <span className="file-row-label">
                        <span className="file-row-chevron">
                          {node.kind === "folder" ? (node.isExpanded ? "▾" : "▸") : "·"}
                        </span>
                        <span className={`file-row-icon ${node.kind === "folder" ? "file-row-icon-folder" : "file-row-icon-file"}`}>
                          {node.kind === "folder" ? "⊟" : "—"}
                        </span>
                        <span>{node.name}</span>
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="workspace-empty">no file tree</div>
              )}
            </div>

            <div className="sessions-file-preview">
              {isPreviewLoading ? <div className="workspace-empty">loading preview...</div> : null}
              {!isPreviewLoading && preview ? (
                <>
                  <div className="file-preview-head sessions-file-preview-head">
                    <div className="file-preview-meta">
                      <span className="eyebrow">{preview.name}</span>
                    </div>
                  </div>
                  <div className="file-preview-body sessions-file-preview-body" onClick={handleMessageLinkClick}>
                    {preview.extension === ".md" ? (
                      <div
                        className="file-preview-markdown"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(preview.content) }}
                      />
                    ) : (
                      <pre className="file-preview-pre">{preview.content}</pre>
                    )}
                  </div>
                </>
              ) : null}
              {!isPreviewLoading && !preview ? <div className="workspace-empty">click a file link to preview it here</div> : null}
            </div>
          </div>
        </section>
      </aside>
    </section>
  );
}

function buildVisibleFileTree(node: FileTreeNode | null, collapsedFolders: Set<string>, depth = 0): VisibleFileTreeNode[] {
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


function formatRelativeSessionTime(timestamp: string) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d ago`;
}

function truncateSessionTitle(value: string, maxLength = 10) {
  const characters = Array.from(value);

  if (characters.length <= maxLength) {
    return value;
  }

  return `${characters.slice(0, maxLength).join("")}...`;
}
