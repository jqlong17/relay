import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, JetBrains_Mono, Noto_Sans_SC, Source_Sans_3 } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { getUiCssVariables, loadUiConfig } from "@/config/ui.config";
import "./globals.css";

export const dynamic = "force-dynamic";

const sourceSans = Source_Sans_3({
  variable: "--font-ui-source",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-ui-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const notoSansSc = Noto_Sans_SC({
  variable: "--font-cjk-noto",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Relay",
  description: "Your local agent, anywhere.",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "512x512", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const uiConfig = loadUiConfig();
  const uiCssVariables = getUiCssVariables(uiConfig);
  const uiFontClassName = uiConfig.font.ui === "ibm-plex-sans" ? "font-ui-plex" : "font-ui-source-sans";
  const monoFontClassName = uiConfig.font.mono === "ibm-plex-mono" ? "font-mono-plex" : "font-mono-jetbrains";

  return (
    <html
      data-theme={uiConfig.theme}
      lang={uiConfig.language === "zh" ? "zh-CN" : "en"}
      className={`${sourceSans.variable} ${plexSans.variable} ${jetbrainsMono.variable} ${plexMono.variable} ${notoSansSc.variable} ${uiFontClassName} ${monoFontClassName}`}
      suppressHydrationWarning
      style={{ colorScheme: uiConfig.theme === "dark" ? "dark" : "light" }}
    >
      <body style={uiCssVariables}>
        <AppShell language={uiConfig.language}>{children}</AppShell>
      </body>
    </html>
  );
}
