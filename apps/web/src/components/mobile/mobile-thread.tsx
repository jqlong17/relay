import { forwardRef, type RefObject } from "react";

import type { Message } from "@relay/shared-types";
import { renderMarkdown } from "@/lib/markdown";

type MobileThreadProps = {
  emptyLabel: string;
  messages: Message[];
  timelineRef: RefObject<HTMLDivElement | null>;
  currentMessageRef: RefObject<HTMLElement | null>;
};

export function MobileThread({
  emptyLabel,
  messages,
  timelineRef,
  currentMessageRef,
}: MobileThreadProps) {
  return (
    <div className="mobile-thread" ref={timelineRef}>
      {messages.length === 0 ? <div className="mobile-empty">{emptyLabel}</div> : null}
      {messages.map((message, index) => (
        <MobileThreadMessage key={message.id} message={message} ref={index === messages.length - 1 ? currentMessageRef : null} />
      ))}
    </div>
  );
}

const MobileThreadMessage = forwardRef<HTMLElement, { message: Message }>(function MobileThreadMessage({ message }, ref) {
  const processMeta = message.meta?.kind === "process" ? message.meta.process : undefined;

  if (processMeta) {
    return (
      <article
        className={`mobile-message mobile-message-${message.role} mobile-message-process mobile-message-status-${message.status}`}
        ref={ref}
      >
        <div className="mobile-process-top">
          <div className="mobile-process-head">
            <span className={`mobile-process-phase mobile-process-phase-${processMeta.phase}`}>
              {processMeta.phase}
            </span>
            <strong className="mobile-process-title">{processMeta.label ?? PROCESS_TITLES[processMeta.phase]}</strong>
          </div>
          <span className={`mobile-process-status mobile-process-status-${message.status ?? "completed"}`}>
            {formatProcessStatus(message.status)}
          </span>
        </div>
        <div className="mobile-message-top mobile-message-top-process">
          <span className="mobile-message-role">system</span>
          <span className="mobile-message-time">{formatMessageTime(message.createdAt)}</span>
        </div>
        {message.content.trim() ? (
          <pre className="mobile-process-body">{message.content.trimEnd()}</pre>
        ) : (
          <div className="mobile-process-body mobile-process-body-empty">waiting for output</div>
        )}
      </article>
    );
  }

  return (
    <article
      className={`mobile-message mobile-message-${message.role} mobile-message-status-${message.status}`}
      ref={ref}
    >
      <div className="mobile-message-top">
        <span className="mobile-message-role">{message.role}</span>
        <span className="mobile-message-time">{formatMessageTime(message.createdAt)}</span>
      </div>
      <div
        className="mobile-message-content"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
      />
    </article>
  );
});

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

function formatProcessStatus(status: Message["status"]) {
  if (status === "streaming") {
    return "running";
  }

  if (status === "error") {
    return "failed";
  }

  return "done";
}

const PROCESS_TITLES = {
  thinking: "Thinking",
  plan: "Plan",
  command: "Command",
} as const;
