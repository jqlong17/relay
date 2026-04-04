function renderMarkdown(markdown: string) {
  const escaped = escapeHtml(markdown);
  const codeBlocks: string[] = [];

  let html = escaped.replace(/```([\s\S]*?)```/g, (_match, code) => {
    const token = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return token;
  });

  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label, href) =>
      `<button type="button" class="thread-link thread-file-link" data-file-link="true" data-file-path="${escapeHtmlAttribute(normalizeLinkedFilePath(href))}">${label}</button>`,
  );
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
      if (block.startsWith("__CODE_BLOCK_")) {
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
    html = html.replace(`__CODE_BLOCK_${index}__`, codeBlock);
  });

  return html;
}

function normalizeLinkedFilePath(rawHref: string) {
  return rawHref.replace(/#L\d+(C\d+)?$/i, "").replace(/:\d+(?::\d+)?$/i, "");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

export { renderMarkdown };
