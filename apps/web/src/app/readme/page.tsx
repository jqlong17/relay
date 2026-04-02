import { getMessages } from "@/config/messages";
import { loadUiConfig } from "@/config/ui.config";
import { TopNav } from "@/components/top-nav";

export default function ReadmePage() {
  const uiConfig = loadUiConfig();
  const messages = getMessages(uiConfig.language);

  return (
    <main className="relay-app">
      <TopNav active="readme" language={uiConfig.language} />
      <section className="simple-page">
        <div className="simple-page-body">
          <span className="eyebrow">{messages.readme.eyebrow}</span>
          <h1>{messages.readme.title}</h1>
          <p>{messages.readme.body}</p>
        </div>
      </section>
    </main>
  );
}
