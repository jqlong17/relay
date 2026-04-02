import { TopNav } from "@/components/top-nav";

export default function ReadmePage() {
  return (
    <main className="relay-app">
      <TopNav active="readme" />
      <section className="simple-page">
        <div className="simple-page-body">
          <span className="eyebrow">readme</span>
          <h1>Project-facing documentation and current operating notes.</h1>
          <p>
            This page can become the stable place for README content, project context, onboarding,
            and explicit instructions that should remain human-readable rather than inferred from
            sessions.
          </p>
        </div>
      </section>
    </main>
  );
}
