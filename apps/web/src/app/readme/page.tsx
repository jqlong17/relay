import fs from "node:fs";
import path from "node:path";

import { loadUiConfig } from "@/config/ui.config";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export default function ReadmePage() {
  const uiConfig = loadUiConfig();
  const readme = loadRootReadme(uiConfig.language);

  return (
    <section className="simple-page">
      <div className="simple-page-body">
        <div
          className="file-preview-markdown"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(readme) }}
        />
      </div>
    </section>
  );
}

function loadRootReadme(language: "zh" | "en") {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const localizedPath = path.join(workspaceRoot, `README.${language}.md`);
  const fallbackPath = path.join(workspaceRoot, "README.md");
  const targetPath = fs.existsSync(localizedPath) ? localizedPath : fallbackPath;

  return fs.readFileSync(targetPath, "utf8");
}

function findWorkspaceRoot(startPath: string) {
  let currentPath = path.resolve(startPath);

  while (true) {
    if (fs.existsSync(path.join(currentPath, "pnpm-workspace.yaml"))) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);

    if (parentPath === currentPath) {
      throw new Error("Could not locate repository root from the web app process");
    }

    currentPath = parentPath;
  }
}
