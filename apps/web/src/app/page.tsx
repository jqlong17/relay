import { TopNav } from "@/components/top-nav";
import { WorkspaceClient } from "@/components/workspace-client";
import { loadUiConfig } from "@/config/ui.config";

export default function Home() {
  const uiConfig = loadUiConfig();

  return (
    <main className="relay-app">
      <TopNav active="workspace" language={uiConfig.language} />
      <WorkspaceClient language={uiConfig.language} />
    </main>
  );
}
