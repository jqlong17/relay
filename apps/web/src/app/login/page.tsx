import { headers } from "next/headers";
import { LoginForm } from "@/components/login-form";
import { loadUiConfig } from "@/config/ui.config";
import { getMessages } from "@/config/messages";
import { isMobileUserAgent } from "@/lib/auth/device";
import { isAccessPasswordConfigured } from "@/lib/auth/password";
import { isSessionConfigured } from "@/lib/auth/session";
import { isSupabaseAuthConfigured } from "@/lib/auth/supabase";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const uiConfig = loadUiConfig();
  const messages = getMessages(uiConfig.language);
  const headerStore = await headers();
  const isMobile = isMobileUserAgent(headerStore.get("user-agent"));
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const next = typeof resolvedSearchParams.next === "string" ? resolvedSearchParams.next : isMobile ? "/mobile" : "/workspace";
  const error = typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : null;
  const passwordEnabled = isAccessPasswordConfigured() && isSessionConfigured();
  const githubEnabled = isSupabaseAuthConfigured() && isSessionConfigured();
  const configured = passwordEnabled || githubEnabled;
  const initialErrorMessage = error === "oauth" ? messages.login.oauthError : error === "session" ? messages.login.sessionError : null;

  return (
    <section className="simple-page login-page">
      <div className="simple-page-body login-page-body">
        <div className="login-page-panel">
          <span className="eyebrow">{messages.login.eyebrow}</span>
          <h1>{messages.login.title}</h1>
          <p>{configured ? messages.login.body : messages.login.missingConfig}</p>
          <LoginForm
            configured={configured}
            errorMessage={messages.login.error}
            githubEnabled={githubEnabled}
            githubLabel={messages.login.github}
            initialErrorMessage={initialErrorMessage}
            nextPath={next}
            oauthErrorMessage={messages.login.oauthError}
            passwordEnabled={passwordEnabled}
            passwordLabel={messages.login.passwordLabel}
            passwordPlaceholder={messages.login.passwordPlaceholder}
            submitLabel={messages.login.submit}
            successLabel={messages.login.success}
          />
        </div>
      </div>
    </section>
  );
}
