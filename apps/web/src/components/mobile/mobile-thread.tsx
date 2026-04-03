import type { RefObject } from "react";

import type { Message } from "@relay/shared-types";

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
          className={`mobile-message mobile-message-${message.role}`}
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

function renderMarkdown(markdown: string) {
  const escaped = escapeHtml(markdown);
  const codeBlocks: string[] = [];

  let html = escaped.replace(/```([\s\S]*?)```/g, (_match, code) => {
    const token = `__MOBILE_CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return token;
  });

  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^(?:-|\*) (.*)$/gm, "<li>$1</li>");
  html = html.replace(/^\d+\. (.*)$/gm, "<li data-ordered=\"true\">$1</li>");

  const blocks = html
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  html = blocks
    .map((block) => {
      if (block.startsWith("__MOBILE_CODE_BLOCK_")) {
        return block;
      }

      if (block.startsWith("<h1>") || block.startsWith("<h2>") || block.startsWith("<h3>")) {
        return block;
      }

      if (block.includes("<li")) {
        const isOrdered = block.includes('data-ordered="true"');
        const normalizedList = block.replace(/ data-ordered="true"/g, "");
        return isOrdered ? `<ol>${normalizedList}</ol>` : `<ul>${normalizedList}</ul>`;
      }

      return `<p>${block.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");

  codeBlocks.forEach((codeBlock, index) => {
    html = html.replace(`__MOBILE_CODE_BLOCK_${index}__`, codeBlock);
  });

  return html;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
