"use client";

import dynamic from "next/dynamic";

import type { AppLanguage } from "@/config/ui.config";

const AutomationPageClient = dynamic(
  () => import("@/components/automation-page-client").then((module) => module.AutomationPageClient),
  { ssr: false },
);

type AutomationPageShellProps = {
  language: AppLanguage;
};

export function AutomationPageShell({ language }: AutomationPageShellProps) {
  return <AutomationPageClient language={language} />;
}
