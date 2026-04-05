"use client";

import { useMemo, useState } from "react";

import type { MobileLayoutDiagnosticEntry } from "@/lib/debug/mobile-layout-diagnostics";

type MobileLayoutDebugPanelProps = {
  entries: MobileLayoutDiagnosticEntry[];
  onClear: () => void;
};

const MAX_VISIBLE_ENTRIES = 20;

export function MobileLayoutDebugPanel({ entries, onClear }: MobileLayoutDebugPanelProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "done" | "error">("idle");
  const visibleEntries = useMemo(() => entries.slice(-MAX_VISIBLE_ENTRIES).reverse(), [entries]);
  const exportText = useMemo(() => JSON.stringify(entries, null, 2), [entries]);

  async function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyStatus("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(exportText);
      setCopyStatus("done");
      window.setTimeout(() => setCopyStatus("idle"), 1200);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 1600);
    }
  }

  return (
    <details className="mobile-layout-debug-panel" open>
      <summary className="mobile-layout-debug-summary">
        <span>layout diagnostics</span>
        <span>{entries.length}</span>
      </summary>
      <div className="mobile-layout-debug-toolbar">
        <button className="mobile-layout-debug-action" onClick={() => void handleCopy()} type="button">
          {copyStatus === "done" ? "copied" : copyStatus === "error" ? "copy failed" : "copy json"}
        </button>
        <button className="mobile-layout-debug-action" onClick={onClear} type="button">
          clear
        </button>
      </div>
      <div className="mobile-layout-debug-log" role="log" aria-label="mobile layout diagnostics">
        {visibleEntries.length === 0 ? (
          <div className="mobile-layout-debug-empty">no events recorded yet</div>
        ) : (
          visibleEntries.map((entry) => (
            <article className="mobile-layout-debug-entry" key={entry.id}>
              <header className="mobile-layout-debug-entry-head">
                <strong>{entry.type}</strong>
                <span>{formatTimestamp(entry.timestamp)}</span>
              </header>
              <div className="mobile-layout-debug-entry-meta">
                <span>{entry.target}</span>
                {entry.note ? <span>{entry.note}</span> : null}
              </div>
              <pre className="mobile-layout-debug-entry-body">
                {JSON.stringify(entry.snapshot, null, 2)}
              </pre>
            </article>
          ))
        )}
      </div>
    </details>
  );
}

function formatTimestamp(value: number) {
  return new Date(value).toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
