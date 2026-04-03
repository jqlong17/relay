import { MemoriesPageClient } from "@/components/memories-page-client";
import { loadUiConfig } from "@/config/ui.config";

export default function MemoriesPage() {
  const uiConfig = loadUiConfig();

  return <MemoriesPageClient language={uiConfig.language} />;
}
