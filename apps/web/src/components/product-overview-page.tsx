"use client";

import { type CSSProperties, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getMessages } from "@/config/messages";
import type { AppLanguage } from "@/config/ui.config";

type ProductOverviewPageProps = {
  language: AppLanguage;
};

type DelayStyle = CSSProperties & Record<"--readme-delay", string>;

type ProductOverviewContent = {
  heroEyebrow: string;
  brandLabel: string;
  heroTitle: string;
  heroBody: string;
  primaryCta: string;
  secondaryCta: string;
  flowTitle: string;
  flowBody: string;
  capabilitiesTitle: string;
  capabilityCards: Array<{ title: string; body: string }>;
  signatureTitle: string;
  signatureCards: Array<{ title: string; body: string }>;
  scenariosTitle: string;
  scenarioItems: Array<{ title: string; body: string }>;
  closingTitle: string;
  closingBody: string;
};

const contentByLanguage: Record<"zh" | "en", ProductOverviewContent> = {
  zh: {
    heroEyebrow: "product / overview",
    brandLabel: "Relay",
    heroTitle: "让 AI 对话变成可持续推进的工作系统",
    heroBody: "基于 Codex CLI 的 Web 工作台，用来管理 AI 对话、沉淀记忆，并让目标持续推进。",
    primaryCta: "打开工作区",
    secondaryCta: "查看记忆",
    flowTitle: "Session -> Memory -> Automation",
    flowBody: "把短期对话变成可沉淀的长期记忆，再把清晰目标延伸成持续执行的自动化。",
    capabilitiesTitle: "Relay 能做什么",
    capabilityCards: [
      {
        title: "继续而不是重开",
        body: "在浏览器里延续当前工作，不再反复从头解释背景、重新接着上一轮说“继续”。",
      },
      {
        title: "把 session 组织成长期资产",
        body: "不只是保存聊天记录，而是把重要 session 管理起来，作为后续记忆与整理的来源。",
      },
      {
        title: "让目标向前推进",
        body: "不仅得到一次回复，还可以围绕用户目标继续跟进、整理与执行更长周期的任务。",
      },
    ],
    signatureTitle: "Relay 的独特价值",
    signatureCards: [
      {
        title: "Memory",
        body: "Relay 会把重要 session 整理成更容易长期理解和复用的 memory。这样用户不需要反复翻很多轮对话，也能找回真正重要的目标、决策和上下文。",
      },
      {
        title: "Automation",
        body: "Relay 不希望 AI 停在当前回复。自动化能力可以让任务沿着用户目标继续执行，使产品从一次性对话工具，变成长期工作的推进系统。",
      },
    ],
    scenariosTitle: "什么时候你会想用 Relay",
    scenarioItems: [
      {
        title: "你总在一段对话停住后反复说“继续”",
        body: "任务跨越很多轮之后，原始上下文和真正重要的结论很容易丢失，Relay 更适合这种持续推进型工作。",
      },
      {
        title: "你用 Codex CLI，但关闭之后很难继续管理之前的内容",
        body: "CLI 很强，但 session、记忆和长期上下文的查看与整理并不方便，Relay 补上的正是这层产品管理能力。",
      },
      {
        title: "你用桌面版，但希望有更强的自动化和记忆能力",
        body: "Relay 更强调 memory 的整理与查看，也更强调 automation 对长期目标的持续推进。",
      },
      {
        title: "你想更方便地看文件树和目录上下文",
        body: "除了对话本身，Relay 也让文件目录、文件预览和 session 上下文更容易被放在同一个工作界面里查看。",
      },
    ],
    closingTitle: "Relay 想成为怎样的产品",
    closingBody: "它不是另一个聊天页面，而是一个围绕 AI 对话、会话管理、记忆生成与管理、自动化执行而设计的长期工作产品。",
  },
  en: {
    heroEyebrow: "product / overview",
    brandLabel: "Relay",
    heroTitle: "Turn AI conversations into a system that keeps moving",
    heroBody: "A web workspace built on Codex CLI for managing AI conversations, preserving memory, and helping goals continue over time.",
    primaryCta: "Open Workspace",
    secondaryCta: "View Memories",
    flowTitle: "Session -> Memory -> Automation",
    flowBody: "Turn short-lived conversations into durable memory, then extend clear goals into longer-running automation.",
    capabilitiesTitle: "What Relay Does",
    capabilityCards: [
      {
        title: "Continue instead of restarting",
        body: "Keep work moving in the browser without repeatedly rebuilding context or asking the model to just continue from scratch.",
      },
      {
        title: "Turn sessions into durable assets",
        body: "Relay does not just keep chat logs. It helps organize sessions into a source for future memory and review.",
      },
      {
        title: "Keep goals moving forward",
        body: "Go beyond one-off replies and support work that needs follow-through, review, and longer-running execution.",
      },
    ],
    signatureTitle: "Where Relay Stands Out",
    signatureCards: [
      {
        title: "Memory",
        body: "Relay turns important sessions into memory that stays understandable and reusable over time, so users can recover decisions, goals, and context without rereading everything.",
      },
      {
        title: "Automation",
        body: "Relay is designed to keep work moving beyond the current answer. Automation makes it possible to continue working toward a user's goal over a longer cycle.",
      },
    ],
    scenariosTitle: "When Relay Becomes Useful",
    scenarioItems: [
      {
        title: "You keep saying “continue” after a conversation stalls",
        body: "Once work spans many rounds, raw dialogue becomes hard to manage. Relay is built for that kind of continuity.",
      },
      {
        title: "You use Codex CLI and lose track after closing it",
        body: "CLI is powerful, but session review, memory organization, and long-term context management are not its strongest product surfaces.",
      },
      {
        title: "You use the desktop app but want stronger automation and memory",
        body: "Relay puts more emphasis on structured memory and long-running automation tied to the user's goal.",
      },
      {
        title: "You want file context and directory review in the same flow",
        body: "Relay makes file trees, previews, and session context easier to inspect together in one working surface.",
      },
    ],
    closingTitle: "What Relay Wants To Be",
    closingBody: "Not another chat page, but a long-horizon AI work product centered on conversation, session management, memory, and automation.",
  },
};

export function ProductOverviewPage({ language }: ProductOverviewPageProps) {
  const router = useRouter();
  const content = useMemo(() => contentByLanguage[language], [language]);

  return (
    <section className="simple-page readme-page">
      <div className="simple-page-body readme-page-body">
        <section className="readme-hero readme-reveal" style={{ "--readme-delay": "0ms" } as DelayStyle}>
          <div className="readme-hero-layout">
            <div className="readme-hero-main">
              <div className="readme-hero-meta">
                <span className="eyebrow readme-hero-eyebrow">{content.heroEyebrow}</span>
              </div>
              <div className="readme-brand-lockup">
                <span className="readme-brand-name">{content.brandLabel}</span>
              </div>
              <h1>{content.heroTitle}</h1>
              <p className="readme-hero-body">{content.heroBody}</p>
              <div className="readme-cta-row">
                <button className="readme-cta readme-cta-primary" onClick={() => router.push("/workspace")} type="button">
                  {content.primaryCta}
                </button>
                <button className="readme-cta" onClick={() => router.push("/memories")} type="button">
                  {content.secondaryCta}
                </button>
              </div>
            </div>

            <div className="readme-hero-wireframe" aria-hidden="true">
              <div className="readme-flow-caption">{content.flowTitle}</div>
              <div className="readme-flow-body">{content.flowBody}</div>
              <div className="readme-wireframe-shell">
                <div className="readme-wireframe-grid readme-wireframe-grid-x readme-wireframe-grid-x-a" />
                <div className="readme-wireframe-grid readme-wireframe-grid-x readme-wireframe-grid-x-b" />
                <div className="readme-wireframe-grid readme-wireframe-grid-x readme-wireframe-grid-x-c" />
                <div className="readme-wireframe-grid readme-wireframe-grid-y readme-wireframe-grid-y-a" />
                <div className="readme-wireframe-grid readme-wireframe-grid-y readme-wireframe-grid-y-b" />
                <div className="readme-wireframe-grid readme-wireframe-grid-y readme-wireframe-grid-y-c" />
                <div className="readme-wireframe-line readme-wireframe-line-main-a" />
                <div className="readme-wireframe-line readme-wireframe-line-main-b" />
                <div className="readme-wireframe-line readme-wireframe-line-accent-a" />
                <div className="readme-wireframe-line readme-wireframe-line-accent-b" />
                <div className="readme-wireframe-line readme-wireframe-line-frame-top" />
                <div className="readme-wireframe-line readme-wireframe-line-frame-right" />
              </div>
            </div>
          </div>
        </section>

        <section className="readme-section readme-reveal" style={{ "--readme-delay": "80ms" } as DelayStyle}>
          <div className="readme-section-head">
            <span className="readme-section-index">01</span>
            <h2>{content.capabilitiesTitle}</h2>
          </div>
          <div className="readme-card-grid">
            {content.capabilityCards.map((item) => (
              <article className="readme-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="readme-section readme-reveal" style={{ "--readme-delay": "160ms" } as DelayStyle}>
          <div className="readme-section-head">
            <span className="readme-section-index">02</span>
            <h2>{content.signatureTitle}</h2>
          </div>
          <div className="readme-signature-grid">
            {content.signatureCards.map((item) => (
              <article className="readme-signature-card" key={item.title}>
                <span className="readme-signature-tag">{item.title}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="readme-section readme-reveal" style={{ "--readme-delay": "240ms" } as DelayStyle}>
          <div className="readme-section-head">
            <span className="readme-section-index">03</span>
            <h2>{content.scenariosTitle}</h2>
          </div>
          <div className="readme-scenario-list">
            {content.scenarioItems.map((item) => (
              <article className="readme-scenario-item" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="readme-closing readme-reveal" style={{ "--readme-delay": "320ms" } as DelayStyle}>
          <span className="readme-section-index">04</span>
          <h2>{content.closingTitle}</h2>
          <p>{content.closingBody}</p>
        </section>
      </div>
    </section>
  );
}
