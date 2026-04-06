"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildIOSAuthCallbackRedirect,
  normalizeIOSAuthCallbackTarget,
  resolveOAuthCallbackAccessToken,
} from "@/lib/auth/oauth-callback";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase";

export function IOSAuthCallbackClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "error">("processing");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const callbackTarget = normalizeIOSAuthCallbackTarget(searchParams.get("app_callback"));

      try {
        const oauthError = searchParams.get("error");

        if (oauthError) {
          const errorMessage = searchParams.get("error_description") ?? oauthError;
          window.location.replace(
            buildIOSAuthCallbackRedirect({
              callbackTarget,
              error: errorMessage,
            }),
          );
          return;
        }

        const code = searchParams.get("code");
        const supabase = createSupabaseBrowserClient();
        const sessionTokens = await resolveOAuthCallbackAccessToken({ client: supabase, code });

        if (!cancelled) {
          window.location.replace(
            buildIOSAuthCallbackRedirect({
              callbackTarget,
              sessionTokens,
            }),
          );
        }
      } catch (error) {
        console.error("iPhone GitHub login callback failed.", error);

        if (!cancelled) {
          setStatus("error");
          window.location.replace(
            buildIOSAuthCallbackRedirect({
              callbackTarget,
              error: error instanceof Error ? error.message : "GitHub sign-in failed",
            }),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return <p>{status === "processing" ? "Finishing GitHub sign-in…" : "Returning to Relay iPhone…"}</p>;
}
