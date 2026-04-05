"use client";

import { useEffect, useState, useTransition } from "react";

import type { RelayCloudDevice, RelayDevice, RelayDeviceDirectory } from "@relay/shared-types";
import { useRouter } from "next/navigation";
import type { RelayAuthSessionResponse } from "@/lib/auth/types";
import { loadDeviceDirectory, setDefaultDevice } from "@/lib/api/cloud-devices";
import { ensureCurrentGitHubDeviceReady } from "@/lib/auth/device-bootstrap";
import { toErrorMessage } from "@/lib/errors";
import { getMessages } from "@/config/messages";
import type { AppLanguage, AppTheme, UiConfig } from "@/config/ui.config";

type SettingsPageClientProps = {
  language: AppLanguage;
};

type SettingsTab = "overview" | "devices" | "appearance" | "access";

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

export function SettingsPageClient({ language }: SettingsPageClientProps) {
  const router = useRouter();
  const messages = getMessages(language);
  const [activeTab, setActiveTab] = useState<SettingsTab>("overview");
  const [appearanceContent, setAppearanceContent] = useState("");
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const [appearanceDirty, setAppearanceDirty] = useState(false);
  const [appearanceState, setAppearanceState] = useState<
    "idle" | "saving" | "resetting" | "saved" | "error"
  >("idle");
  const [authSession, setAuthSession] = useState<RelayAuthSessionResponse["session"] | null>(null);
  const [bindError, setBindError] = useState<string | null>(null);
  const [bindState, setBindState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [defaultDeviceState, setDefaultDeviceState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [defaultDeviceTargetId, setDefaultDeviceTargetId] = useState<string | null>(null);
  const [deviceDirectory, setDeviceDirectory] = useState<RelayDeviceDirectory | null>(null);
  const [deviceDirectoryFeedback, setDeviceDirectoryFeedback] = useState<string | null>(null);
  const [deviceDirectoryState, setDeviceDirectoryState] = useState<"idle" | "loading" | "error">("idle");
  const [identityState, setIdentityState] = useState<"idle" | "loading" | "error">("idle");
  const [localDevice, setLocalDevice] = useState<RelayDevice | null>(null);
  const [logoutState, setLogoutState] = useState<"idle" | "submitting" | "done" | "error">("idle");
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
      const directory = await loadDeviceDirectory();
      setDeviceDirectory(directory);
      setDeviceDirectoryState("idle");
    } catch (error) {
      setDeviceDirectory(null);
      setDeviceDirectoryState("error");
      setDeviceDirectoryFeedback(toErrorMessage(error, messages.settings.devicesLoadFailed));
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
      setDeviceDirectoryState("idle");
      setDefaultDeviceState(result.didSetDefault ? "done" : "idle");
      setDeviceDirectoryFeedback(result.didSetDefault ? messages.settings.defaultSaved : null);
      setBindState("done");
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
      setDeviceDirectoryFeedback(messages.settings.defaultSaved);
    } catch (error) {
      setDefaultDeviceState("error");
      setDeviceDirectoryFeedback(toErrorMessage(error, messages.settings.defaultDeviceFailed));
    } finally {
      setDefaultDeviceTargetId(null);
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
        : defaultDeviceState === "done"
          ? messages.settings.defaultSaved
        : deviceDirectoryState === "error" || defaultDeviceState === "error"
            ? messages.settings.error
            : messages.settings.synced;
  const defaultCloudDevice =
    deviceDirectory?.items.find((item) => item.id === deviceDirectory.defaultDeviceId) ?? null;
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
  const localDeviceSummaryMeta =
    localDevice
      ? bindingStatusLabel
      : isCloudSession
        ? messages.settings.localRelayUnavailable
        : identityState === "loading"
          ? messages.settings.loading
          : messages.settings.notSet;
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
    { id: "overview", label: messages.settings.overviewTab },
    { id: "devices", label: messages.settings.devicesTab },
    { id: "appearance", label: messages.settings.appearanceTab },
    { id: "access", label: messages.settings.accessTab },
  ];

  return (
    <section className="simple-page settings-page">
      <div className="simple-page-body settings-page-body">
        <div className="settings-page-head">
          <div className="settings-page-head-main">
            <span className="eyebrow">{messages.settings.pageEyebrow}</span>
            <p className="settings-page-lead">{messages.settings.titleLead}</p>
          </div>
        </div>

        <div className="settings-tabs" role="tablist" aria-label={messages.settings.overview}>
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

        {activeTab === "overview" ? (
          <>
            <section className="settings-overview-grid" aria-label={messages.settings.overview}>
              <article className="settings-overview-card">
                <span className="settings-overview-label">{messages.settings.authMethod}</span>
                <strong className="settings-overview-value">{authMethodLabel}</strong>
                <p className="settings-overview-meta">{authSession?.userId ?? messages.settings.notSet}</p>
              </article>
              <article className="settings-overview-card">
                <span className="settings-overview-label">{messages.settings.localDevice}</span>
                <strong className="settings-overview-value">{localDeviceSummaryLabel}</strong>
                <p className="settings-overview-meta">{localDeviceSummaryMeta}</p>
              </article>
              <article className="settings-overview-card">
                <span className="settings-overview-label">{messages.settings.devices}</span>
                <strong className="settings-overview-value">{deviceCountLabel}</strong>
                <p className="settings-overview-meta">{messages.settings.boundDeviceCount}</p>
              </article>
              <article className="settings-overview-card">
                <span className="settings-overview-label">{messages.settings.defaultDevice}</span>
                <strong className="settings-overview-value">{defaultDeviceSummaryLabel}</strong>
                <p className="settings-overview-meta">
                  {defaultCloudDevice?.hostname ?? messages.settings.defaultDeviceHint}
                </p>
              </article>
            </section>

            <section className="settings-panel">
              <div className="settings-panel-head">
                <span>{messages.settings.accountAndDevice}</span>
                <div className="settings-status">
                  <span>{bindingStatusLabel}</span>
                </div>
              </div>
              <p className="settings-section-copy">{accountAndDeviceHint}</p>
              <dl className="settings-data-grid settings-data-grid-compact">
                <dt>{messages.settings.authMethod}</dt>
                <dd>{authMethodLabel}</dd>
                <dt>{messages.settings.userId}</dt>
                <dd>{authSession?.userId ?? "—"}</dd>
                <dt>{messages.settings.localDevice}</dt>
                <dd>{localDevice?.name ?? (isCloudSession ? messages.settings.cloudSession : "—")}</dd>
                <dt>{messages.settings.hostname}</dt>
                <dd>{localDevice?.hostname ?? "—"}</dd>
                <dt>{messages.settings.devicePlatform}</dt>
                <dd>{localDevice ? devicePlatformLabel : isCloudSession ? messages.settings.localRelayUnavailable : devicePlatformLabel}</dd>
                <dt>{messages.settings.deviceBinding}</dt>
                <dd>{localDevice ? bindingStatusLabel : isCloudSession ? messages.settings.localRelayUnavailable : bindingStatusLabel}</dd>
                <dt>{messages.settings.defaultDevice}</dt>
                <dd>{defaultDeviceName}</dd>
                <dt>{messages.settings.deviceId}</dt>
                <dd>{localDevice?.id ?? "—"}</dd>
              </dl>
              {isCloudSession ? (
                <p className="settings-section-copy settings-section-copy-compact">
                  {messages.settings.localRelayUnavailableDetail}
                </p>
              ) : null}
              <div className="settings-editor-actions">
                <div className="settings-editor-actions-left">
                  <button
                    className="settings-save"
                    disabled={!canBindCurrentDevice}
                    onClick={() => void handleBindCurrentDevice()}
                    type="button"
                  >
                    {bindButtonLabel}
                  </button>
                </div>
                <span>
                  {bindState === "error"
                    ? bindError ?? messages.settings.bindFailed
                    : bindState === "done"
                      ? messages.settings.bindSucceeded
                      : isCloudSession
                        ? messages.settings.localRelayUnavailableDetail
                      : authSession?.method !== "github"
                        ? messages.settings.bindErrorPasswordOnly
                        : null}
                </span>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "devices" ? (
          <section className="settings-panel">
            <div className="settings-panel-head">
              <span>{messages.settings.devices}</span>
              <div className="settings-status">
                <span>{deviceDirectoryStatusLabel}</span>
              </div>
            </div>
            <p className="settings-section-copy">{messages.settings.devicesHint}</p>
            {authSession?.method !== "github" ? (
              <p className="settings-section-copy settings-section-copy-compact">{messages.settings.devicesGithubOnly}</p>
            ) : deviceDirectoryState === "loading" && !deviceDirectory ? (
              <p className="settings-section-copy settings-section-copy-compact">{messages.settings.loading}</p>
            ) : deviceDirectory && deviceDirectory.items.length > 0 ? (
              <div className="settings-device-list">
                {deviceDirectory.items.map((device) => {
                  const isDefault = deviceDirectory.defaultDeviceId === device.id;
                  const isCurrent = isCurrentLocalCloudDevice(device, localDevice);
                  const isSettingDefault = defaultDeviceState === "submitting" && defaultDeviceTargetId === device.id;

                  return (
                    <article className="settings-device-card" key={device.id}>
                      <div className="settings-device-card-main">
                        <div className="settings-device-card-head">
                          <strong className="settings-device-card-title">{device.name}</strong>
                          <div className="settings-device-card-badges">
                            <span className="settings-device-badge">{device.status === "online" ? messages.settings.online : messages.settings.offline}</span>
                            {isCurrent ? <span className="settings-device-badge">{messages.settings.currentMachine}</span> : null}
                            {isDefault ? <span className="settings-device-badge settings-device-badge-accent">{messages.settings.defaultDevice}</span> : null}
                          </div>
                        </div>
                        <p className="settings-device-card-meta">
                          {device.hostname} · {device.platform} / {device.arch}
                        </p>
                        <p className="settings-device-card-meta settings-device-card-meta-soft">localDeviceId · {device.localDeviceId}</p>
                      </div>
                      <div className="settings-device-card-actions">
                        <button
                          className="settings-save"
                          disabled={isDefault || defaultDeviceState === "submitting"}
                          onClick={() => void handleSetDefaultDevice(device.id)}
                          type="button"
                        >
                          {isSettingDefault
                            ? messages.settings.settingDefault
                            : isDefault
                              ? messages.settings.defaultSelected
                              : messages.settings.setDefaultDevice}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="settings-section-copy settings-section-copy-compact">{messages.settings.noBoundDevices}</p>
            )}
            <div className="settings-editor-actions">
              <div className="settings-editor-actions-left">
                <button
                  className="settings-reset"
                  disabled={deviceDirectoryState === "loading" || defaultDeviceState === "submitting" || authSession?.method !== "github"}
                  onClick={() => void refreshDeviceDirectory()}
                  type="button"
                >
                  {messages.settings.refreshDevices}
                </button>
              </div>
              <span>{deviceDirectoryFeedback}</span>
            </div>
          </section>
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

        {activeTab === "access" ? (
          <section className="settings-panel">
            <div className="settings-panel-head">
              <span>{messages.settings.remoteAccess}</span>
              <div className="settings-status">
                <span>
                  {logoutState === "submitting"
                    ? messages.settings.loggingOut
                    : logoutState === "done"
                      ? messages.settings.loggedOut
                      : logoutState === "error"
                        ? messages.settings.error
                        : messages.settings.synced}
                </span>
              </div>
            </div>
            <p className="settings-section-copy">{messages.settings.remoteAccessHint}</p>
            <div className="settings-editor-actions">
              <div className="settings-editor-actions-left">
                <button
                  className="settings-reset"
                  disabled={logoutState === "submitting"}
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  {messages.settings.logout}
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
