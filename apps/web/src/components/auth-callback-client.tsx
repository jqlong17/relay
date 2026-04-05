"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ensureCurrentGitHubDeviceReady } from "@/lib/auth/device-bootstrap";
import { resolveOAuthCallbackAccessToken } from "@/lib/auth/oauth-callback";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase";

type AuthCallbackClientProps = {
  errorLabel: string;
  nextPath: string;
  processingLabel: string;
};

export function AuthCallbackClient({ errorLabel, nextPath, processingLabel }: AuthCallbackClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "error">("processing");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const oauthError = searchParams.get("error");
        if (oauthError) {
          throw new Error(searchParams.get("error_description") ?? oauthError);
        }

        const code = searchParams.get("code");
        const supabase = createSupabaseBrowserClient();
        const sessionTokens = await resolveOAuthCallbackAccessToken({ client: supabase, code });

        const response = await fetch("/api/auth/supabase-session", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(sessionTokens),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Failed to establish local session");
        }

        try {
          await ensureCurrentGitHubDeviceReady();
        } catch (error) {
          console.warn("Relay device bootstrap skipped.", error);
        }

        if (cancelled) {
          return;
        }

        router.replace(nextPath);
        router.refresh();
      } catch (error) {
        console.error("GitHub login callback failed.", error);
        if (!cancelled) {
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nextPath, router, searchParams]);

  return <p>{status === "processing" ? processingLabel : errorLabel}</p>;
}
