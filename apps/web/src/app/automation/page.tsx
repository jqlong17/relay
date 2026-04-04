import { AutomationPageShell } from "@/components/automation-page-shell";
import { loadUiConfig } from "@/config/ui.config";

export default function AutomationPage() {
  const uiConfig = loadUiConfig();

  return <AutomationPageShell language={uiConfig.language} />;
}
