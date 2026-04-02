"use client";

import { useState } from "react";

import Link from "next/link";

type TopNavProps = {
  active: "workspace" | "sessions" | "memories" | "readme";
};

const items: Array<{ key: TopNavProps["active"]; href: string; label: string }> = [
  { key: "workspace", href: "/", label: "workspace" },
  { key: "sessions", href: "/sessions", label: "sessions" },
  { key: "memories", href: "/memories", label: "memories" },
  { key: "readme", href: "/readme", label: "readme" },
];

export function TopNav({ active }: TopNavProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [language, setLanguage] = useState<"zh" | "en">(() => {
    if (typeof window === "undefined") {
      return "zh";
    }

    const saved = window.localStorage.getItem("relay-language");
    return saved === "en" ? "en" : "zh";
  });

  function handleLanguageChange(next: "zh" | "en") {
    setLanguage(next);
    window.localStorage.setItem("relay-language", next);
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">relay</span>
          <span className="brand-state">local workspace</span>
        </div>
        <div className="topbar-actions">
          <nav className="topnav" aria-label="Primary">
            {items.map((item) => (
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
            settings
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <>
          <button
            aria-label="Close settings"
            className="settings-backdrop"
            onClick={() => setSettingsOpen(false)}
            type="button"
          />
          <aside className="settings-panel" aria-label="Settings">
            <div className="settings-panel-head">
              <span className="eyebrow">settings</span>
              <button className="settings-close" onClick={() => setSettingsOpen(false)} type="button">
                close
              </button>
            </div>

            <section className="settings-section">
              <div className="settings-section-head">
                <h2>language</h2>
                <span>ui preference</span>
              </div>
              <div className="settings-language-toggle" role="tablist" aria-label="Language">
                <button
                  className={`settings-language-option ${
                    language === "zh" ? "settings-language-option-active" : ""
                  }`}
                  onClick={() => handleLanguageChange("zh")}
                  type="button"
                >
                  中文
                </button>
                <button
                  className={`settings-language-option ${
                    language === "en" ? "settings-language-option-active" : ""
                  }`}
                  onClick={() => handleLanguageChange("en")}
                  type="button"
                >
                  English
                </button>
              </div>
              <p className="settings-note">当前只保存语言偏好，后续可扩展为界面文案切换。</p>
            </section>
          </aside>
        </>
      ) : null}
    </>
  );
}
