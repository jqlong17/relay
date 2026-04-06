import { Suspense } from "react";
import { IOSAuthCallbackClient } from "@/components/ios-auth-callback-client";

export default function IOSAuthCallbackPage() {
  return (
    <section className="simple-page login-page">
      <div className="simple-page-body login-page-body">
        <div className="login-page-panel">
          <span className="eyebrow">Relay iPhone</span>
          <h1>Connecting your iPhone</h1>
          <Suspense fallback={<p>Finishing GitHub sign-in…</p>}>
            <IOSAuthCallbackClient />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
