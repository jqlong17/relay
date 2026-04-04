"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { usePathname, useRouter } from "next/navigation";
import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";

type TopNavProps = {
  language: AppLanguage;
};

export function TopNav({ language }: TopNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const messages = getMessages(language);
  const [isNavigating, startNavigationTransition] = useTransition();
  const [optimisticPathname, setOptimisticPathname] = useState(pathname);
  const pendingNavigationRef = useRef<{ href: string; startedAt: number } | null>(null);
  const navItems = useMemo(
    () => [
      { key: "workspace", href: "/workspace", label: messages.nav.workspace },
      { key: "sessions", href: "/sessions", label: messages.nav.sessions },
      { key: "memories", href: "/memories", label: messages.nav.memories },
      { key: "automation", href: "/automation", label: messages.nav.automation },
      { key: "readme", href: "/about", label: messages.nav.readme },
      { key: "settings", href: "/settings", label: messages.nav.settings },
    ],
    [messages],
  );

  useEffect(() => {
    for (const item of navItems) {
      router.prefetch(item.href);
    }
  }, [navItems, router]);

  useEffect(() => {
    setOptimisticPathname(pathname);
    const pendingNavigation = pendingNavigationRef.current;
    if (!pendingNavigation || pendingNavigation.href !== pathname) {
      return;
    }

    const duration = performance.now() - pendingNavigation.startedAt;
    const nextEntry = {
      duration,
      finishedAt: Date.now(),
      href: pathname,
    };

    pendingNavigationRef.current = null;
    const runtimeWindow = window as Window & {
      __relayNavMetrics?: Array<{ duration: number; finishedAt: number; href: string }>;
    };
    runtimeWindow.__relayNavMetrics = [...(runtimeWindow.__relayNavMetrics ?? []), nextEntry].slice(-50);
    console.info("[relay-nav]", nextEntry);
  }, [pathname]);

  const handleNavClick = useCallback((href: string) => {
    if (href === pathname) {
      return;
    }

    setOptimisticPathname(href);
    pendingNavigationRef.current = {
      href,
      startedAt: performance.now(),
    };
    startNavigationTransition(() => {
      router.push(href);
    });
  }, [pathname, router]);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">relay</span>
        <span className="brand-state">{messages.brandState}</span>
      </div>
      <div className="topbar-actions">
        <nav className="topnav" aria-label={messages.nav.primaryAriaLabel}>
          {navItems.map((item) => (
            <button
              aria-current={optimisticPathname === item.href ? "page" : undefined}
              className={`topnav-link ${optimisticPathname === item.href ? "topnav-link-active" : ""} ${
                isNavigating && optimisticPathname === item.href ? "topnav-link-pending" : ""
              }`}
              key={item.key}
              onClick={() => handleNavClick(item.href)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
