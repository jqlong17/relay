import { ProductOverviewPage } from "@/components/product-overview-page";
import { loadUiConfig } from "@/config/ui.config";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  const uiConfig = loadUiConfig();

  return <ProductOverviewPage language={uiConfig.language} />;
}
