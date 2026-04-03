"use client";

import dynamic from "next/dynamic";

import type { AppLanguage, UiConfig } from "@/config/ui.config";

const WorkspaceClient = dynamic(
  () => import("@/components/workspace-client").then((module) => module.WorkspaceClient),
  {
    ssr: false,
    loading: () => (
      <section className="page-loading" aria-busy="true" aria-live="polite">
        <div className="page-loading-bar" />
      </section>
    ),
  },
);

type WorkspacePageClientProps = {
  language: AppLanguage;
  layout?: Pick<
    UiConfig["layout"],
    "workspaceLeftWidth" | "workspaceCenterMinWidth" | "workspaceRightWidth" | "workspaceSidepanelPrimaryWidth"
  >;
};

export function WorkspacePageClient({ language, layout }: WorkspacePageClientProps) {
  return <WorkspaceClient language={language} layout={layout} />;
}
