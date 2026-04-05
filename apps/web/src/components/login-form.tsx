"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase";

type LoginFormProps = {
  configured: boolean;
  errorMessage: string;
  githubEnabled: boolean;
  githubLabel: string;
  initialErrorMessage: string | null;
  nextPath: string;
  oauthErrorMessage: string;
  passwordEnabled: boolean;
  passwordLabel: string;
  passwordPlaceholder: string;
  submitLabel: string;
  successLabel: string;
};

export function LoginForm({
  configured,
  errorMessage,
  githubEnabled,
  githubLabel,
  initialErrorMessage,
  nextPath,
  oauthErrorMessage,
  passwordEnabled,
  passwordLabel,
  passwordPlaceholder,
  submitLabel,
  successLabel,
}: LoginFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [oauthError, setOauthError] = useState(false);
  const [oauthErrorDetail, setOauthErrorDetail] = useState<string | null>(null);
  const displayErrorMessage = status === "error" ? errorMessage : initialErrorMessage;

  async function handleGitHubLogin() {
    if (!githubEnabled) {
      return;
    }

    setOauthError(false);
    setOauthErrorDetail(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
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

      window.location.assign(data.url);
    } catch (error) {
      console.error("GitHub login start failed.", error);
      setOauthError(true);
      setOauthErrorDetail(error instanceof Error ? error.message : "Unknown OAuth error.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!configured || status === "submitting") {
      return;
    }

    setStatus("submitting");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      {githubEnabled ? (
        <button className="login-form-oauth" onClick={() => void handleGitHubLogin()} type="button">
          {githubLabel}
        </button>
      ) : null}
      {passwordEnabled ? (
        <>
          <label className="login-form-label">
            <span>{passwordLabel}</span>
            <input
              autoComplete="current-password"
              className="login-form-input"
              disabled={!configured || status === "submitting"}
              onChange={(event) => {
                setPassword(event.target.value);
                if (status === "error") {
                  setStatus("idle");
                }
              }}
              placeholder={passwordPlaceholder}
              type="password"
              value={password}
            />
          </label>
          <button
            className="login-form-submit"
            disabled={!configured || status === "submitting" || password.trim().length === 0}
            type="submit"
          >
            {status === "submitting" ? successLabel : submitLabel}
          </button>
        </>
      ) : null}
      {oauthError ? <p className="login-form-error">{oauthErrorMessage}</p> : null}
      {oauthError && process.env.NODE_ENV !== "production" && oauthErrorDetail ? (
        <p className="login-form-error">{oauthErrorDetail}</p>
      ) : null}
      {!oauthError && displayErrorMessage ? <p className="login-form-error">{displayErrorMessage}</p> : null}
    </form>
  );
}
