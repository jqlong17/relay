import { SettingsPageClient } from "@/components/settings-page-client";
import { loadUiConfig } from "@/config/ui.config";

export default function SettingsPage() {
  const uiConfig = loadUiConfig();

  return <SettingsPageClient language={uiConfig.language} />;
}
