"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Session, TimelineMemory, Workspace } from "@relay/shared-types";
import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";
import { generateSessionMemory, getSession, getSessionMemories, listSessions, listWorkspaces, openWorkspace, selectSession } from "@/lib/api/bridge";
import { renderMarkdown } from "@/lib/markdown";

type SessionsClientProps = {
  language: AppLanguage;
};

export function SessionsClient({ language }: SessionsClientProps) {
  const messages = getMessages(language);
  const bridgeOfflineMessage = messages.workspace.bridgeOffline;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [sessionMemories, setSessionMemories] = useState<TimelineMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingSession, setIsSwitchingSession] = useState(false);
  const [isMemoriesLoading, setIsMemoriesLoading] = useState(false);
  const [isGeneratingMemory, setIsGeneratingMemory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const groupedMemories = useMemo(() => groupMemoriesByDate(sessionMemories), [sessionMemories]);

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
    },
    [],
  );

  const loadSessionMemories = useCallback(
    async (sessionId: string) => {
      setIsMemoriesLoading(true);
      try {
        const response = await getSessionMemories(sessionId);
        setSessionMemories(response.items);
      } catch (memoryError) {
        setError(memoryError instanceof Error ? memoryError.message : bridgeOfflineMessage);
        setSessionMemories([]);
      } finally {
        setIsMemoriesLoading(false);
      }
    },
    [bridgeOfflineMessage],
  );

  const loadSessionDetail = useCallback(
    async (sessionId: string, knownWorkspaces: Workspace[]) => {
      const detail = await getSession(sessionId);
      const nextSession = detail.item;
      await ensureSessionWorkspaceActive(nextSession, knownWorkspaces);
      setActiveSession(nextSession);
      setActiveSessionId(nextSession.id);
      activeSessionIdRef.current = nextSession.id;
      await loadSessionMemories(nextSession.id);
      return nextSession;
    },
    [ensureSessionWorkspaceActive, loadSessionMemories],
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
        setSessionMemories([]);
        return;
      }

      const targetSessionId = activeSessionIdRef.current ?? sessionData.preferredSessionId ?? sessionData.items[0]?.id ?? null;
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
      setSessionMemories([]);
    } finally {
      setIsLoading(false);
    }
  }, [bridgeOfflineMessage, loadSessionDetail]);

  useEffect(() => {
    void refreshSessionsPage();
  }, [refreshSessionsPage]);

  async function handleSelectSession(sessionId: string) {
    if (sessionId === activeSessionId) {
      return;
    }

    try {
      setError(null);
      setIsSwitchingSession(true);
      setActiveSessionId(sessionId);
      activeSessionIdRef.current = sessionId;
      void selectSession(sessionId);
      await loadSessionDetail(sessionId, workspaces);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : bridgeOfflineMessage);
    } finally {
      setIsSwitchingSession(false);
    }
  }

  async function handleGenerateMemory(force = false) {
    if (!activeSession) {
      return;
    }

    try {
      setError(null);
      setIsGeneratingMemory(true);
      await generateSessionMemory(activeSession.id, { force });
      await loadSessionMemories(activeSession.id);
    } catch (memoryError) {
      setError(memoryError instanceof Error ? memoryError.message : bridgeOfflineMessage);
    } finally {
      setIsGeneratingMemory(false);
    }
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
              <h1 className="sessions-header-title">
                {activeSession.title}
                {isSwitchingSession ? <span className="sessions-switching-indicator">loading</span> : null}
              </h1>
            </div>

            <div className="session-thread">
              {activeSession.messages.length === 0 ? <div className="workspace-empty">{messages.workspace.noMessages}</div> : null}
              {activeSession.messages.map((message) => (
                <article className={`thread-item thread-item-${message.role}`} key={message.id}>
                  <div className="thread-role">{message.role}</div>
                  <div
                    className="thread-item-body"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
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
            <div className="memory-automation-actions">
              <button disabled={!activeSession || isGeneratingMemory} onClick={() => void handleGenerateMemory(false)} type="button">
                {isGeneratingMemory ? messages.workspace.loading : messages.sessions.saveMemory}
              </button>
              <button disabled={!activeSession || isGeneratingMemory} onClick={() => void handleGenerateMemory(true)} type="button">
                {messages.sessions.regenerate}
              </button>
            </div>
          </div>
        </div>

        <section className="memory-panel">
          <div className="memory-chat-list">
            <article className="memory-chat-item memory-chat-item-assistant">
              <div className="memory-chat-role">theme</div>
              <p>{activeSession?.title ?? "current session"}</p>
            </article>
          </div>

          {isMemoriesLoading ? <div className="workspace-empty">{messages.workspace.loading}</div> : null}
          {!isMemoriesLoading && groupedMemories.length === 0 ? (
            <div className="workspace-empty">no timeline memories yet for this session</div>
          ) : null}
          {!isMemoriesLoading
            ? groupedMemories.map((group) => (
                <section className="detail-block" key={group.date}>
                  <h3>{group.date}</h3>
                  <div className="memory-day-list">
                    {group.items.map((memory) => (
                      <article className="memory-day-item" key={memory.id}>
                        <div className="memory-day-top">
                          <div className="memory-day-theme">{memory.themeTitle}</div>
                          <span>{`${memory.checkpointTurnCount} turns`}</span>
                        </div>
                        <h4>{memory.title}</h4>
                        <div
                          className="thread-item-body"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(memory.content) }}
                        />
                      </article>
                    ))}
                  </div>
                </section>
              ))
            : null}
        </section>
      </aside>
    </section>
  );
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
