import { Suspense } from "react";
import { IOSAuthStartClient } from "@/components/ios-auth-start-client";

export default function IOSAuthPage() {
  return (
    <section className="simple-page login-page">
      <div className="simple-page-body login-page-body">
        <div className="login-page-panel">
          <span className="eyebrow">Relay iPhone</span>
          <h1>Continue with GitHub</h1>
          <Suspense fallback={<p>Opening GitHub sign-in…</p>}>
            <IOSAuthStartClient />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
