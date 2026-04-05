import { Suspense } from "react";
import { headers } from "next/headers";
import { loadUiConfig } from "@/config/ui.config";
import { getMessages } from "@/config/messages";
import { isMobileUserAgent } from "@/lib/auth/device";
import { AuthCallbackClient } from "@/components/auth-callback-client";

type AuthCallbackPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuthCallbackPage({ searchParams }: AuthCallbackPageProps) {
  const uiConfig = loadUiConfig();
  const messages = getMessages(uiConfig.language);
  const headerStore = await headers();
  const isMobile = isMobileUserAgent(headerStore.get("user-agent"));
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const next = typeof resolvedSearchParams.next === "string" ? resolvedSearchParams.next : isMobile ? "/mobile" : "/workspace";

  return (
    <section className="simple-page login-page">
      <div className="simple-page-body login-page-body">
        <div className="login-page-panel">
          <span className="eyebrow">{messages.login.eyebrow}</span>
          <h1>{messages.login.title}</h1>
          <Suspense fallback={<p>{messages.login.success}</p>}>
            <AuthCallbackClient
              nextPath={next}
              processingLabel={messages.login.success}
              errorLabel={messages.login.oauthError}
            />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
