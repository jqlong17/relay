import { SessionsPageClient } from "@/components/sessions-page-client";
import { loadUiConfig } from "@/config/ui.config";

export default function SessionsPage() {
  const uiConfig = loadUiConfig();

  return <SessionsPageClient language={uiConfig.language} />;
}
