"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import type {
  AutomationRule,
  GoalAutomationRule,
  GoalAutomationRuleInput,
  GoalAutomationRunRecord,
  Session,
  Workspace,
} from "@relay/shared-types";
import type { CodexAutomation, CodexAutomationInput, CodexAutomationRun } from "@/lib/codex-automations";
import {
  createCodexAutomation,
  deleteCodexAutomation,
  listCodexAutomations,
  listCodexAutomationRuns,
  runCodexAutomationNow,
  updateCodexAutomation,
} from "@/lib/api/codex-automations";
import {
  createGoalAutomationRule,
  deleteAutomationRule,
  listAutomations,
  listGoalAutomationRuns,
  listSessions,
  listWorkspaces,
  startAutomationRule,
  stopAutomationRule,
  updateGoalAutomationRule,
} from "@/lib/api/bridge";
import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";

type AutomationPageClientProps = {
  language: AppLanguage;
};

type CodexFormState = {
  name: string;
  prompt: string;
  status: "ACTIVE" | "PAUSED";
  cwd: string;
  scheduleKind: "hourly" | "weekly";
  intervalHours: number;
  byDays: string[];
  hour: number;
  minute: number;
};

type GoalFormState = {
  title: string;
  actionType: "continue-session" | "generate-timeline-memory";
  triggerKind: "manual" | "turn-interval";
  triggerTurnInterval: number;
  goal: string;
  acceptanceCriteria: string;
  status: "active" | "paused";
  workspaceId: string | null;
  targetSessionMode: "existing-session" | "new-session";
  targetSessionId: string;
  targetSessionTitle: string;
  maxTurns: number;
  maxDurationMinutes: number;
};

type FilterKey = "all" | "internal" | "codex" | "active" | "paused";
type CreateKind = "codex" | "goal-loop";

type AutomationRunViewItem = {
  id: string;
  automationId: string;
  source: "codex" | "internal";
  status: string;
  title: string | null;
  summary: string | null;
  output: string | null;
  prompt: string | null;
  sourceLabel: string;
  sourceContext: string | null;
  createdAt: number;
  updatedAt: number;
};

type AutomationListItemBase = {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED";
  filterStatus: "ACTIVE" | "PAUSED";
  statusLabel: string;
  scheduleLabel: string;
  description: string;
  sourceLabel: string;
  typeLabel: string;
  workspaceLabel: string;
  lastLabel: string;
  nextLabel: string;
  runtimeLabel: string | null;
  sessionLabel: string | null;
};

type AutomationListItem =
  | (AutomationListItemBase & {
      kind: "codex";
      raw: CodexAutomation;
    })
  | (AutomationListItemBase & {
      kind: "internal";
      raw: AutomationRule;
    });

const WEEK_DAYS = [
  { key: "MO", zh: "一", en: "Mon" },
  { key: "TU", zh: "二", en: "Tue" },
  { key: "WE", zh: "三", en: "Wed" },
  { key: "TH", zh: "四", en: "Thu" },
  { key: "FR", zh: "五", en: "Fri" },
  { key: "SA", zh: "六", en: "Sat" },
  { key: "SU", zh: "日", en: "Sun" },
];
const RUN_HISTORY_LIMIT = 10;
const DEFAULT_CWD = "/Users/ruska/project/web-cli";

export function AutomationPageClient({ language }: AutomationPageClientProps) {
  const messages = getMessages(language);
  const searchParams = useSearchParams();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const goalInputRef = useRef<HTMLTextAreaElement | null>(null);
  const prefillAppliedRef = useRef(false);
  const [items, setItems] = useState<AutomationListItem[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeWorkspacePath, setActiveWorkspacePath] = useState<string>(DEFAULT_CWD);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind>("codex");
  const [runHistory, setRunHistory] = useState<AutomationRunViewItem[]>([]);
  const [isRunHistoryLoading, setIsRunHistoryLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState<AutomationRunViewItem | null>(null);
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [isRunOutputExpanded, setIsRunOutputExpanded] = useState(false);
  const [copiedRunId, setCopiedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [codexForm, setCodexForm] = useState<CodexFormState>(() => createDefaultCodexForm(DEFAULT_CWD));
  const [goalForm, setGoalForm] = useState<GoalFormState>(() => createDefaultGoalForm(null));

  const filteredItems = useMemo(() => items.filter((item) => matchesFilter(item, activeFilter)), [items, activeFilter]);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const selectedCodexItem = selectedItem?.kind === "codex" ? selectedItem : null;
  const selectedInternalItem = selectedItem?.kind === "internal" ? selectedItem : null;
  const selectedGoalItem =
    selectedInternalItem?.raw.kind === "goal-loop" ? selectedInternalItem.raw : null;
  const codexItems = useMemo(
    () => filteredItems.filter((item): item is Extract<AutomationListItem, { kind: "codex" }> => item.kind === "codex"),
    [filteredItems],
  );
  const internalItems = useMemo(
    () => filteredItems.filter((item): item is Extract<AutomationListItem, { kind: "internal" }> => item.kind === "internal"),
    [filteredItems],
  );
  const goalRequiresExistingSession = requiresExistingGoalSession(goalForm.actionType, goalForm.triggerKind);
  const goalUsesTurnIntervalTrigger = goalForm.triggerKind === "turn-interval";
  const goalUsesContinueSessionAction = goalForm.actionType === "continue-session";

  async function refresh() {
    setIsLoading(true);
    setError(null);

    try {
      const [codexResponse, internalResponse, workspaceResponse, sessionResponse] = await Promise.all([
        listCodexAutomations(),
        listAutomations().catch(() => ({ items: [] as AutomationRule[] })),
        listWorkspaces().catch(() => ({ items: [] as Workspace[], active: null })),
        listSessions().catch(() => ({ items: [] as Session[], activeWorkspaceId: null })),
      ]);
      const workspaceLabels = new Map(
        workspaceResponse.items.map((workspace) => [workspace.id, workspace.name || workspace.localPath]),
      );
      const activeWorkspace =
        workspaceResponse.active ??
        workspaceResponse.items.find((workspace) => workspace.isActive) ??
        null;
      const nextItems = [
        ...internalResponse.items.map((item) => mapInternalRule(item, language, workspaceLabels)),
        ...codexResponse.items.map((item) => mapCodexAutomation(item, language)),
      ];

      setItems(nextItems);
      setWorkspaces(workspaceResponse.items);
      setSessions(sessionResponse.items);
      setActiveWorkspaceId(activeWorkspace?.id ?? sessionResponse.activeWorkspaceId ?? null);
      setActiveWorkspacePath(activeWorkspace?.localPath ?? DEFAULT_CWD);
      setCodexForm((current) => {
        if (current.cwd.trim()) {
          return current;
        }

        return {
          ...current,
          cwd: activeWorkspace?.localPath ?? DEFAULT_CWD,
        };
      });
      setGoalForm((current) => {
        if (current.workspaceId) {
          return current;
        }

        return {
          ...current,
          workspaceId: activeWorkspace?.id ?? sessionResponse.activeWorkspaceId ?? null,
        };
      });
      setSelectedId((current) => {
        if (current && nextItems.some((item) => item.id === current)) {
          return current;
        }

        return nextItems.find((item) => item.kind === "codex")?.id ?? nextItems[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load automations");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (isCreateMode) {
      return;
    }

    if (filteredItems.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !filteredItems.some((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? null);
    }
  }, [filteredItems, isCreateMode, selectedId]);

  useEffect(() => {
    if (!isCreateMode) {
      return;
    }

    if (createKind === "goal-loop") {
      goalInputRef.current?.focus();
      return;
    }

    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [createKind, isCreateMode]);

  useEffect(() => {
    if (isCreateMode || !selectedItem) {
      return;
    }

    if (selectedItem.kind === "codex") {
      setCodexForm(fromCodexAutomation(selectedItem.raw));
      return;
    }

    if (selectedItem.raw.kind === "goal-loop") {
      setGoalForm(fromGoalAutomation(selectedItem.raw, activeWorkspaceId));
    }
  }, [activeWorkspaceId, isCreateMode, selectedItem]);

  useEffect(() => {
    const firstSession = sessions[0] ?? null;
    const selectedSession = sessions.find((item) => item.id === goalForm.targetSessionId) ?? firstSession;

    if (goalRequiresExistingSession && goalForm.targetSessionMode !== "existing-session") {
      setGoalForm((current) => ({
        ...current,
        targetSessionMode: "existing-session",
        targetSessionId: selectedSession?.id ?? "",
        targetSessionTitle: selectedSession?.title ?? current.targetSessionTitle,
      }));
      return;
    }

    if (goalForm.targetSessionMode !== "existing-session") {
      return;
    }

    if (!goalForm.targetSessionId && selectedSession) {
      setGoalForm((current) => ({
        ...current,
        targetSessionId: selectedSession.id,
        targetSessionTitle: selectedSession.title,
      }));
      return;
    }

    if (goalForm.targetSessionId && !sessions.some((item) => item.id === goalForm.targetSessionId)) {
      setGoalForm((current) => ({
        ...current,
        targetSessionId: selectedSession?.id ?? "",
        targetSessionTitle: selectedSession?.title ?? current.targetSessionTitle,
      }));
    }
  }, [
    goalForm.actionType,
    goalForm.targetSessionId,
    goalForm.targetSessionMode,
    goalForm.triggerKind,
    goalRequiresExistingSession,
    sessions,
  ]);

  useEffect(() => {
    if (prefillAppliedRef.current) {
      return;
    }

    if (items.length === 0 && sessions.length === 0) {
      return;
    }

    const mode = searchParams.get("mode");
    if (mode !== "create-goal") {
      prefillAppliedRef.current = true;
      return;
    }

    const sessionId = searchParams.get("sessionId")?.trim() || "";
    const sessionTitle =
      searchParams.get("sessionTitle")?.trim() ||
      sessions.find((item) => item.id === sessionId)?.title ||
      "";

    prefillAppliedRef.current = true;
    setCreateKind("goal-loop");
    setIsCreateMode(true);
    setSelectedId(null);
    setGoalForm((current) => ({
      ...current,
      workspaceId: activeWorkspaceId,
      title: sessionTitle ? `${sessionTitle} 目标自动推进` : current.title,
      targetSessionMode: sessionId ? "existing-session" : current.targetSessionMode,
      targetSessionId: sessionId || current.targetSessionId,
      targetSessionTitle: sessionTitle || current.targetSessionTitle,
    }));
  }, [activeWorkspaceId, items.length, searchParams, sessions]);

  useEffect(() => {
    if (!items.some((item) => item.kind === "internal" && item.raw.kind === "goal-loop" && item.raw.runStatus === "running")) {
      return;
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [items]);

  useEffect(() => {
    const currentItem = selectedItem;

    if (isCreateMode || !currentItem) {
      setRunHistory([]);
      setSelectedRun(null);
      setIsRunHistoryLoading(false);
      setIsRunDialogOpen(false);
      setIsRunOutputExpanded(false);
      return;
    }

    let cancelled = false;
    setIsRunHistoryLoading(true);

    const loadPromise =
      currentItem.kind === "codex"
        ? listCodexAutomationRuns(currentItem.id, RUN_HISTORY_LIMIT).then((response) => response.items.map(mapCodexRun))
        : currentItem.raw.kind === "goal-loop"
          ? listGoalAutomationRuns(currentItem.id, RUN_HISTORY_LIMIT).then((response) =>
              response.items.map((item) => mapGoalRun(item, currentItem.name, language)),
            )
          : Promise.resolve([]);

    void loadPromise
      .then((runs) => {
        if (cancelled) {
          return;
        }

        setRunHistory(runs);
        setSelectedRun((current) => current ? runs.find((item) => item.id === current.id) ?? runs[0] ?? null : runs[0] ?? null);
        setIsRunOutputExpanded(false);
      })
      .catch(() => {
        if (!cancelled) {
          setRunHistory([]);
          setSelectedRun(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRunHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isCreateMode, language, selectedItem]);

  async function handleSubmit() {
    setIsSaving(true);
    setError(null);

    try {
      let nextSelectedId: string | null = selectedId;

      if (isCreateMode) {
        if (createKind === "codex") {
          const response = await createCodexAutomation(toCodexAutomationInput(codexForm));
          nextSelectedId = response.item.id;
          setCodexForm(createDefaultCodexForm(activeWorkspacePath));
        } else {
          const response = await createGoalAutomationRule(toGoalAutomationInput(goalForm, activeWorkspaceId));
          nextSelectedId = response.item.id;
          setGoalForm(createDefaultGoalForm(activeWorkspaceId));
        }
      } else if (selectedCodexItem) {
        const response = await updateCodexAutomation(selectedCodexItem.id, toCodexAutomationInput(codexForm));
        nextSelectedId = response.item.id;
      } else if (selectedGoalItem) {
        const response = await updateGoalAutomationRule(selectedGoalItem.id, toGoalAutomationInput(goalForm, activeWorkspaceId));
        nextSelectedId = response.item.id;
      }

      setRunNotice(null);
      setIsCreateMode(false);
      await refresh();
      setSelectedId(nextSelectedId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save automation");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteSelected() {
    if (!selectedItem) {
      return;
    }

    setError(null);
    setBusyActionId(selectedItem.id);

    try {
      if (selectedItem.kind === "codex") {
        await deleteCodexAutomation(selectedItem.id);
      } else {
        await deleteAutomationRule(selectedItem.id);
      }

      setSelectedId(null);
      setRunNotice(null);
      setIsCreateMode(false);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete automation");
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleRunSelected() {
    if (!selectedItem) {
      return;
    }

    setBusyActionId(selectedItem.id);
    setError(null);
    setRunNotice(null);

    try {
      if (selectedItem.kind === "codex") {
        const response = await runCodexAutomationNow(selectedItem.id);
        const completedRun = mapCodexRun({
          automationId: selectedItem.id,
          threadId: `manual-run-${Date.now()}`,
          status: "completed",
          title: selectedItem.name,
          summary: response.summary || null,
          output: response.output || null,
          prompt: selectedItem.raw.prompt ?? null,
          sourceCwd: selectedItem.raw.cwds[0] ?? null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        setRunNotice(response.summary || (language === "zh" ? "运行完成。" : "Run completed."));
        setRunHistory((current) => [completedRun, ...current.filter((item) => item.id !== completedRun.id)].slice(0, RUN_HISTORY_LIMIT));
        setSelectedRun(completedRun);
      } else {
        await startAutomationRule(selectedItem.id);
        setRunNotice(
          selectedGoalItem?.actionType === "generate-timeline-memory"
            ? (language === "zh" ? "规则已执行，结果已刷新。" : "Rule executed and refreshed.")
            : (language === "zh" ? "目标自动推进已启动。" : "Goal automation started."),
        );
      }

      await refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Failed to run automation");
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleStopSelected() {
    if (!selectedGoalItem) {
      return;
    }

    setBusyActionId(selectedGoalItem.id);
    setError(null);
    setRunNotice(null);

    try {
      await stopAutomationRule(selectedGoalItem.id);
      setRunNotice(language === "zh" ? "已请求停止，当前轮结束后生效。" : "Stop requested. It will take effect after the current turn.");
      await refresh();
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "Failed to stop automation");
    } finally {
      setBusyActionId(null);
    }
  }

  function selectAutomation(item: AutomationListItem) {
    setIsCreateMode(false);
    setSelectedId(item.id);
    setRunNotice(null);
  }

  function startCreateMode(kind: CreateKind) {
    setCreateKind(kind);
    setIsCreateMode(true);
    setSelectedId(null);
    setRunNotice(null);

    if (kind === "codex") {
      setCodexForm(createDefaultCodexForm(activeWorkspacePath));
      return;
    }

    setGoalForm((current) => ({
      ...createDefaultGoalForm(activeWorkspaceId),
      workspaceId: activeWorkspaceId,
      targetSessionMode:
        sessions.length > 0 ? "existing-session" : "new-session",
      targetSessionId: sessions[0]?.id ?? "",
      targetSessionTitle: sessions[0]?.title ?? "",
    }));
  }

  async function handleCopyRunOutput(run: AutomationRunViewItem) {
    const text = run.output ?? "";

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopiedRunId(run.id);
      window.setTimeout(() => {
        setCopiedRunId((current) => (current === run.id ? null : current));
      }, 1600);
    } catch {
      setError(language === "zh" ? "复制失败，请稍后重试。" : "Failed to copy output.");
    }
  }

  const rightPanelMode = isCreateMode ? "create" : selectedItem ? "selected" : "empty";
  const rightPanelTitle =
    rightPanelMode === "create"
      ? createKind === "goal-loop"
        ? (language === "zh" ? "新建目标规则" : "Create goal automation")
        : (language === "zh" ? "新建 Codex 规则" : "Create Codex rule")
      : selectedCodexItem
        ? (language === "zh" ? "规则详情与配置" : "Rule details and settings")
        : selectedGoalItem
          ? (language === "zh" ? "目标规则详情" : "Goal automation details")
          : (language === "zh" ? "自动化详情" : "Automation details");
  const rightPanelMeta =
    rightPanelMode === "create"
      ? createKind === "goal-loop"
        ? (language === "zh" ? "Relay 内部规则 / goal-loop" : "relay internal / goal-loop")
        : (language === "zh" ? "Codex 自动化" : "codex automation")
      : selectedItem
        ? `${selectedItem.sourceLabel} / ${selectedItem.typeLabel}`
        : (language === "zh" ? "请选择左侧规则" : "select a rule");
  const listGroups = [
    {
      key: "codex",
      label: language === "zh" ? "Codex 自动化" : "Codex automations",
      items: codexItems,
    },
    {
      key: "internal",
      label: language === "zh" ? "Relay 内部规则" : "Relay internal rules",
      items: internalItems,
    },
  ].filter((group) => group.items.length > 0);
  const runSectionVisible = Boolean(
    !isCreateMode && (selectedCodexItem || selectedGoalItem),
  );

  return (
    <section className="automation-page">
      <div className="automation-topbar">
        <div className="settings-page-head automation-page-head">
          <div className="automation-page-heading">
            <span className="eyebrow">{messages.memories.automation}</span>
          </div>
          <div className="automation-summary-inline" aria-label={language === "zh" ? "自动化摘要" : "Automation summary"}>
            <span>{items.length} {language === "zh" ? "总规则" : "total"}</span>
            <span>{items.filter((item) => item.filterStatus === "ACTIVE").length} {language === "zh" ? "启用中" : "active"}</span>
            <span>{items.filter((item) => item.kind === "internal").length} {language === "zh" ? "内部" : "internal"}</span>
            <span>{items.filter((item) => item.kind === "codex").length} Codex</span>
          </div>
        </div>

        <div className="automation-filter-bar">
          {([
            ["all", language === "zh" ? "全部" : "All"],
            ["internal", language === "zh" ? "内部" : "Internal"],
            ["codex", "Codex"],
            ["active", "ACTIVE"],
            ["paused", "PAUSED"],
          ] as Array<[FilterKey, string]>).map(([key, label]) => (
            <button
              key={key}
              className={`memory-theme-pill ${activeFilter === key ? "memory-theme-pill-active" : ""}`}
              onClick={() => setActiveFilter(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="automation-shell">
        <section className="panel panel-center automation-section-card automation-list-panel">
          <div className="memory-automation-head">
            <span>{language === "zh" ? "规则列表" : "rules"}</span>
            <span>
              {language === "zh"
                ? `${filteredItems.length} / ${items.length} 项自动化`
                : `${filteredItems.length} / ${items.length} automations`}
            </span>
          </div>
          <div className="automation-list-actions">
            <button
              className={`automation-list-create ${isCreateMode && createKind === "goal-loop" ? "automation-list-create-active" : ""}`}
              onClick={() => startCreateMode("goal-loop")}
              type="button"
            >
              {language === "zh" ? "新建目标规则" : "New goal rule"}
            </button>
            <button
              className={`automation-list-create ${isCreateMode && createKind === "codex" ? "automation-list-create-active" : ""}`}
              onClick={() => startCreateMode("codex")}
              type="button"
            >
              {language === "zh" ? "新建 Codex 规则" : "New Codex rule"}
            </button>
          </div>
          {isLoading ? <div className="workspace-empty">{messages.workspace.loading}</div> : null}
          {error && !selectedItem && !isCreateMode ? <div className="workspace-empty">{error}</div> : null}
          {!isLoading && !error && items.length === 0 ? (
            <div className="workspace-empty">{language === "zh" ? "当前还没有自动化规则。" : "No automations yet."}</div>
          ) : null}
          {!isLoading && !error && items.length > 0 && filteredItems.length === 0 ? (
            <div className="workspace-empty">{language === "zh" ? "当前筛选条件下没有匹配规则。" : "No rules match this filter."}</div>
          ) : null}
          {!isLoading && listGroups.length > 0 ? (
            <div className="automation-list-groups automation-scroll-list">
              {listGroups.map((group) => (
                <section className="automation-list-group" key={group.key}>
                  <div className="automation-group-head">
                    <span>{group.label}</span>
                    <span>{group.items.length}</span>
                  </div>
                  <div className="memory-automation-list">
                    {group.items.map((item) => (
                      <article
                        className={`memory-automation-item ${selectedId === item.id ? "memory-automation-item-selected" : ""}`}
                        key={item.id}
                        onClick={() => selectAutomation(item)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectAutomation(item);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="memory-automation-marker" aria-hidden="true" />
                        <div className="memory-automation-top">
                          <div className="automation-item-title">
                            <h4>{item.name}</h4>
                          </div>
                          <span className={`automation-status-pill automation-status-${item.status.toLowerCase()}`}>{item.statusLabel}</span>
                        </div>
                        <p className="automation-list-secondary">{item.typeLabel}</p>
                        {item.runtimeLabel ? <p className="automation-list-secondary">{item.runtimeLabel}</p> : null}
                        <div className="automation-compact-meta">
                          <span>{item.scheduleLabel}</span>
                          <span>{messages.memories.labels.next}: {item.nextLabel}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </section>

        <aside className="panel panel-right automation-section-card automation-form-panel">
          <div className="memory-automation-head automation-editor-head">
            <div className="automation-editor-head-copy">
              <span>{rightPanelTitle}</span>
              <strong>
                {rightPanelMode === "create"
                  ? createKind === "goal-loop"
                    ? (language === "zh" ? "准备创建新的目标自动推进规则" : "Ready to create a goal automation")
                    : (language === "zh" ? "准备创建新的 Codex 自动化" : "Ready to create a Codex automation")
                  : selectedItem?.name ?? (language === "zh" ? "未选择规则" : "No rule selected")}
              </strong>
            </div>
            <span className="automation-panel-meta">{rightPanelMeta}</span>
          </div>

          {rightPanelMode === "empty" ? (
            <div className="automation-panel-empty">
              {language === "zh" ? "从左侧选择一条规则，或创建新的自动化。" : "Select a rule on the left or create a new automation."}
            </div>
          ) : (
            <div className="automation-panel-sections">
              <section className="automation-panel-section automation-summary-strip">
                <div className="memory-automation-head">
                  <span>{language === "zh" ? "当前规则" : "Current rule"}</span>
                  {!isCreateMode && selectedItem ? (
                    <span className={`automation-status-pill automation-status-${selectedItem.status.toLowerCase()}`}>{selectedItem.statusLabel}</span>
                  ) : (
                    <span className="automation-pill">
                      {createKind === "goal-loop"
                        ? (language === "zh" ? "relay 内部规则" : "relay internal rule")
                        : (language === "zh" ? "codex 自动化" : "codex automation")}
                    </span>
                  )}
                </div>

                {isCreateMode ? (
                  <>
                    <div className="automation-meta-grid automation-meta-grid-compact">
                      <div className="automation-meta-item">
                        <span>{language === "zh" ? "来源" : "source"}</span>
                        <strong>
                          {createKind === "goal-loop"
                            ? (language === "zh" ? "Relay 内部规则" : "relay internal")
                            : (language === "zh" ? "Codex 自动化" : "codex automation")}
                        </strong>
                      </div>
                      <div className="automation-meta-item">
                        <span>{language === "zh" ? "类型" : "type"}</span>
                        <strong>
                          {createKind === "goal-loop"
                            ? formatGoalActionTypeLabel(goalForm.actionType, language)
                            : codexForm.scheduleKind === "hourly"
                              ? (language === "zh" ? "时间调度 / 小时间隔" : "schedule / hourly")
                              : (language === "zh" ? "时间调度 / 每周时刻" : "schedule / weekly")}
                        </strong>
                      </div>
                      <div className="automation-meta-item">
                        <span>{language === "zh" ? "工作区" : "workspace"}</span>
                        <strong>
                          {createKind === "goal-loop"
                            ? (workspaces.find((item) => item.id === goalForm.workspaceId)?.name ?? workspaces.find((item) => item.id === goalForm.workspaceId)?.localPath ?? "-")
                            : (codexForm.cwd.trim() || "-")}
                        </strong>
                      </div>
                      <div className="automation-meta-item">
                        <span>{language === "zh" ? "执行方式" : "schedule"}</span>
                        <strong>
                          {createKind === "goal-loop"
                            ? formatGoalTriggerSummary(
                                {
                                  trigger: {
                                    kind: goalForm.triggerKind,
                                    turnInterval: goalUsesTurnIntervalTrigger ? goalForm.triggerTurnInterval : null,
                                  },
                                  targetSessionMode: goalRequiresExistingSession ? "existing-session" : goalForm.targetSessionMode,
                                },
                                language,
                              )
                            : describeSchedule(toCodexAutomationInput(codexForm).rrule, language)}
                        </strong>
                      </div>
                    </div>
                  </>
                ) : selectedItem ? (
                  <>
                    <div className="automation-inspector-top automation-inspector-top-compact">
                      <strong>{selectedItem.name}</strong>
                      <span className={`automation-status-pill automation-status-${selectedItem.status.toLowerCase()}`}>{selectedItem.statusLabel}</span>
                    </div>
                    <div className="automation-meta-grid automation-meta-grid-compact">
                      <div className="automation-meta-item">
                        <span>{language === "zh" ? "来源" : "source"}</span>
                        <strong>{selectedItem.sourceLabel}</strong>
                      </div>
                      <div className="automation-meta-item">
                        <span>{language === "zh" ? "类型" : "type"}</span>
                        <strong>{selectedItem.typeLabel}</strong>
                      </div>
                      <div className="automation-meta-item">
                        <span>{language === "zh" ? "工作区" : "workspace"}</span>
                        <strong>{selectedItem.workspaceLabel}</strong>
                      </div>
                      <div className="automation-meta-item">
                        <span>{language === "zh" ? "会话" : "session"}</span>
                        <strong>{selectedItem.sessionLabel ?? "-"}</strong>
                      </div>
                      <div className="automation-meta-item">
                        <span>{messages.memories.labels.last}</span>
                        <strong>{selectedItem.lastLabel}</strong>
                      </div>
                      <div className="automation-meta-item">
                        <span>{messages.memories.labels.next}</span>
                        <strong>{selectedItem.nextLabel}</strong>
                      </div>
                    </div>
                    {selectedItem.runtimeLabel ? (
                      <p className="automation-panel-description">{selectedItem.runtimeLabel}</p>
                    ) : null}

                    {selectedCodexItem ? (
                      <div className="automation-panel-actions">
                        <button
                          className="automation-primary-action"
                          disabled={busyActionId === selectedCodexItem.id}
                          onClick={() => void handleRunSelected()}
                          type="button"
                        >
                          {busyActionId === selectedCodexItem.id
                            ? (language === "zh" ? "运行中..." : "Running...")
                            : messages.common.runNow}
                        </button>
                        <button
                          className="automation-danger-action"
                          disabled={busyActionId === selectedCodexItem.id}
                          onClick={() => void handleDeleteSelected()}
                          type="button"
                        >
                          {language === "zh" ? "删除规则" : "Delete rule"}
                        </button>
                      </div>
                    ) : null}

                    {selectedGoalItem ? (
                      <div className="automation-panel-actions">
                        <button
                          className="automation-primary-action"
                          disabled={busyActionId === selectedGoalItem.id || !selectedGoalItem.capabilities.canRun}
                          onClick={() => void handleRunSelected()}
                          type="button"
                        >
                          {busyActionId === selectedGoalItem.id
                            ? (language === "zh" ? "处理中..." : "Working...")
                            : selectedGoalItem.actionType === "generate-timeline-memory"
                              ? (language === "zh" ? "立即执行" : "Run now")
                              : (language === "zh" ? "手动启动" : "Start")}
                        </button>
                        {selectedGoalItem.actionType === "continue-session" ? (
                          <button
                            className="automation-secondary-action"
                            disabled={busyActionId === selectedGoalItem.id || !selectedGoalItem.capabilities.canStop}
                            onClick={() => void handleStopSelected()}
                            type="button"
                          >
                            {language === "zh" ? "停止" : "Stop"}
                          </button>
                        ) : null}
                        <button
                          className="automation-danger-action"
                          disabled={busyActionId === selectedGoalItem.id || !selectedGoalItem.capabilities.canDelete}
                          onClick={() => void handleDeleteSelected()}
                          type="button"
                        >
                          {language === "zh" ? "删除规则" : "Delete rule"}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </section>

              {runNotice ? <div className="automation-notice">{runNotice}</div> : null}
              {error ? <div className="workspace-empty">{error}</div> : null}

              {runSectionVisible ? (
                <section className="automation-panel-section automation-run-result">
                  <div className="memory-automation-head">
                    <span>{language === "zh" ? `最近 ${RUN_HISTORY_LIMIT} 次运行` : `Latest ${RUN_HISTORY_LIMIT} runs`}</span>
                    <span>
                      {isRunHistoryLoading
                        ? (language === "zh" ? "加载中" : "Loading")
                        : `${runHistory.length} ${language === "zh" ? "条" : "items"}`}
                    </span>
                  </div>
                  {isRunHistoryLoading ? (
                    <p className="automation-inspector-note">{language === "zh" ? "正在加载运行历史。" : "Loading run history."}</p>
                  ) : null}
                  {!isRunHistoryLoading && runHistory.length === 0 ? (
                    <p className="automation-inspector-note">
                      {language === "zh" ? "这条规则还没有运行结果。" : "This rule has no run result yet."}
                    </p>
                  ) : null}
                  {!isRunHistoryLoading && runHistory.length > 0 ? (
                    <div className="automation-history-list">
                      {runHistory.map((run, index) => (
                        <button
                          className="automation-history-item"
                          key={run.id}
                          onClick={() => {
                            setSelectedRun(run);
                            setIsRunDialogOpen(true);
                            setIsRunOutputExpanded(false);
                          }}
                          type="button"
                        >
                          <div className="automation-history-item-top">
                            <strong>{formatDateTime(run.createdAt, language)}</strong>
                            <span className={`automation-status-pill automation-status-${run.status.toLowerCase()}`}>{run.status}</span>
                          </div>
                          <p className="automation-history-summary">{getRunPreview(run, language)}</p>
                          <div className="automation-history-meta">
                            <span>{language === "zh" ? `第 ${index + 1} 条记录` : `run ${index + 1}`}</span>
                            <span>{language === "zh" ? "点击查看完整原文" : "Open full output"}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {(isCreateMode || selectedCodexItem || selectedGoalItem) ? (
                <section className="automation-panel-section">
                  <div className="memory-automation-head">
                    <span>
                      {isCreateMode
                        ? (language === "zh" ? "创建规则" : "Create rule")
                        : (language === "zh" ? "编辑规则" : "Edit rule")}
                    </span>
                    <span>
                      {isCreateMode
                        ? (language === "zh" ? "填写后创建" : "fill and create")
                        : (language === "zh" ? "修改后保存" : "edit and save")}
                    </span>
                  </div>

                  {createKind === "codex" || selectedCodexItem ? (
                    <>
                      <div className="automation-form">
                        <section className="automation-form-group automation-field-wide">
                          <div className="automation-form-group-head">
                            <span>{language === "zh" ? "基本信息" : "Basics"}</span>
                          </div>
                          <div className="automation-form-grid">
                            <label className="automation-field">
                              <span>{language === "zh" ? "规则名称" : "Rule name"}</span>
                              <input
                                ref={nameInputRef}
                                aria-label={language === "zh" ? "规则名称" : "Rule name"}
                                value={codexForm.name}
                                onChange={(event) => setCodexForm((current) => ({ ...current, name: event.target.value }))}
                              />
                            </label>
                            <label className="automation-field">
                              <span>{language === "zh" ? "工作区" : "Workspace"}</span>
                              <input
                                value={codexForm.cwd}
                                onChange={(event) => setCodexForm((current) => ({ ...current, cwd: event.target.value }))}
                              />
                            </label>
                            <label className="automation-field">
                              <span>{language === "zh" ? "状态" : "Status"}</span>
                              <select
                                value={codexForm.status}
                                onChange={(event) => setCodexForm((current) => ({ ...current, status: event.target.value as "ACTIVE" | "PAUSED" }))}
                              >
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="PAUSED">PAUSED</option>
                              </select>
                            </label>
                            <label className="automation-field">
                              <span>{language === "zh" ? "类型" : "Type"}</span>
                              <select
                                value={codexForm.scheduleKind}
                                onChange={(event) =>
                                  setCodexForm((current) => ({ ...current, scheduleKind: event.target.value as "hourly" | "weekly" }))
                                }
                              >
                                <option value="weekly">{language === "zh" ? "每周固定时刻" : "Weekly schedule"}</option>
                                <option value="hourly">{language === "zh" ? "按小时间隔" : "Hourly interval"}</option>
                              </select>
                            </label>
                          </div>
                        </section>

                        <section className="automation-form-group automation-field-wide">
                          <div className="automation-form-group-head">
                            <span>{language === "zh" ? "调度规则" : "Schedule"}</span>
                          </div>
                          <div className="automation-form-grid">
                            {codexForm.scheduleKind === "hourly" ? (
                              <label className="automation-field">
                                <span>{language === "zh" ? "间隔小时" : "Interval hours"}</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={codexForm.intervalHours}
                                  onChange={(event) =>
                                    setCodexForm((current) => ({ ...current, intervalHours: Number(event.target.value) || 1 }))
                                  }
                                />
                              </label>
                            ) : (
                              <>
                                <label className="automation-field">
                                  <span>{language === "zh" ? "小时" : "Hour"}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={23}
                                    value={codexForm.hour}
                                    onChange={(event) => setCodexForm((current) => ({ ...current, hour: Number(event.target.value) || 0 }))}
                                  />
                                </label>
                                <label className="automation-field">
                                  <span>{language === "zh" ? "分钟" : "Minute"}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={59}
                                    value={codexForm.minute}
                                    onChange={(event) => setCodexForm((current) => ({ ...current, minute: Number(event.target.value) || 0 }))}
                                  />
                                </label>
                                <div className="automation-field automation-field-wide">
                                  <span>{language === "zh" ? "执行日" : "Days"}</span>
                                  <div className="memory-theme-strip">
                                    {WEEK_DAYS.map((day) => {
                                      const active = codexForm.byDays.includes(day.key);
                                      return (
                                        <button
                                          className={`memory-theme-pill ${active ? "memory-theme-pill-active" : ""}`}
                                          key={day.key}
                                          onClick={() =>
                                            setCodexForm((current) => ({
                                              ...current,
                                              byDays: active
                                                ? current.byDays.filter((value) => value !== day.key)
                                                : [...current.byDays, day.key],
                                            }))
                                          }
                                          type="button"
                                        >
                                          {language === "zh" ? day.zh : day.en}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </section>

                        <section className="automation-form-group automation-field-wide">
                          <div className="automation-form-group-head">
                            <span>{language === "zh" ? "执行内容" : "Execution"}</span>
                          </div>
                          <label className="automation-field">
                            <span>{language === "zh" ? "提示词" : "Prompt"}</span>
                            <textarea
                              rows={7}
                              value={codexForm.prompt}
                              onChange={(event) => setCodexForm((current) => ({ ...current, prompt: event.target.value }))}
                            />
                          </label>
                        </section>
                      </div>
                    </>
                  ) : null}

                  {(createKind === "goal-loop" || selectedGoalItem) ? (
                    <div className="automation-form">
                      <section className="automation-form-group automation-field-wide">
                        <div className="automation-form-group-head">
                          <span>{language === "zh" ? "规则定义" : "Rule definition"}</span>
                        </div>
                        <div className="automation-form-grid">
                          <label className="automation-field">
                            <span>{language === "zh" ? "规则名称" : "Rule name"}</span>
                            <input
                              value={goalForm.title}
                              onChange={(event) => setGoalForm((current) => ({ ...current, title: event.target.value }))}
                            />
                          </label>
                          <label className="automation-field">
                            <span>{language === "zh" ? "状态" : "Status"}</span>
                            <select
                              disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit)}
                              value={goalForm.status}
                              onChange={(event) => setGoalForm((current) => ({ ...current, status: event.target.value as "active" | "paused" }))}
                            >
                              <option value="active">ACTIVE</option>
                              <option value="paused">PAUSED</option>
                            </select>
                          </label>
                          <label className="automation-field">
                            <span>{language === "zh" ? "动作" : "Action"}</span>
                            <select
                              disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit)}
                              value={goalForm.actionType}
                              onChange={(event) =>
                                setGoalForm((current) => ({
                                  ...current,
                                  actionType: event.target.value as GoalFormState["actionType"],
                                }))
                              }
                            >
                              <option value="continue-session">{language === "zh" ? "继续推进会话" : "Continue session"}</option>
                              <option value="generate-timeline-memory">
                                {language === "zh" ? "生成时间线记忆" : "Generate timeline memory"}
                              </option>
                            </select>
                          </label>
                          <label className="automation-field">
                            <span>{language === "zh" ? "触发条件" : "Trigger"}</span>
                            <select
                              disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit)}
                              value={goalForm.triggerKind}
                              onChange={(event) =>
                                setGoalForm((current) => ({
                                  ...current,
                                  triggerKind: event.target.value as GoalFormState["triggerKind"],
                                }))
                              }
                            >
                              <option value="manual">{language === "zh" ? "手动触发" : "Manual"}</option>
                              <option value="turn-interval">{language === "zh" ? "按轮次触发" : "Turn interval"}</option>
                            </select>
                          </label>
                          <label className="automation-field">
                            <span>{language === "zh" ? "工作区" : "Workspace"}</span>
                            <select
                              disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit)}
                              value={goalForm.workspaceId ?? ""}
                              onChange={(event) => setGoalForm((current) => ({ ...current, workspaceId: event.target.value || null }))}
                            >
                              <option value="">{language === "zh" ? "当前工作区" : "Current workspace"}</option>
                              {workspaces.map((workspace) => (
                                <option key={workspace.id} value={workspace.id}>
                                  {workspace.name || workspace.localPath}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="automation-field">
                            <span>{language === "zh" ? "目标会话" : "Target session"}</span>
                            <select
                              disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit) || goalRequiresExistingSession}
                              value={goalRequiresExistingSession ? "existing-session" : goalForm.targetSessionMode}
                              onChange={(event) =>
                                setGoalForm((current) => ({
                                  ...current,
                                  targetSessionMode: event.target.value as "existing-session" | "new-session",
                                  targetSessionId:
                                    event.target.value === "existing-session"
                                      ? (sessions[0]?.id ?? current.targetSessionId)
                                      : "",
                                }))
                              }
                            >
                              <option value="existing-session">{language === "zh" ? "绑定现有会话" : "Bind existing session"}</option>
                              {!goalRequiresExistingSession ? (
                                <option value="new-session">{language === "zh" ? "新建专用会话" : "Create dedicated session"}</option>
                              ) : null}
                            </select>
                          </label>
                          {goalUsesTurnIntervalTrigger ? (
                            <label className="automation-field">
                              <span>{language === "zh" ? "轮次间隔" : "Turn interval"}</span>
                              <input
                                disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit)}
                                type="number"
                                min={1}
                                max={200}
                                value={goalForm.triggerTurnInterval}
                                onChange={(event) =>
                                  setGoalForm((current) => ({
                                    ...current,
                                    triggerTurnInterval: Number(event.target.value) || 1,
                                  }))
                                }
                              />
                            </label>
                          ) : null}
                        </div>
                      </section>

                      {(goalRequiresExistingSession || goalForm.targetSessionMode === "existing-session") ? (
                        <section className="automation-form-group automation-field-wide">
                          <div className="automation-form-group-head">
                            <span>{language === "zh" ? "绑定会话" : "Bound session"}</span>
                          </div>
                          <div className="automation-form-grid">
                            <label className="automation-field automation-field-wide">
                              <span>{language === "zh" ? "选择会话" : "Select session"}</span>
                              <select
                                disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit)}
                                value={goalForm.targetSessionId}
                                onChange={(event) =>
                                  setGoalForm((current) => ({
                                    ...current,
                                    targetSessionId: event.target.value,
                                    targetSessionTitle:
                                      sessions.find((item) => item.id === event.target.value)?.title ?? current.targetSessionTitle,
                                  }))
                                }
                              >
                                {sessions.length === 0 ? <option value="">{language === "zh" ? "暂无可选会话" : "No sessions"}</option> : null}
                                {sessions.map((session) => (
                                  <option key={session.id} value={session.id}>
                                    {session.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </section>
                      ) : null}

                      {goalUsesContinueSessionAction ? (
                        <>
                          <section className="automation-form-group automation-field-wide">
                            <div className="automation-form-group-head">
                              <span>{language === "zh" ? "执行目标" : "Execution goal"}</span>
                            </div>
                            <label className="automation-field">
                              <span>{language === "zh" ? "目标描述" : "Goal"}</span>
                              <textarea
                                ref={goalInputRef}
                                disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit)}
                                rows={8}
                                value={goalForm.goal}
                                onChange={(event) => setGoalForm((current) => ({ ...current, goal: event.target.value }))}
                              />
                            </label>
                            <label className="automation-field">
                              <span>{language === "zh" ? "验收标准" : "Acceptance criteria"}</span>
                              <textarea
                                disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit)}
                                rows={5}
                                placeholder={
                                  language === "zh"
                                    ? "推荐填写。写清楚什么情况下才算目标完成，例如：\n1. 给出项目介绍\n2. 补充架构和运行链路\n3. 指出当前状态和后续缺口"
                                    : "Recommended. Define what must be true before the goal is considered complete."
                                }
                                value={goalForm.acceptanceCriteria}
                                onChange={(event) => setGoalForm((current) => ({ ...current, acceptanceCriteria: event.target.value }))}
                              />
                            </label>
                          </section>

                          <section className="automation-form-group automation-field-wide">
                            <div className="automation-form-group-head">
                              <span>{language === "zh" ? "安全边界" : "Safety limits"}</span>
                            </div>
                            <div className="automation-form-grid">
                              <label className="automation-field">
                                <span>{language === "zh" ? "最大轮次" : "Max turns"}</span>
                                <input
                                  disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit)}
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={goalForm.maxTurns}
                                  onChange={(event) => setGoalForm((current) => ({ ...current, maxTurns: Number(event.target.value) || 1 }))}
                                />
                              </label>
                              <label className="automation-field">
                                <span>{language === "zh" ? "最长运行时长（分钟）" : "Max duration (minutes)"}</span>
                                <input
                                  disabled={Boolean(selectedGoalItem && !selectedGoalItem.capabilities.canEdit)}
                                  type="number"
                                  min={5}
                                  max={720}
                                  value={goalForm.maxDurationMinutes}
                                  onChange={(event) =>
                                    setGoalForm((current) => ({ ...current, maxDurationMinutes: Number(event.target.value) || 5 }))
                                  }
                                />
                              </label>
                            </div>
                          </section>
                        </>
                      ) : (
                        <p className="automation-inspector-note">
                          {language === "zh"
                            ? "这个动作会为绑定会话生成一条 timeline memory，不需要填写目标描述或验收标准。"
                            : "This action generates a timeline memory for the bound session and does not require a goal or acceptance criteria."}
                        </p>
                      )}
                    </div>
                  ) : null}

                  <div className="settings-editor-actions">
                    <div className="settings-editor-actions-left">
                      <button className="settings-save automation-primary-action" disabled={isSaving} onClick={() => void handleSubmit()} type="button">
                        {isCreateMode ? (language === "zh" ? "创建" : "Create") : (language === "zh" ? "保存修改" : "Save changes")}
                      </button>
                      <button
                        className="settings-reset automation-secondary-action"
                        disabled={isSaving}
                        onClick={() => {
                          if (selectedCodexItem) {
                            setCodexForm(fromCodexAutomation(selectedCodexItem.raw));
                            return;
                          }

                          if (selectedGoalItem) {
                            setGoalForm(fromGoalAutomation(selectedGoalItem, activeWorkspaceId));
                            return;
                          }

                          setIsCreateMode(false);
                          setCodexForm(createDefaultCodexForm(activeWorkspacePath));
                          setGoalForm(createDefaultGoalForm(activeWorkspaceId));
                        }}
                        type="button"
                      >
                        {isCreateMode ? (language === "zh" ? "取消新建" : "Cancel") : (language === "zh" ? "重置修改" : "Reset changes")}
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </aside>

        {isRunDialogOpen && selectedRun ? (
          <div className="confirm-backdrop" role="presentation">
            <button
              aria-label={language === "zh" ? "关闭运行详情" : "Close run details"}
              className="automation-run-dialog-backdrop"
              onClick={() => {
                setIsRunDialogOpen(false);
                setIsRunOutputExpanded(false);
              }}
              type="button"
            />
            <section
              aria-label={language === "zh" ? "运行详情" : "Run details"}
              aria-modal="true"
              className="automation-run-dialog"
              role="dialog"
            >
              <div className="automation-run-dialog-head">
                <div className="automation-run-dialog-copy">
                  <span>{language === "zh" ? "运行详情" : "Run details"}</span>
                  <strong>{formatDateTime(selectedRun.createdAt, language)}</strong>
                </div>
                <div className="automation-run-dialog-actions">
                  <button
                    className="automation-secondary-action"
                    onClick={() => void handleCopyRunOutput(selectedRun)}
                    type="button"
                  >
                    {copiedRunId === selectedRun.id
                      ? (language === "zh" ? "已复制" : "Copied")
                      : (language === "zh" ? "复制全文" : "Copy full output")}
                  </button>
                  <button
                    className="automation-secondary-action"
                    onClick={() => setIsRunOutputExpanded((current) => !current)}
                    type="button"
                  >
                    {isRunOutputExpanded
                      ? (language === "zh" ? "收起" : "Collapse")
                      : (language === "zh" ? "展开" : "Expand")}
                  </button>
                  <button
                    className="automation-secondary-action"
                    onClick={() => {
                      setIsRunDialogOpen(false);
                      setIsRunOutputExpanded(false);
                    }}
                    type="button"
                  >
                    {language === "zh" ? "关闭" : "Close"}
                  </button>
                </div>
              </div>
              <div className="automation-run-dialog-meta">
                <span>{selectedRun.status}</span>
                <span>{selectedRun.sourceLabel}</span>
                <span>{selectedRun.sourceContext ?? "-"}</span>
              </div>
              {selectedRun.summary ? <p className="automation-run-summary">{selectedRun.summary}</p> : null}
              <pre className={`automation-run-output-body automation-run-output-dialog ${isRunOutputExpanded ? "automation-run-output-expanded" : ""}`}>
                <code>{selectedRun.output ?? (language === "zh" ? "暂无完整输出。" : "No output.")}</code>
              </pre>
            </section>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function createDefaultCodexForm(cwd: string): CodexFormState {
  return {
    name: "",
    prompt: "",
    status: "ACTIVE",
    cwd,
    scheduleKind: "weekly",
    intervalHours: 24,
    byDays: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
    hour: 6,
    minute: 0,
  };
}

function createDefaultGoalForm(workspaceId: string | null): GoalFormState {
  return {
    title: "",
    actionType: "continue-session",
    triggerKind: "manual",
    triggerTurnInterval: 20,
    goal: "",
    acceptanceCriteria: "",
    status: "active",
    workspaceId,
    targetSessionMode: "new-session",
    targetSessionId: "",
    targetSessionTitle: "",
    maxTurns: 10,
    maxDurationMinutes: 120,
  };
}

function toCodexAutomationInput(form: CodexFormState): CodexAutomationInput {
  return {
    name: form.name.trim(),
    prompt: form.prompt.trim(),
    status: form.status,
    cwds: form.cwd.trim() ? [form.cwd.trim()] : [],
    rrule:
      form.scheduleKind === "hourly"
        ? `FREQ=HOURLY;INTERVAL=${Math.max(1, form.intervalHours)}`
        : `FREQ=WEEKLY;BYDAY=${(form.byDays.length > 0 ? form.byDays : WEEK_DAYS.map((item) => item.key)).join(",")};BYHOUR=${clamp(form.hour, 0, 23)};BYMINUTE=${clamp(form.minute, 0, 59)}`,
  };
}

function fromCodexAutomation(item: CodexAutomation): CodexFormState {
  const parts = new Map(item.rrule.split(";").map((part) => part.split("=") as [string, string]));

  if (parts.get("FREQ") === "HOURLY") {
    return {
      name: item.name,
      prompt: item.prompt,
      status: item.status,
      cwd: item.cwds[0] ?? "",
      scheduleKind: "hourly",
      intervalHours: Number(parts.get("INTERVAL") ?? "24"),
      byDays: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
      hour: 6,
      minute: 0,
    };
  }

  return {
    name: item.name,
    prompt: item.prompt,
    status: item.status,
    cwd: item.cwds[0] ?? "",
    scheduleKind: "weekly",
    intervalHours: 24,
    byDays: (parts.get("BYDAY") ?? "").split(",").filter(Boolean),
    hour: Number(parts.get("BYHOUR") ?? "6"),
    minute: Number(parts.get("BYMINUTE") ?? "0"),
  };
}

function toGoalAutomationInput(form: GoalFormState, fallbackWorkspaceId: string | null): GoalAutomationRuleInput {
  const targetSessionMode = requiresExistingGoalSession(form.actionType, form.triggerKind)
    ? "existing-session"
    : form.targetSessionMode;

  return {
    title: form.title.trim(),
    actionType: form.actionType,
    triggerKind: form.triggerKind,
    triggerTurnInterval: form.triggerKind === "turn-interval" ? clamp(form.triggerTurnInterval, 1, 200) : null,
    goal: form.actionType === "continue-session" ? form.goal.trim() : null,
    acceptanceCriteria: form.actionType === "continue-session" ? form.acceptanceCriteria.trim() || null : null,
    status: form.status,
    workspaceId: form.workspaceId ?? fallbackWorkspaceId,
    targetSessionMode,
    targetSessionId: targetSessionMode === "existing-session" ? form.targetSessionId || null : null,
    targetSessionTitle: targetSessionMode === "new-session" ? form.targetSessionTitle.trim() || form.title.trim() || null : null,
    maxTurns: clamp(form.maxTurns, 1, 50),
    maxDurationMinutes: clamp(form.maxDurationMinutes, 5, 720),
  };
}

function fromGoalAutomation(item: GoalAutomationRule, fallbackWorkspaceId: string | null): GoalFormState {
  return {
    title: item.title,
    actionType: item.actionType,
    triggerKind: item.trigger.kind,
    triggerTurnInterval: item.trigger.turnInterval ?? 20,
    goal: item.goal ?? "",
    acceptanceCriteria: item.acceptanceCriteria ?? "",
    status: item.status,
    workspaceId: item.workspaceId ?? fallbackWorkspaceId,
    targetSessionMode: item.targetSessionMode,
    targetSessionId: item.targetSessionMode === "existing-session" ? item.sessionId ?? "" : "",
    targetSessionTitle: item.targetSessionMode === "new-session" ? item.sessionTitle ?? item.title : item.sessionTitle ?? "",
    maxTurns: item.maxTurns,
    maxDurationMinutes: item.maxDurationMinutes,
  };
}

function describeSchedule(rrule: string, language: AppLanguage) {
  const parts = new Map(rrule.split(";").map((part) => part.split("=") as [string, string]));

  if (parts.get("FREQ") === "HOURLY") {
    const interval = parts.get("INTERVAL") ?? "1";
    return language === "zh" ? `每 ${interval} 小时运行一次` : `Runs every ${interval} hours`;
  }

  const days = (parts.get("BYDAY") ?? "")
    .split(",")
    .filter(Boolean)
    .map((day) => WEEK_DAYS.find((item) => item.key === day))
    .filter(Boolean)
    .map((day) => (language === "zh" ? day!.zh : day!.en));
  const hour = String(parts.get("BYHOUR") ?? "0").padStart(2, "0");
  const minute = String(parts.get("BYMINUTE") ?? "0").padStart(2, "0");
  return language === "zh"
    ? `每周 ${days.join("、")} ${hour}:${minute} 运行`
    : `Runs on ${days.join(", ")} at ${hour}:${minute}`;
}

function mapCodexAutomation(item: CodexAutomation, language: AppLanguage): AutomationListItem {
  return {
    kind: "codex",
    id: item.id,
    name: item.name,
    status: item.status,
    filterStatus: item.status,
    statusLabel: item.status === "PAUSED" ? "paused" : "active",
    scheduleLabel: describeSchedule(item.rrule, language),
    description: item.prompt,
    sourceLabel: language === "zh" ? "codex 自动化" : "codex automation",
    typeLabel: item.rrule.includes("FREQ=HOURLY")
      ? (language === "zh" ? "时间调度 / 小时间隔" : "schedule / hourly")
      : (language === "zh" ? "时间调度 / 每周时刻" : "schedule / weekly"),
    workspaceLabel: item.cwds.join(", ") || "-",
    lastLabel: formatTimestamp(item.lastRunAt, language),
    nextLabel: formatTimestamp(item.nextRunAt, language),
    runtimeLabel: null,
    sessionLabel: null,
    raw: item,
  };
}

function mapInternalRule(item: AutomationRule, language: AppLanguage, workspaceLabels: Map<string, string>): AutomationListItem {
  const runtimeLabel = formatGoalRuntimeLabel(item, language);

  return {
    kind: "internal",
    id: item.id,
    name: item.title,
    status: item.status === "paused" ? "PAUSED" : "ACTIVE",
    filterStatus: item.status === "paused" ? "PAUSED" : "ACTIVE",
    statusLabel: item.status === "paused" ? "paused" : "active",
    scheduleLabel: formatGoalTriggerSummary(item, language),
    description: formatInternalRuleDescription(item, language),
    sourceLabel: language === "zh" ? "relay 内部规则" : "relay internal rule",
    typeLabel: formatGoalActionTypeLabel(item.actionType, language),
    workspaceLabel: item.workspaceId ? workspaceLabels.get(item.workspaceId) ?? item.workspaceId : "-",
    lastLabel: item.lastRunAt ? formatAbsoluteString(item.lastRunAt, language) : language === "zh" ? "暂无记录" : "no data",
    nextLabel: formatGoalNextLabel(item, language),
    runtimeLabel,
    sessionLabel: item.sessionTitle,
    raw: item,
  };
}

function requiresExistingGoalSession(
  actionType: GoalFormState["actionType"],
  triggerKind: GoalFormState["triggerKind"],
) {
  return actionType === "generate-timeline-memory" || triggerKind === "turn-interval";
}

function formatGoalActionTypeLabel(
  actionType: GoalAutomationRule["actionType"],
  language: AppLanguage,
) {
  if (actionType === "generate-timeline-memory") {
    return language === "zh" ? "时间线记忆生成" : "timeline memory";
  }

  return language === "zh" ? "目标自动推进" : "goal loop";
}

function formatGoalTriggerSummary(
  input: Pick<GoalAutomationRule, "trigger" | "targetSessionMode">,
  language: AppLanguage,
) {
  if (input.trigger.kind === "turn-interval") {
    const interval = input.trigger.turnInterval ?? 1;
    return language === "zh" ? `每 ${interval} 轮触发一次` : `every ${interval} turns`;
  }

  return language === "zh"
    ? `手动启动 / ${input.targetSessionMode === "existing-session" ? "绑定现有会话" : "新建专用会话"}`
    : `manual / ${input.targetSessionMode === "existing-session" ? "existing session" : "new session"}`;
}

function formatInternalRuleDescription(item: GoalAutomationRule, language: AppLanguage) {
  if (item.actionType === "generate-timeline-memory") {
    if (item.trigger.kind === "turn-interval" && item.trigger.turnInterval) {
      return language === "zh"
        ? `为绑定会话每 ${item.trigger.turnInterval} 轮生成一次 timeline memory。`
        : `Generate a timeline memory for the bound session every ${item.trigger.turnInterval} turns.`;
    }

    return item.summary;
  }

  if (item.acceptanceCriteria) {
    return `${item.goal ?? item.summary}\n\n${language === "zh" ? "验收标准：" : "Acceptance criteria:"}\n${item.acceptanceCriteria}`;
  }

  return item.goal ?? item.summary;
}

function formatGoalNextLabel(item: GoalAutomationRule, language: AppLanguage) {
  if (item.runStatus === "running") {
    return language === "zh" ? "等待当前运行结束" : "waiting for current run";
  }

  if (item.trigger.kind === "turn-interval") {
    const interval = item.trigger.turnInterval ?? 1;
    return language === "zh"
      ? `等待下一个 ${interval} 轮触发点`
      : `waiting for the next ${interval}-turn checkpoint`;
  }

  return language === "zh" ? "手动启动" : "start manually";
}

function mapCodexRun(run: CodexAutomationRun): AutomationRunViewItem {
  return {
    id: run.threadId,
    automationId: run.automationId,
    source: "codex",
    status: run.status.toUpperCase(),
    title: run.title,
    summary: run.summary,
    output: run.output,
    prompt: run.prompt,
    sourceLabel: "codex automation",
    sourceContext: run.sourceCwd,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function mapGoalRun(run: GoalAutomationRunRecord, fallbackTitle: string, language: AppLanguage): AutomationRunViewItem {
  return {
    id: run.id,
    automationId: run.ruleId,
    source: "internal",
    status: run.status.toUpperCase(),
    title: run.sessionTitle ?? fallbackTitle,
    summary: run.summary ?? run.lastEvaluationReason,
    output: run.output,
    prompt: run.steps[0]?.prompt ?? null,
    sourceLabel: language === "zh" ? "relay 内部规则" : "relay internal rule",
    sourceContext: run.sessionTitle ?? run.sessionId ?? null,
    createdAt: Date.parse(run.startedAt),
    updatedAt: Date.parse(run.updatedAt),
  };
}

function matchesFilter(item: AutomationListItem, filter: FilterKey) {
  if (filter === "all") {
    return true;
  }
  if (filter === "internal") {
    return item.kind === "internal";
  }
  if (filter === "codex") {
    return item.kind === "codex";
  }
  if (filter === "active") {
    return item.filterStatus === "ACTIVE";
  }
  if (filter === "paused") {
    return item.filterStatus === "PAUSED";
  }
  return true;
}

function formatGoalStopReason(value: GoalAutomationRule["stopReason"], language: AppLanguage) {
  if (value === "completed") {
    return language === "zh" ? "目标已完成" : "completed";
  }
  if (value === "max_turns_reached") {
    return language === "zh" ? "达到最大轮次" : "max turns reached";
  }
  if (value === "max_duration_reached") {
    return language === "zh" ? "达到最长运行时长" : "max duration reached";
  }
  if (value === "stopped_by_user") {
    return language === "zh" ? "已手动停止" : "stopped by user";
  }
  if (value === "failed") {
    return language === "zh" ? "运行失败" : "failed";
  }
  return null;
}

function formatGoalRuntimeLabel(item: GoalAutomationRule, language: AppLanguage) {
  if (item.actionType !== "continue-session") {
    const conclusion = item.lastEvaluationReason ?? item.lastError ?? item.lastAssistantSummary ?? null;

    if (item.stopReason === "failed" || item.runStatus === "failed") {
      return joinGoalRuntimeParts([
        language === "zh" ? "最近执行失败" : "last run failed",
        conclusion,
      ]);
    }

    if (item.lastRunAt) {
      return joinGoalRuntimeParts([
        language === "zh" ? "最近执行完成" : "last run completed",
        conclusion,
      ]);
    }

    return item.trigger.kind === "turn-interval"
      ? (language === "zh"
          ? `尚未触发 · 每 ${item.trigger.turnInterval ?? 1} 轮自动执行`
          : `not triggered yet · runs every ${item.trigger.turnInterval ?? 1} turns`)
      : (language === "zh" ? "尚未运行 · 可手动执行" : "not run yet · can be started manually");
  }

  const progress = formatGoalTurnProgress(item, language);
  const conclusion = item.lastEvaluationReason ?? item.lastError ?? item.lastAssistantSummary ?? null;

  if (item.runStatus === "running") {
    return joinGoalRuntimeParts(
      [
        language === "zh" ? "运行中" : "running",
        progress,
        conclusion,
      ],
    );
  }

  if (item.stopReason) {
    return joinGoalRuntimeParts([
      formatGoalStopReason(item.stopReason, language),
      progress,
      conclusion,
    ]);
  }

  if (item.currentTurnCount > 0) {
    return joinGoalRuntimeParts([
      language === "zh" ? "已结束" : "finished",
      progress,
      conclusion,
    ]);
  }

  return language === "zh"
    ? `尚未运行 · 最多 ${item.maxTurns} 轮 / ${item.maxDurationMinutes} 分钟`
    : `not run yet · up to ${item.maxTurns} turns / ${item.maxDurationMinutes} minutes`;
}

function formatGoalTurnProgress(item: GoalAutomationRule, language: AppLanguage) {
  if (item.currentTurnCount <= 0) {
    return language === "zh" ? "0 轮进展" : "0 turns";
  }

  return language === "zh"
    ? `第 ${item.currentTurnCount}/${item.maxTurns} 轮`
    : `turn ${item.currentTurnCount}/${item.maxTurns}`;
}

function joinGoalRuntimeParts(parts: Array<string | null>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ");
}

function formatTimestamp(value: number | null, language: AppLanguage) {
  if (!value) {
    return language === "zh" ? "暂无记录" : "no data";
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDateTime(value: number, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatAbsoluteString(value: string, language: AppLanguage) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getRunPreview(run: AutomationRunViewItem, language: AppLanguage) {
  const source = run.summary?.trim() || run.output?.replace(/\s+/g, " ").trim() || "";
  if (!source) {
    return language === "zh" ? "暂无输出内容。" : "No output.";
  }
  return source.length > 180 ? `${source.slice(0, 180)}...` : source;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
