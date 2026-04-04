import { WorkspacePageClient } from "@/components/workspace-page-client";
import { loadUiConfig } from "@/config/ui.config";

export default function WorkspacePage() {
  const uiConfig = loadUiConfig();

  return (
    <WorkspacePageClient
      language={uiConfig.language}
      layout={{
        workspaceLeftWidth: uiConfig.layout.workspaceLeftWidth,
        workspaceCenterMinWidth: uiConfig.layout.workspaceCenterMinWidth,
        workspaceRightWidth: uiConfig.layout.workspaceRightWidth,
        workspaceSidepanelPrimaryWidth: uiConfig.layout.workspaceSidepanelPrimaryWidth,
      }}
    />
  );
}
