"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase";
import { normalizeIOSAuthCallbackTarget } from "@/lib/auth/oauth-callback";

export function IOSAuthStartClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"starting" | "error">("starting");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const callbackTarget = normalizeIOSAuthCallbackTarget(searchParams.get("app_callback"));
        const redirectTo = `${window.location.origin}/auth/ios/callback?app_callback=${encodeURIComponent(callbackTarget)}`;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "github",
          options: {
            redirectTo,
          },
        });

        if (error) {
          throw error;
        }

        if (!data.url) {
          throw new Error("Supabase did not return an OAuth redirect URL.");
        }

        if (!cancelled) {
          window.location.assign(data.url);
        }
      } catch (error) {
        console.error("iPhone GitHub login start failed.", error);

        if (!cancelled) {
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return <p>{status === "starting" ? "Opening GitHub sign-in…" : "Unable to start GitHub sign-in."}</p>;
}
