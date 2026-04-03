"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";

type SettingsPageClientProps = {
  language: AppLanguage;
};

export function SettingsPageClient({ language }: SettingsPageClientProps) {
  const router = useRouter();
  const messages = getMessages(language);
  const [appearanceContent, setAppearanceContent] = useState("");
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const [appearanceDirty, setAppearanceDirty] = useState(false);
  const [appearanceState, setAppearanceState] = useState<
    "idle" | "saving" | "resetting" | "saved" | "error"
  >("idle");
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
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
  }, []);

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
    <section className="simple-page settings-page">
      <div className="simple-page-body settings-page-body">
        <div className="settings-page-head">
          <span className="eyebrow">{messages.settings.title}</span>
        </div>

        <section className="settings-section settings-section-page">
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
      </div>
    </section>
  );
}
