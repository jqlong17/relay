"use client";

import dynamic from "next/dynamic";

import type { AppLanguage } from "@/config/ui.config";

const SessionsClient = dynamic(
  () => import("@/components/sessions-client").then((module) => module.SessionsClient),
  {
    ssr: false,
    loading: () => (
      <section className="page-loading" aria-busy="true" aria-live="polite">
        <div className="page-loading-bar" />
      </section>
    ),
  },
);

type SessionsPageClientProps = {
  language: AppLanguage;
};

export function SessionsPageClient({ language }: SessionsPageClientProps) {
  return <SessionsClient language={language} />;
}
