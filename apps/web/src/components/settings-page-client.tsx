"use client";

import { useEffect, useState, useTransition } from "react";

import type { RelayCloudDevice, RelayDevice, RelayDeviceConnectionStatus, RelayDeviceDirectory } from "@relay/shared-types";
import { useRouter } from "next/navigation";
import type { RelayAuthSessionResponse } from "@/lib/auth/types";
import { loadBridgeRouteStatus, type BridgeRouteStatus } from "@/lib/api/bridge-route-status";
import { deleteCloudDevice, loadDeviceDirectory, setDefaultDevice } from "@/lib/api/cloud-devices";
import { getRelayDeviceConnectionStatus, pingRelayDevice } from "@/lib/api/realtime-relay";
import { ensureCurrentGitHubDeviceReady } from "@/lib/auth/device-bootstrap";
import { toErrorMessage } from "@/lib/errors";
import { getMessages } from "@/config/messages";
import type { AppLanguage, AppTheme, UiConfig } from "@/config/ui.config";

type SettingsPageClientProps = {
  language: AppLanguage;
};

type SettingsTab = "account" | "appearance";

type UiConfigApiResponse = {
  content?: string;
  uiConfig?: UiConfig;
  cssVariables?: Record<string, string>;
};

type LocalDeviceApiResponse = {
  item: RelayDevice;
};

function applyUiConfigToDocument(uiConfig?: UiConfig, cssVariables?: Record<string, string>) {
  if (typeof document === "undefined" || !uiConfig || !cssVariables) {
    return;
  }

  const html = document.documentElement;
  const body = document.body;
  const nextTheme: AppTheme = uiConfig.theme;

  html.dataset.theme = nextTheme;
  html.lang = uiConfig.language === "zh" ? "zh-CN" : "en";
  html.style.colorScheme = nextTheme === "dark" ? "dark" : "light";

  for (const [name, value] of Object.entries(cssVariables)) {
    if (typeof value === "string") {
      body.style.setProperty(name, value);
    }
  }
}

function isCurrentLocalCloudDevice(cloudDevice: RelayCloudDevice, localDevice: RelayDevice | null) {
  return localDevice !== null && cloudDevice.localDeviceId === localDevice.id;
}

function isCloudWebSession(
  authSession: RelayAuthSessionResponse["session"] | null,
  localDevice: RelayDevice | null,
  deviceDirectory: RelayDeviceDirectory | null,
) {
  return authSession?.method === "github" && localDevice === null && deviceDirectory !== null;
}

function isHistoricalCloudDevice(cloudDevice: RelayCloudDevice, localDevice: RelayDevice | null, isDefault: boolean) {
  if (cloudDevice.status !== "offline" || isDefault || localDevice === null) {
    return false;
  }

  return cloudDevice.hostname === localDevice.hostname || cloudDevice.name === localDevice.name;
}

export function SettingsPageClient({ language }: SettingsPageClientProps) {
  const router = useRouter();
  const messages = getMessages(language);
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [appearanceContent, setAppearanceContent] = useState("");
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const [appearanceDirty, setAppearanceDirty] = useState(false);
  const [appearanceState, setAppearanceState] = useState<
    "idle" | "saving" | "resetting" | "saved" | "error"
  >("idle");
  const [authSession, setAuthSession] = useState<RelayAuthSessionResponse["session"] | null>(null);
  const [bindError, setBindError] = useState<string | null>(null);
  const [bindState, setBindState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [bridgeRoute, setBridgeRoute] = useState<BridgeRouteStatus | null>(null);
  const [defaultDeviceState, setDefaultDeviceState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [defaultDeviceTargetId, setDefaultDeviceTargetId] = useState<string | null>(null);
  const [deleteDeviceState, setDeleteDeviceState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [deleteDeviceTargetId, setDeleteDeviceTargetId] = useState<string | null>(null);
  const [deviceDirectory, setDeviceDirectory] = useState<RelayDeviceDirectory | null>(null);
  const [deviceDirectoryFeedback, setDeviceDirectoryFeedback] = useState<string | null>(null);
  const [deviceDirectoryState, setDeviceDirectoryState] = useState<"idle" | "loading" | "error">("idle");
  const [identityState, setIdentityState] = useState<"idle" | "loading" | "error">("idle");
  const [localDevice, setLocalDevice] = useState<RelayDevice | null>(null);
  const [logoutState, setLogoutState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [realtimeFeedback, setRealtimeFeedback] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<"idle" | "loading" | "error">("idle");
  const [realtimeStatus, setRealtimeStatus] = useState<RelayDeviceConnectionStatus | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [pingState, setPingState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadAppearance() {
      try {
        const response = await fetch("/api/ui-config", { cache: "no-store" });
        const data = (await response.json()) as UiConfigApiResponse;

        if (!cancelled && typeof data.content === "string") {
          setAppearanceContent(data.content);
          setAppearanceLoaded(true);
          setAppearanceDirty(false);
          setAppearanceState("idle");
          applyUiConfigToDocument(data.uiConfig, data.cssVariables);
        }
      } catch {
        if (!cancelled) {
          setAppearanceState("error");
        }
      }
    }

    void loadAppearance();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      setIdentityState("loading");
      setDeviceDirectoryFeedback(null);

      try {
        const [authResult, deviceResult] = await Promise.allSettled([
          fetch("/api/auth/session", { cache: "no-store" }),
          fetch("/api/bridge/device", { cache: "no-store" }),
        ]);

        if (authResult.status !== "fulfilled" || !authResult.value.ok) {
          throw new Error("Failed to load auth session");
        }

        const authData = (await authResult.value.json()) as RelayAuthSessionResponse;
        const deviceData =
          deviceResult.status === "fulfilled" && deviceResult.value.ok
            ? ((await deviceResult.value.json()) as LocalDeviceApiResponse)
            : null;

        if (cancelled) {
          return;
        }

        setAuthSession(authData.session);
        setLocalDevice(deviceData?.item ?? null);
        setIdentityState("idle");
        setDefaultDeviceState("idle");

        if (authData.session?.method === "github" && authData.session.userId) {
          setDeviceDirectoryState("loading");

          try {
            const directory = await loadDeviceDirectory();

            if (cancelled) {
              return;
            }

            setDeviceDirectory(directory);
            setDeviceDirectoryState("idle");
            if (!deviceData) {
              setDeviceDirectoryFeedback(
                language === "zh"
                  ? "当前运行在云端 Web 环境，无法直接读取这台机器的本机 Relay 状态。账号态与云端设备目录已正常加载。"
                  : "This web session is running in the cloud, so the local Relay state for this machine is unavailable. Account state and the cloud device directory loaded correctly.",
              );
            }
          } catch (error) {
            if (!cancelled) {
              setDeviceDirectory(null);
              setDeviceDirectoryState("error");
              setDeviceDirectoryFeedback(toErrorMessage(error, messages.settings.devicesLoadFailed));
            }
          }
        } else {
          setDeviceDirectory(null);
          setDeviceDirectoryState("idle");
          setDeviceDirectoryFeedback(null);
        }
      } catch {
        if (!cancelled) {
          setIdentityState("error");
        }
      }
    }

    void loadIdentity();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshDeviceDirectory() {
    if (authSession?.method !== "github" || !authSession.userId) {
      setDeviceDirectory(null);
      setDeviceDirectoryState("idle");
      setDefaultDeviceState("idle");
      return;
    }

    setDeviceDirectoryState("loading");
    setDefaultDeviceState("idle");

    try {
      const [directory, routeStatus] = await Promise.all([loadDeviceDirectory(), loadBridgeRouteStatus().catch(() => null)]);
      setDeviceDirectory(directory);
      setBridgeRoute(routeStatus);
      setDeviceDirectoryState("idle");
    } catch (error) {
      setDeviceDirectory(null);
      setDeviceDirectoryState("error");
      setDeviceDirectoryFeedback(toErrorMessage(error, messages.settings.devicesLoadFailed));
    }
  }

  const targetDeviceId = deviceDirectory?.defaultDeviceId ?? null;

  async function refreshRealtimeStatus(deviceId = targetDeviceId) {
    if (authSession?.method !== "github" || !authSession.userId || !deviceId) {
      setRealtimeStatus(null);
      setRealtimeState("idle");
      return;
    }

    setRealtimeState("loading");

    try {
      const status = await getRelayDeviceConnectionStatus(deviceId);
      setRealtimeStatus(status);
      setRealtimeState("idle");
    } catch (error) {
      setRealtimeStatus(null);
      setRealtimeState("error");
      setRealtimeFeedback(toErrorMessage(error, messages.settings.channelStatusFailed));
    }
  }

  async function refreshBridgeRouteStatus() {
    if (authSession?.method !== "github" || !authSession.userId) {
      setBridgeRoute(null);
      return;
    }

    try {
      setBridgeRoute(await loadBridgeRouteStatus());
    } catch {
      setBridgeRoute(null);
    }
  }

  async function handleAppearanceSave() {
    setAppearanceState("saving");

    try {
      const response = await fetch("/api/ui-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: appearanceContent }),
      });

      if (!response.ok) {
        throw new Error("Save failed");
      }

      const data = (await response.json()) as UiConfigApiResponse;
      applyUiConfigToDocument(data.uiConfig, data.cssVariables);
      setAppearanceDirty(false);
      setAppearanceState("saved");
      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setAppearanceState("error");
    }
  }

  async function handleAppearanceReset() {
    setAppearanceState("resetting");

    try {
      const response = await fetch("/api/ui-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });

      if (!response.ok) {
        throw new Error("Reset failed");
      }

      const data = (await response.json()) as UiConfigApiResponse;

      if (typeof data.content === "string") {
        setAppearanceContent(data.content);
      }

      applyUiConfigToDocument(data.uiConfig, data.cssVariables);
      setAppearanceDirty(false);
      setAppearanceState("saved");
      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setAppearanceState("error");
    }
  }

  async function handleLogout() {
    setLogoutState("submitting");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      setLogoutState("done");
      router.push("/login");
      router.refresh();
    } catch {
      setLogoutState("error");
    }
  }

  async function handlePingDefaultDevice() {
    if (authSession?.method !== "github" || !authSession.userId || !targetDeviceId) {
      setPingState("error");
      setRealtimeFeedback(messages.settings.channelRequiresGithub);
      return;
    }

    setPingState("submitting");
    setRealtimeFeedback(null);

    try {
      const result = await pingRelayDevice(targetDeviceId);
      setPingState("done");
      setRealtimeFeedback(`${messages.settings.pingSucceeded} · ${result.name} · ${result.hostname}`);
      await refreshRealtimeStatus(targetDeviceId);
    } catch (error) {
      setPingState("error");
      setRealtimeFeedback(toErrorMessage(error, messages.settings.pingFailed));
      await refreshRealtimeStatus(targetDeviceId);
    }
  }

  async function handleBindCurrentDevice() {
    if (!authSession?.userId || authSession.method !== "github") {
      setBindState("error");
      setBindError(messages.settings.bindErrorPasswordOnly);
      return;
    }

    if (!localDevice) {
      setBindState("error");
      setBindError(messages.settings.error);
      return;
    }

    setBindState("submitting");
    setBindError(null);

    try {
      const result = await ensureCurrentGitHubDeviceReady();
      setLocalDevice(result.localDevice);
      setDeviceDirectory(result.directory);
      await refreshBridgeRouteStatus();
      setDeviceDirectoryState("idle");
      setDefaultDeviceState(result.didSetDefault ? "done" : "idle");
      setDeleteDeviceState("idle");
      setDeviceDirectoryFeedback(result.didSetDefault ? messages.settings.defaultSaved : null);
      setBindState("done");
      setRealtimeFeedback(null);
    } catch (error) {
      console.error("Device binding failed.", error);
      setBindState("error");
      setBindError(toErrorMessage(error, messages.settings.bindFailed));
    }
  }

  async function handleSetDefaultDevice(deviceId: string) {
    if (authSession?.method !== "github" || !authSession.userId) {
      setDefaultDeviceState("error");
      setDeviceDirectoryFeedback(messages.settings.devicesGithubOnly);
      return;
    }

    setDefaultDeviceState("submitting");
    setDefaultDeviceTargetId(deviceId);
    setDeviceDirectoryFeedback(null);

    try {
      const defaultDeviceId = await setDefaultDevice(deviceId);
      setDeviceDirectory((current) =>
        current
          ? {
              ...current,
              defaultDeviceId,
            }
          : current,
      );
      setDefaultDeviceState("done");
      setDeleteDeviceState("idle");
      setDeviceDirectoryFeedback(messages.settings.defaultSaved);
      setRealtimeFeedback(null);
      await refreshBridgeRouteStatus();
      await refreshRealtimeStatus(defaultDeviceId);
    } catch (error) {
      setDefaultDeviceState("error");
      setDeviceDirectoryFeedback(toErrorMessage(error, messages.settings.defaultDeviceFailed));
    } finally {
      setDefaultDeviceTargetId(null);
    }
  }

  async function handleDeleteDevice(deviceId: string) {
    if (authSession?.method !== "github" || !authSession.userId) {
      setDeleteDeviceState("error");
      setDeviceDirectoryFeedback(messages.settings.devicesGithubOnly);
      return;
    }

    setDeleteDeviceState("submitting");
    setDeleteDeviceTargetId(deviceId);
    setDeviceDirectoryFeedback(null);

    try {
      const deletedDeviceId = await deleteCloudDevice(deviceId);
      setDeviceDirectory((current) =>
        current
          ? {
              ...current,
              items: current.items.filter((item) => item.id !== deletedDeviceId),
            }
          : current,
      );
      await refreshBridgeRouteStatus();
      setDeleteDeviceState("done");
      setDeviceDirectoryFeedback(messages.settings.deleteDeviceSucceeded);
    } catch (error) {
      setDeleteDeviceState("error");
      setDeviceDirectoryFeedback(toErrorMessage(error, messages.settings.deleteDeviceFailed));
    } finally {
      setDeleteDeviceTargetId(null);
    }
  }

  const bindingStatusLabel =
    localDevice?.bindingStatus === "bound"
      ? messages.settings.bound
      : localDevice
        ? messages.settings.unbound
        : authSession?.method === "github" && deviceDirectory !== null
          ? messages.settings.localRelayUnavailable
        : identityState === "loading"
          ? messages.settings.loading
          : messages.settings.error;
  const authMethodLabel =
    authSession?.method === "github"
      ? messages.settings.githubProvider
      : authSession?.method === "password"
        ? messages.settings.passwordProvider
        : identityState === "loading"
          ? messages.settings.loading
          : "—";
  const devicePlatformLabel =
    localDevice ? `${localDevice.platform} / ${localDevice.arch}` : identityState === "loading" ? messages.settings.loading : "—";
  const canBindCurrentDevice =
    identityState !== "loading" &&
    bindState !== "submitting" &&
    authSession?.method === "github" &&
    authSession.userId !== null &&
    localDevice !== null &&
    !(localDevice.bindingStatus === "bound" && localDevice.boundUserId === authSession.userId);
  const bindButtonLabel =
    bindState === "submitting"
      ? messages.settings.binding
      : localDevice?.bindingStatus === "bound" && localDevice?.boundUserId === authSession?.userId
        ? messages.settings.bindSucceeded
        : messages.settings.bindCurrentDevice;
  const deviceDirectoryStatusLabel =
    deviceDirectoryState === "loading"
      ? messages.settings.loading
      : defaultDeviceState === "submitting"
        ? messages.settings.settingDefault
        : deleteDeviceState === "submitting"
          ? messages.settings.deletingDevice
        : defaultDeviceState === "done"
          ? messages.settings.defaultSaved
          : deleteDeviceState === "done"
            ? messages.settings.deleteDeviceSucceeded
        : deviceDirectoryState === "error" || defaultDeviceState === "error" || deleteDeviceState === "error"
            ? messages.settings.error
            : messages.settings.synced;
  const defaultCloudDevice =
    deviceDirectory?.items.find((item) => item.id === deviceDirectory.defaultDeviceId) ?? null;
  const currentCloudDevice =
    deviceDirectory?.items.find((item) => item.localDeviceId === localDevice?.id) ?? null;
  const isUsingCurrentDeviceFallback =
    bridgeRoute?.kind === "local" &&
    (bridgeRoute.reason === "default_device_offline_using_local" ||
      bridgeRoute.reason === "default_device_missing_using_local");
  const isCloudSession = isCloudWebSession(authSession, localDevice, deviceDirectory);
  const defaultDeviceName = defaultCloudDevice?.name ?? messages.settings.notSet;
  const deviceCountLabel =
    deviceDirectoryState === "loading"
      ? messages.settings.loading
      : deviceDirectory
        ? `${deviceDirectory.items.length}`
        : messages.settings.notSet;
  const localDeviceSummaryLabel =
    localDevice?.name
      ?? (identityState === "loading"
        ? messages.settings.loading
        : isCloudSession
          ? messages.settings.cloudSession
          : messages.settings.notSet);
  const defaultDeviceSummaryLabel =
    deviceDirectoryState === "loading" && !deviceDirectory ? messages.settings.loading : defaultDeviceName;
  const realtimeStatusLabel =
    realtimeState === "loading"
      ? messages.settings.loading
      : isUsingCurrentDeviceFallback
        ? messages.settings.channelFallback
      : pingState === "submitting"
        ? messages.settings.pinging
        : !targetDeviceId
          ? messages.settings.notSet
          : realtimeStatus?.connected
            ? messages.settings.channelConnected
            : messages.settings.channelDisconnected;
  const realtimeHint =
    authSession?.method !== "github"
      ? messages.settings.channelRequiresGithub
      : isUsingCurrentDeviceFallback
        ? messages.settings.channelFallbackHint
      : !targetDeviceId
        ? messages.settings.channelNeedsDefaultDevice
        : realtimeStatus?.connected
          ? messages.settings.channelConnectedHint
          : messages.settings.channelDisconnectedHint;
  const devicesPanelHint = isUsingCurrentDeviceFallback
    ? messages.settings.devicesAutoRecoveredHint
    : messages.settings.devicesHint;
  const sortedCloudDevices = [...(deviceDirectory?.items ?? [])].sort((left, right) => {
    const leftScore =
      (isCurrentLocalCloudDevice(left, localDevice) ? 100 : 0) +
      (deviceDirectory?.defaultDeviceId === left.id ? 10 : 0) +
      (left.status === "online" ? 1 : 0);
    const rightScore =
      (isCurrentLocalCloudDevice(right, localDevice) ? 100 : 0) +
      (deviceDirectory?.defaultDeviceId === right.id ? 10 : 0) +
      (right.status === "online" ? 1 : 0);

    return rightScore - leftScore;
  });
  const historicalDevices = sortedCloudDevices.filter((device) =>
    isHistoricalCloudDevice(device, localDevice, deviceDirectory?.defaultDeviceId === device.id),
  );
  const otherDevices = sortedCloudDevices.filter((device) => {
    const isDefault = deviceDirectory?.defaultDeviceId === device.id;
    const isCurrent = isCurrentLocalCloudDevice(device, localDevice);

    return !isDefault && !isCurrent && !isHistoricalCloudDevice(device, localDevice, isDefault);
  });
  const canSetCurrentAsDefault =
    authSession?.method === "github" &&
    !!currentCloudDevice &&
    currentCloudDevice.id !== deviceDirectory?.defaultDeviceId &&
    defaultDeviceState !== "submitting" &&
    deleteDeviceState !== "submitting";
  const localDeviceSummaryMeta =
    localDevice
      ? bindingStatusLabel
      : isCloudSession
        ? messages.settings.localRelayUnavailable
        : identityState === "loading"
          ? messages.settings.loading
          : messages.settings.notSet;
  const loginSummaryLabel =
    authSession?.method === "github"
      ? messages.settings.githubSignedIn
      : authSession?.method === "password"
        ? messages.settings.passwordSession
        : identityState === "loading"
          ? messages.settings.loading
          : messages.settings.notSignedIn;
  const currentDeviceCardTitle =
    isUsingCurrentDeviceFallback
      ? messages.settings.currentDeviceRecovered
      : localDevice
        ? messages.settings.currentDeviceReady
        : isCloudSession
          ? messages.settings.cloudSession
          : messages.settings.currentDeviceUnavailable;
  const currentDeviceCardHint =
    isUsingCurrentDeviceFallback
      ? messages.settings.devicesAutoRecoveredHint
      : localDevice
        ? localDeviceSummaryMeta
        : isCloudSession
          ? messages.settings.localRelayUnavailableDetail
          : messages.settings.currentDeviceUnavailableHint;
  const defaultDeviceCardHint =
    defaultCloudDevice
      ? defaultCloudDevice.status === "online"
        ? messages.settings.defaultDeviceOnlineHint
        : messages.settings.defaultDeviceOfflineHint
      : messages.settings.defaultDeviceHint;
  const deviceDirectorySummary =
    deviceDirectoryState === "loading"
      ? messages.settings.loading
      : historicalDevices.length > 0
        ? messages.settings.historyDeviceSummary(historicalDevices.length)
        : messages.settings.devicesHint;
  const accountAndDeviceHint =
    identityState === "loading"
      ? messages.settings.loading
      : authSession?.method === "password"
        ? messages.settings.accountAndDeviceHintPassword
        : isCloudSession
          ? messages.settings.cloudSessionHint
        : authSession?.method === "github" && localDevice?.bindingStatus === "bound" && localDevice.boundUserId === authSession.userId
          ? messages.settings.accountAndDeviceHintBound
          : authSession?.method === "github" && deviceDirectoryState === "loading"
            ? messages.settings.accountAndDeviceHintGithubLoading
            : messages.settings.accountAndDeviceHint;
  const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "account", label: messages.settings.accountAndDevice },
    { id: "appearance", label: messages.settings.appearanceTab },
  ];

  function renderCloudDeviceCard(device: RelayCloudDevice, { historical = false }: { historical?: boolean } = {}) {
    const isDefault = deviceDirectory?.defaultDeviceId === device.id;
    const isCurrent = isCurrentLocalCloudDevice(device, localDevice);
    const isSettingDefault = defaultDeviceState === "submitting" && defaultDeviceTargetId === device.id;
    const isDeleting = deleteDeviceState === "submitting" && deleteDeviceTargetId === device.id;
    const canDeleteHistoryDevice = historical && device.status === "offline" && !isDefault && !isCurrent;

    return (
      <article className={`settings-device-card ${historical ? "settings-device-card-muted" : ""}`} key={device.id}>
        <div className="settings-device-card-main">
          <div className="settings-device-card-head">
            <strong className="settings-device-card-title">{device.name}</strong>
            <div className="settings-device-card-badges">
              <span className="settings-device-badge">{device.status === "online" ? messages.settings.online : messages.settings.offline}</span>
              {isCurrent ? <span className="settings-device-badge">{messages.settings.currentMachine}</span> : null}
              {isDefault ? <span className="settings-device-badge settings-device-badge-accent">{messages.settings.defaultDevice}</span> : null}
              {historical ? <span className="settings-device-badge">{messages.settings.historyDevice}</span> : null}
            </div>
          </div>
          <p className="settings-device-card-meta">
            {device.hostname} · {device.platform} / {device.arch}
          </p>
          <p className="settings-device-card-meta settings-device-card-meta-soft">
            {historical ? messages.settings.historyDeviceHint : messages.settings.otherDeviceHint}
          </p>
        </div>
        <div className="settings-device-card-actions">
          {!historical ? (
            <button
              className="settings-save"
              disabled={isDefault || defaultDeviceState === "submitting" || deleteDeviceState === "submitting"}
              onClick={() => void handleSetDefaultDevice(device.id)}
              type="button"
            >
              {isSettingDefault
                ? messages.settings.settingDefault
                : isDefault
                  ? messages.settings.defaultSelected
                  : messages.settings.setDefaultDevice}
            </button>
          ) : canDeleteHistoryDevice ? (
            <button
              className="settings-reset"
              disabled={isDeleting || defaultDeviceState === "submitting" || deleteDeviceState === "submitting"}
              onClick={() => void handleDeleteDevice(device.id)}
              type="button"
            >
              {isDeleting ? messages.settings.deletingDevice : messages.settings.deleteHistoryDevice}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  useEffect(() => {
    setRealtimeFeedback(null);
    setPingState("idle");

    if (authSession?.method !== "github" || !authSession.userId || !targetDeviceId) {
      setRealtimeStatus(null);
      setRealtimeState("idle");
      return;
    }

    void refreshRealtimeStatus(targetDeviceId);
  }, [authSession?.method, authSession?.userId, targetDeviceId]);

  useEffect(() => {
    if (authSession?.method !== "github" || !authSession.userId) {
      setBridgeRoute(null);
      return;
    }

    void refreshBridgeRouteStatus();
  }, [authSession?.method, authSession?.userId, deviceDirectory?.defaultDeviceId, localDevice?.id]);

  return (
    <section className="simple-page settings-page">
      <div className="simple-page-body settings-page-body">
        <div className="settings-page-head">
          <div className="settings-page-head-main">
            <span className="eyebrow">{messages.settings.pageEyebrow}</span>
            <p className="settings-page-lead">{messages.settings.titleLead}</p>
          </div>
        </div>

        <div className="settings-tabs" role="tablist" aria-label={messages.settings.accountAndDevice}>
          {settingsTabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.id}
              className={`settings-tab ${activeTab === tab.id ? "settings-tab-active" : ""}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "account" ? (
          <>
            <section className="settings-overview-grid" aria-label={messages.settings.overview}>
              <article className="settings-overview-card">
                <span className="settings-overview-label">{messages.settings.loginStatus}</span>
                <strong className="settings-overview-value">{loginSummaryLabel}</strong>
                <p className="settings-overview-meta">{authMethodLabel}</p>
              </article>
              <article className="settings-overview-card">
                <span className="settings-overview-label">{messages.settings.currentConnection}</span>
                <strong className="settings-overview-value">{localDeviceSummaryLabel}</strong>
                <p className="settings-overview-meta">{currentDeviceCardTitle}</p>
              </article>
              <article className="settings-overview-card">
                <span className="settings-overview-label">{messages.settings.defaultDevice}</span>
                <strong className="settings-overview-value">{defaultDeviceSummaryLabel}</strong>
                <p className="settings-overview-meta">{defaultDeviceCardHint}</p>
              </article>
              <article className="settings-overview-card">
                <span className="settings-overview-label">{messages.settings.devices}</span>
                <strong className="settings-overview-value">{deviceCountLabel}</strong>
                <p className="settings-overview-meta">{deviceDirectorySummary}</p>
              </article>
            </section>

            <section className="settings-panel settings-panel-stack">
              <div className="settings-panel-head">
                <span>{messages.settings.accountAndDevice}</span>
                <div className="settings-status">
                  <span>{deviceDirectoryStatusLabel}</span>
                </div>
              </div>
              <p className="settings-section-copy">{accountAndDeviceHint}</p>
              <div className="settings-device-list">
                <article className="settings-device-card">
                  <div className="settings-device-card-main">
                    <div className="settings-device-card-head">
                      <strong className="settings-device-card-title">{messages.settings.loginStatus}</strong>
                      <div className="settings-device-card-badges">
                        <span className="settings-device-badge">{authMethodLabel}</span>
                      </div>
                    </div>
                    <p className="settings-device-card-meta">{loginSummaryLabel}</p>
                    <p className="settings-device-card-meta settings-device-card-meta-soft">{accountAndDeviceHint}</p>
                  </div>
                  <div className="settings-device-card-actions">
                    {authSession?.method === "github" ? (
                      <button
                        className="settings-reset"
                        disabled={logoutState === "submitting"}
                        onClick={() => void handleLogout()}
                        type="button"
                      >
                        {logoutState === "submitting" ? messages.settings.loggingOut : messages.settings.logout}
                      </button>
                    ) : (
                      <button className="settings-save" onClick={() => router.push("/login")} type="button">
                        {messages.settings.loginGithub}
                      </button>
                    )}
                  </div>
                </article>

                <article className="settings-device-card">
                  <div className="settings-device-card-main">
                    <div className="settings-device-card-head">
                      <strong className="settings-device-card-title">{messages.settings.currentConnection}</strong>
                      <div className="settings-device-card-badges">
                        <span className="settings-device-badge">{bindingStatusLabel}</span>
                        {isUsingCurrentDeviceFallback ? (
                          <span className="settings-device-badge settings-device-badge-accent">{messages.settings.devicesAutoRecovered}</span>
                        ) : null}
                      </div>
                    </div>
                    <p className="settings-device-card-meta">{currentDeviceCardTitle}</p>
                    <p className="settings-device-card-meta settings-device-card-meta-soft">{currentDeviceCardHint}</p>
                  </div>
                  <div className="settings-device-card-actions settings-device-card-actions-stack">
                    <button
                      className="settings-save"
                      disabled={!canBindCurrentDevice}
                      onClick={() => void handleBindCurrentDevice()}
                      type="button"
                    >
                      {bindButtonLabel}
                    </button>
                    {canSetCurrentAsDefault ? (
                      <button
                        className="settings-reset"
                        disabled={!canSetCurrentAsDefault}
                        onClick={() => void handleSetDefaultDevice(currentCloudDevice.id)}
                        type="button"
                      >
                        {messages.settings.setDefaultDevice}
                      </button>
                    ) : null}
                  </div>
                </article>

                <article className="settings-device-card">
                  <div className="settings-device-card-main">
                    <div className="settings-device-card-head">
                      <strong className="settings-device-card-title">{messages.settings.defaultDevice}</strong>
                      <div className="settings-device-card-badges">
                        <span className="settings-device-badge">{realtimeStatusLabel}</span>
                        {defaultCloudDevice ? (
                          <span className="settings-device-badge settings-device-badge-accent">{defaultCloudDevice.name}</span>
                        ) : null}
                      </div>
                    </div>
                    <p className="settings-device-card-meta">{defaultDeviceSummaryLabel}</p>
                    <p className="settings-device-card-meta settings-device-card-meta-soft">{realtimeHint}</p>
                  </div>
                  <div className="settings-device-card-actions">
                    <button
                      className="settings-save"
                      disabled={
                        pingState === "submitting" ||
                        realtimeState === "loading" ||
                        authSession?.method !== "github" ||
                        !targetDeviceId
                      }
                      onClick={() => void handlePingDefaultDevice()}
                      type="button"
                    >
                      {pingState === "submitting" ? messages.settings.pinging : messages.settings.pingDefaultDevice}
                    </button>
                  </div>
                </article>
              </div>

              {bindState === "error" ? (
                <p className="settings-section-copy settings-section-copy-compact">{bindError ?? messages.settings.bindFailed}</p>
              ) : bindState === "done" ? (
                <p className="settings-section-copy settings-section-copy-compact">{messages.settings.bindSucceeded}</p>
              ) : null}

              {deviceDirectoryFeedback ? (
                <p className="settings-section-copy settings-section-copy-compact">{deviceDirectoryFeedback}</p>
              ) : null}

              {realtimeFeedback ? (
                <p className="settings-section-copy settings-section-copy-compact">{realtimeFeedback}</p>
              ) : null}
            </section>

            <section className="settings-panel">
              <div className="settings-panel-head">
                <span>{messages.settings.otherDevices}</span>
                <div className="settings-status">
                  <span>{deviceDirectoryStatusLabel}</span>
                </div>
              </div>
              <p className="settings-section-copy">{devicesPanelHint}</p>
              {authSession?.method !== "github" ? (
                <p className="settings-section-copy settings-section-copy-compact">{messages.settings.devicesGithubOnly}</p>
              ) : otherDevices.length > 0 ? (
                <div className="settings-device-list">
                  {otherDevices.map((device) => renderCloudDeviceCard(device))}
                </div>
              ) : (
                <p className="settings-section-copy settings-section-copy-compact">{messages.settings.noOtherDevices}</p>
              )}
              <div className="settings-editor-actions">
                <div className="settings-editor-actions-left">
                  <button
                    className="settings-reset"
                    disabled={
                      deviceDirectoryState === "loading" ||
                      defaultDeviceState === "submitting" ||
                      deleteDeviceState === "submitting" ||
                      authSession?.method !== "github"
                    }
                    onClick={() => void refreshDeviceDirectory()}
                    type="button"
                  >
                    {messages.settings.refreshDevices}
                  </button>
                </div>
              </div>
            </section>

            {historicalDevices.length > 0 ? (
              <section className="settings-panel">
                <div className="settings-panel-head">
                  <span>{messages.settings.historyDevices}</span>
                  <button
                    aria-expanded={historyExpanded}
                    className="settings-toggle"
                    onClick={() => setHistoryExpanded((current) => !current)}
                    type="button"
                  >
                    {historyExpanded ? messages.settings.hideHistoryDevices : messages.settings.showHistoryDevices}
                  </button>
                </div>
                <p className="settings-section-copy">{messages.settings.historyDevicesHint}</p>
                {historyExpanded ? (
                  <div className="settings-device-list">
                    {historicalDevices.map((device) => renderCloudDeviceCard(device, { historical: true }))}
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="settings-panel">
              <div className="settings-panel-head">
                <span>{messages.settings.advancedInfo}</span>
                <button
                  aria-expanded={advancedExpanded}
                  className="settings-toggle"
                  onClick={() => setAdvancedExpanded((current) => !current)}
                  type="button"
                >
                  {advancedExpanded ? messages.settings.hideAdvancedInfo : messages.settings.showAdvancedInfo}
                </button>
              </div>
              <p className="settings-section-copy">{messages.settings.advancedInfoHint}</p>
              {advancedExpanded ? (
                <dl className="settings-data-grid settings-data-grid-compact">
                  <dt>{messages.settings.userId}</dt>
                  <dd>{authSession?.userId ?? "—"}</dd>
                  <dt>{messages.settings.deviceId}</dt>
                  <dd>{localDevice?.id ?? "—"}</dd>
                  <dt>{messages.settings.devicePlatform}</dt>
                  <dd>{localDevice ? devicePlatformLabel : isCloudSession ? messages.settings.localRelayUnavailable : devicePlatformLabel}</dd>
                  <dt>{messages.settings.deviceBinding}</dt>
                  <dd>{localDevice ? bindingStatusLabel : isCloudSession ? messages.settings.localRelayUnavailable : bindingStatusLabel}</dd>
                  <dt>{messages.settings.hostname}</dt>
                  <dd>{localDevice?.hostname ?? defaultCloudDevice?.hostname ?? "—"}</dd>
                  <dt>{messages.settings.cloudLocalDeviceId}</dt>
                  <dd>{currentCloudDevice?.localDeviceId ?? "—"}</dd>
                </dl>
              ) : null}
            </section>
          </>
        ) : null}

        {activeTab === "appearance" ? (
          <section className="settings-panel settings-panel-editor">
            <div className="settings-panel-head">
              <span>{messages.settings.fileName}</span>
              <div className="settings-status">
                <span>
                  {appearanceState === "saving"
                    ? messages.settings.saving
                    : appearanceState === "resetting"
                      ? messages.settings.resetting
                      : appearanceState === "saved"
                        ? messages.settings.saved
                        : appearanceState === "error"
                          ? messages.settings.error
                          : appearanceDirty
                            ? messages.settings.modified
                            : messages.settings.synced}
                </span>
              </div>
            </div>
            <textarea
              className="settings-editor settings-editor-page"
              onChange={(event) => {
                setAppearanceContent(event.target.value);
                setAppearanceDirty(true);
                setAppearanceState("idle");
              }}
              spellCheck={false}
              value={appearanceContent}
            />
            <div className="settings-editor-actions">
              <div className="settings-editor-actions-left">
                <button
                  className="settings-save"
                  disabled={
                    !appearanceLoaded ||
                    !appearanceDirty ||
                    appearanceState === "saving" ||
                    appearanceState === "resetting"
                  }
                  onClick={() => void handleAppearanceSave()}
                  type="button"
                >
                  {messages.settings.save}
                </button>
                <button
                  className="settings-reset"
                  disabled={
                    !appearanceLoaded ||
                    appearanceState === "saving" ||
                    appearanceState === "resetting"
                  }
                  onClick={() => void handleAppearanceReset()}
                  type="button"
                >
                  {messages.settings.reset}
                </button>
              </div>
              <span>{isRefreshing ? messages.settings.refreshing : null}</span>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
