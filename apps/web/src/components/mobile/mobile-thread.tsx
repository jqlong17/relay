import type { RefObject } from "react";

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
        <article
          className={`mobile-message mobile-message-${message.role} mobile-message-status-${message.status}`}
          key={message.id}
          ref={index === messages.length - 1 ? currentMessageRef : null}
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
      ))}
    </div>
  );
}

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
