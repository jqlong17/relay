import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono, Noto_Sans_SC } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { getUiCssVariables, loadUiConfig } from "@/config/ui.config";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const notoSansSc = Noto_Sans_SC({
  variable: "--font-sans-sc",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Relay",
  description: "Your local agent, anywhere.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const uiConfig = loadUiConfig();
  const uiCssVariables = getUiCssVariables(uiConfig);

  return (
    <html
      lang={uiConfig.language === "zh" ? "zh-CN" : "en"}
      className={`${plexSans.variable} ${plexMono.variable} ${notoSansSc.variable}`}
    >
      <body style={uiCssVariables}>
        <AppShell language={uiConfig.language}>{children}</AppShell>
      </body>
    </html>
  );
}
