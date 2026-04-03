"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import type { AppLanguage } from "@/config/ui.config";

type AppShellProps = {
  children: ReactNode;
  language: AppLanguage;
};

export function AppShell({ children, language }: AppShellProps) {
  const pathname = usePathname();

  if (pathname === "/mobile") {
    return <>{children}</>;
  }

  return (
    <main className="relay-app">
      <TopNav language={language} />
      {children}
    </main>
  );
}
