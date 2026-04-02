import { loadUiConfig } from "@/config/ui.config";
import { SessionsClient } from "@/components/sessions-client";
import { TopNav } from "@/components/top-nav";

export default function SessionsPage() {
  const uiConfig = loadUiConfig();

  return (
    <main className="relay-app">
      <TopNav active="sessions" language={uiConfig.language} />
      <SessionsClient language={uiConfig.language} />
    </main>
  );
}
