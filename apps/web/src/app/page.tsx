import { ProductOverviewPage } from "@/components/product-overview-page";
import { loadUiConfig } from "@/config/ui.config";

export default function Home() {
  const uiConfig = loadUiConfig();

  return <ProductOverviewPage language={uiConfig.language} />;
}
