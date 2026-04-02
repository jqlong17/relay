"use client";

import { useEffect, useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";

type TopNavProps = {
  active: "workspace" | "sessions" | "memories" | "readme";
  language: AppLanguage;
};

export function TopNav({ active, language }: TopNavProps) {
  const router = useRouter();
  const messages = getMessages(language);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appearanceContent, setAppearanceContent] = useState("");
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const [appearanceDirty, setAppearanceDirty] = useState(false);
  const [appearanceState, setAppearanceState] = useState<
    "idle" | "saving" | "resetting" | "saved" | "error"
  >("idle");
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (!settingsOpen || appearanceLoaded) {
      return;
    }

    let cancelled = false;

    async function loadAppearance() {
      try {
        const response = await fetch("/api/ui-config", { cache: "no-store" });
        const data = (await response.json()) as { content?: string };

        if (!cancelled && typeof data.content === "string") {
          setAppearanceContent(data.content);
          setAppearanceLoaded(true);
          setAppearanceDirty(false);
          setAppearanceState("idle");
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
  }, [appearanceLoaded, settingsOpen]);

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

      const data = (await response.json()) as { content?: string };

      if (typeof data.content === "string") {
        setAppearanceContent(data.content);
      }

      setAppearanceDirty(false);
      setAppearanceState("saved");
      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setAppearanceState("error");
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">relay</span>
          <span className="brand-state">{messages.brandState}</span>
        </div>
        <div className="topbar-actions">
          <nav className="topnav" aria-label={messages.nav.primaryAriaLabel}>
            {[
              { key: "workspace", href: "/", label: messages.nav.workspace },
              { key: "sessions", href: "/sessions", label: messages.nav.sessions },
              { key: "memories", href: "/memories", label: messages.nav.memories },
              { key: "readme", href: "/readme", label: messages.nav.readme },
            ].map((item) => (
              <Link
                className={`topnav-link ${active === item.key ? "topnav-link-active" : ""}`}
                href={item.href}
                key={item.key}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            className={`topbar-settings ${settingsOpen ? "topbar-settings-active" : ""}`}
            onClick={() => setSettingsOpen((open) => !open)}
            type="button"
          >
            {messages.nav.settings}
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <>
          <button
            aria-label={messages.settings.closeAriaLabel}
            className="settings-backdrop"
            onClick={() => setSettingsOpen(false)}
            type="button"
          />
          <aside className="settings-panel" aria-label={messages.settings.panelAriaLabel}>
            <div className="settings-panel-head">
              <span className="eyebrow">{messages.settings.title}</span>
              <button className="settings-close" onClick={() => setSettingsOpen(false)} type="button">
                {messages.settings.close}
              </button>
            </div>

            <section className="settings-section">
              <div className="settings-section-head">
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
                className="settings-editor"
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
          </aside>
        </>
      ) : null}
    </>
  );
}
