import type { CSSProperties } from "react";

import fs from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";

type AppLanguage = "zh" | "en";
type AppTheme = "dark" | "light";
type AppDensity = "compact" | "comfortable";
type AppUiFont = "source-sans-3" | "ibm-plex-sans";
type AppMonoFont = "jetbrains-mono" | "ibm-plex-mono";
type AppCjkFont = "noto-sans-sc";

type WidenLiteral<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T;

type DeepWiden<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown> ? DeepWiden<T[K]> : WidenLiteral<T[K]>;
};

const defaultUserUiToml = `# Relay UI 用户配置文件
# 这份文件用于覆盖内置的默认 UI 配置。
# 推荐只修改你明确知道用途的字段。未写出的字段会继续使用系统默认值。

# 全局界面语言：zh / en
language = "zh"

# 全局主题：dark / light
theme = "dark"

# 界面密度：compact / comfortable
# compact = 当前默认的紧凑布局
# comfortable = 更大的字号、更松的间距
density = "compact"

[font]
# UI 正文字体
# 可选：source-sans-3 / ibm-plex-sans
ui = "source-sans-3"

# 等宽字体
# 可选：jetbrains-mono / ibm-plex-mono
mono = "jetbrains-mono"

# 中文字体
# 可选：noto-sans-sc
cjk = "noto-sans-sc"

[layout]
# 顶部导航栏高度
topbarHeight = "40px"

# workspace 页面左侧 workspace/session 列表宽度
workspaceLeftWidth = "240px"

# workspace 页面中间主区域的最小宽度
workspaceCenterMinWidth = "360px"

# workspace 页面右侧 context 面板宽度
workspaceRightWidth = "min(50vw, 720px)"

# workspace 页面右侧 files 列默认宽度
workspaceSidepanelPrimaryWidth = "420px"

# workspace 页面中，对话块的最大宽度
# 这个值越大，越不容易换行
workspaceMessageMaxWidth = "80%"

# workspace 页面中 system/next 这类弱化消息块的最大宽度
workspaceSystemMessageMaxWidth = "58%"

# sessions 页面左侧分组列表宽度
sessionsLeftWidth = "220px"

# sessions 页面右侧 memory copilot 宽度
sessionsRightWidth = "360px"

# memories 页面左侧时间轴比例
memoriesLeftRatio = "0.72fr"

# memories 页面右侧详情比例
memoriesRightRatio = "1.28fr"

# memories 页面右侧详情最小宽度
memoriesRightMinWidth = "420px"

# 中间主内容区的横向内边距
panelCenterXPadding = "40px"

[typography]
# 最小一档 meta 字号：时间、状态、小标签
metaXs = "0.68rem"

# 常规 meta 字号：eyebrow、次级说明、文件树等
meta = "0.72rem"

# 小号正文：对话、输入框、次级正文
uiSm = "0.76rem"

# 常规正文
ui = "0.8rem"

# 导航和较重要列表项
nav = "0.82rem"

# 小标题
titleSm = "0.94rem"

# 页面级标题
title = "1rem"
`;

const darkThemeTokens = {
  color: {
    bg: "#020304",
    bgPanel: "#08090b",
    bgSoft: "#14171b",
    bgTopbar: "#16191d",
    bgElevated: "#090b0d",
    bgSettings: "#06080a",
    line: "rgba(190, 198, 212, 0.12)",
    lineStrong: "rgba(190, 198, 212, 0.2)",
    text: "#d7dde7",
    textSoft: "#9199a7",
    textDim: "#5f6774",
    blue: "#29a3ff",
    green: "#21d0a4",
    amber: "#f2be3d",
    red: "#ff5f6d",
    accent: "#ff7a1a",
  },
  surface: {
    overlay: "rgba(0, 0, 0, 0.12)",
    level1: "rgba(255, 255, 255, 0.01)",
    level2: "rgba(255, 255, 255, 0.015)",
    level3: "rgba(255, 255, 255, 0.02)",
    level4: "rgba(255, 255, 255, 0.025)",
    level5: "rgba(255, 255, 255, 0.03)",
    sessionActive: "#23272c",
    calendar1: "rgba(41, 163, 255, 0.14)",
    calendar2: "rgba(41, 163, 255, 0.24)",
    calendar3: "rgba(41, 163, 255, 0.38)",
    legend1: "rgba(41, 163, 255, 0.18)",
    legend2: "rgba(41, 163, 255, 0.34)",
    legend3: "rgba(41, 163, 255, 0.58)",
    accentBorder: "rgba(255, 122, 26, 0.7)",
    codeText: "#cfd6e3",
  },
} as const;

const lightThemeTokens = {
  color: {
    bg: "#f6f8fb",
    bgPanel: "#dde6f1",
    bgSoft: "#eef3f8",
    bgTopbar: "#edf2f7",
    bgElevated: "#ffffff",
    bgSettings: "#f1f5f9",
    line: "rgba(73, 89, 110, 0.12)",
    lineStrong: "rgba(73, 89, 110, 0.22)",
    text: "#1f2937",
    textSoft: "#556274",
    textDim: "#7b8796",
    blue: "#2563eb",
    green: "#16925b",
    amber: "#b7791f",
    red: "#dc4c64",
    accent: "#ea6d3f",
  },
  surface: {
    overlay: "rgba(20, 30, 45, 0.06)",
    level1: "rgba(58, 87, 122, 0.03)",
    level2: "rgba(58, 87, 122, 0.045)",
    level3: "rgba(58, 87, 122, 0.06)",
    level4: "rgba(58, 87, 122, 0.075)",
    level5: "rgba(58, 87, 122, 0.09)",
    sessionActive: "#d4dee9",
    calendar1: "rgba(37, 99, 235, 0.14)",
    calendar2: "rgba(37, 99, 235, 0.24)",
    calendar3: "rgba(37, 99, 235, 0.38)",
    legend1: "rgba(37, 99, 235, 0.16)",
    legend2: "rgba(37, 99, 235, 0.3)",
    legend3: "rgba(37, 99, 235, 0.5)",
    accentBorder: "rgba(234, 109, 63, 0.55)",
    codeText: "#273142",
  },
} as const;

function getThemeTokens(theme: AppTheme) {
  return theme === "light" ? lightThemeTokens : darkThemeTokens;
}

const compactDensityTokens = {
  spacing: {
    1: "4px",
    2: "6px",
    3: "8px",
    4: "10px",
    5: "12px",
    6: "14px",
    7: "16px",
    8: "18px",
    9: "20px",
    10: "24px",
  },
  layout: {
    topbarHeight: "44px",
    settingsPanelWidth: "320px",
    workspaceLeftWidth: "240px",
    workspaceCenterMinWidth: "360px",
    workspaceRightWidth: "min(50vw, 720px)",
    workspaceSidepanelPrimaryWidth: "420px",
    workspaceMessageMaxWidth: "80%",
    workspaceSystemMessageMaxWidth: "58%",
    sessionsLeftWidth: "220px",
    sessionsRightWidth: "360px",
    memoriesLeftRatio: "0.72fr",
    memoriesRightRatio: "1.28fr",
    memoriesRightMinWidth: "420px",
    panelCenterXPadding: "40px",
  },
  measure: {
    borderWidth: "1px",
    accentStripWidth: "2px",
    sessionRowIndent: "22px",
    tabMinHeight: "20px",
    calendarUnitSize: "10px",
    calendarCellGap: "5px",
    calendarCellPaddingY: "5px",
    calendarCellPaddingX: "6px",
    workspaceLogNudgeY: "4px",
  },
  typography: {
    metaXs: "0.68rem",
    meta: "0.72rem",
    uiSm: "0.76rem",
    ui: "0.8rem",
    nav: "0.82rem",
    titleSm: "0.94rem",
    title: "1rem",
  },
} as const;

const comfortableDensityTokens = {
  spacing: {
    1: "5px",
    2: "8px",
    3: "11px",
    4: "13px",
    5: "16px",
    6: "18px",
    7: "20px",
    8: "24px",
    9: "28px",
    10: "32px",
  },
  layout: {
    topbarHeight: "48px",
    settingsPanelWidth: "352px",
    workspaceLeftWidth: "268px",
    workspaceCenterMinWidth: "400px",
    workspaceRightWidth: "min(54vw, 800px)",
    workspaceSidepanelPrimaryWidth: "460px",
    workspaceMessageMaxWidth: "78%",
    workspaceSystemMessageMaxWidth: "60%",
    sessionsLeftWidth: "248px",
    sessionsRightWidth: "396px",
    memoriesLeftRatio: "0.74fr",
    memoriesRightRatio: "1.26fr",
    memoriesRightMinWidth: "456px",
    panelCenterXPadding: "56px",
  },
  measure: {
    borderWidth: "1px",
    accentStripWidth: "2px",
    sessionRowIndent: "26px",
    tabMinHeight: "24px",
    calendarUnitSize: "12px",
    calendarCellGap: "7px",
    calendarCellPaddingY: "7px",
    calendarCellPaddingX: "8px",
    workspaceLogNudgeY: "6px",
  },
  typography: {
    metaXs: "0.76rem",
    meta: "0.82rem",
    uiSm: "0.88rem",
    ui: "0.96rem",
    nav: "0.98rem",
    titleSm: "1.06rem",
    title: "1.14rem",
  },
} as const;

function getDensityTokens(density: AppDensity) {
  return density === "comfortable" ? comfortableDensityTokens : compactDensityTokens;
}

const defaultUiConfig = {
  language: "zh" as AppLanguage,
  theme: "dark" as AppTheme,
  density: "compact" as AppDensity,
  font: {
    ui: "source-sans-3" as AppUiFont,
    mono: "jetbrains-mono" as AppMonoFont,
    cjk: "noto-sans-sc" as AppCjkFont,
  },
  ...getThemeTokens("dark"),
  ...getDensityTokens("compact"),
} as const;

type UiConfig = {
  language: AppLanguage;
  theme: AppTheme;
  density: AppDensity;
  font: {
    ui: AppUiFont;
    mono: AppMonoFont;
    cjk: AppCjkFont;
  };
  color: DeepWiden<typeof darkThemeTokens.color>;
  surface: DeepWiden<typeof darkThemeTokens.surface>;
  spacing: DeepWiden<typeof compactDensityTokens.spacing>;
  layout: DeepWiden<typeof compactDensityTokens.layout>;
  measure: DeepWiden<typeof compactDensityTokens.measure>;
  typography: DeepWiden<typeof compactDensityTokens.typography>;
};

type UserUiConfig = {
  language?: AppLanguage;
  theme?: AppTheme;
  density?: AppDensity;
  font?: Partial<UiConfig["font"]>;
  color?: Partial<UiConfig["color"]>;
  surface?: Partial<UiConfig["surface"]>;
  spacing?: Partial<UiConfig["spacing"]>;
  layout?: Partial<UiConfig["layout"]>;
  measure?: Partial<UiConfig["measure"]>;
  typography?: Partial<UiConfig["typography"]>;
};

function mergeUiConfig(base: UiConfig, override: UserUiConfig): UiConfig {
  const theme = override.theme ?? base.theme;
  const density = override.density ?? base.density;
  const themeTokens = getThemeTokens(theme);
  const densityTokens = getDensityTokens(density);

  return {
    language: override.language ?? base.language,
    theme,
    density,
    font: { ...base.font, ...override.font },
    color: { ...themeTokens.color, ...override.color },
    surface: { ...themeTokens.surface, ...override.surface },
    spacing: { ...densityTokens.spacing, ...override.spacing },
    layout: { ...densityTokens.layout, ...override.layout },
    measure: { ...densityTokens.measure, ...override.measure },
    typography: { ...densityTokens.typography, ...override.typography },
  };
}

function findUserConfigPath() {
  const candidates = [
    path.join(process.cwd(), "relay.ui.toml"),
    path.join(process.cwd(), "..", "relay.ui.toml"),
    path.join(process.cwd(), "..", "..", "relay.ui.toml"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function loadUiConfig(): UiConfig {
  const configPath = findUserConfigPath();

  if (!configPath) {
    return defaultUiConfig;
  }

  try {
    const tomlText = fs.readFileSync(configPath, "utf8");
    const parsed = parse(tomlText) as UserUiConfig;
    return mergeUiConfig(defaultUiConfig, parsed);
  } catch (error) {
    console.error("Failed to load relay.ui.toml, falling back to defaults.", error);
    return defaultUiConfig;
  }
}

export function getUiCssVariables(config: UiConfig): CSSProperties {
  return {
    "--bg": config.color.bg,
    "--bg-panel": config.color.bgPanel,
    "--bg-soft": config.color.bgSoft,
    "--bg-topbar": config.color.bgTopbar,
    "--bg-elevated": config.color.bgElevated,
    "--bg-settings": config.color.bgSettings,
    "--line": config.color.line,
    "--line-strong": config.color.lineStrong,
    "--text": config.color.text,
    "--text-soft": config.color.textSoft,
    "--text-dim": config.color.textDim,
    "--blue": config.color.blue,
    "--green": config.color.green,
    "--amber": config.color.amber,
    "--red": config.color.red,
    "--accent": config.color.accent,
    "--surface-overlay": config.surface.overlay,
    "--surface-1": config.surface.level1,
    "--surface-2": config.surface.level2,
    "--surface-3": config.surface.level3,
    "--surface-4": config.surface.level4,
    "--surface-5": config.surface.level5,
    "--surface-session-active": config.surface.sessionActive,
    "--surface-calendar-1": config.surface.calendar1,
    "--surface-calendar-2": config.surface.calendar2,
    "--surface-calendar-3": config.surface.calendar3,
    "--surface-legend-1": config.surface.legend1,
    "--surface-legend-2": config.surface.legend2,
    "--surface-legend-3": config.surface.legend3,
    "--accent-border": config.surface.accentBorder,
    "--color-code-text": config.surface.codeText,
    "--space-1": config.spacing[1],
    "--space-2": config.spacing[2],
    "--space-3": config.spacing[3],
    "--space-4": config.spacing[4],
    "--space-5": config.spacing[5],
    "--space-6": config.spacing[6],
    "--space-7": config.spacing[7],
    "--space-8": config.spacing[8],
    "--space-9": config.spacing[9],
    "--space-10": config.spacing[10],
    "--topbar-height": config.layout.topbarHeight,
    "--settings-panel-width": config.layout.settingsPanelWidth,
    "--workspace-left-width": config.layout.workspaceLeftWidth,
    "--workspace-center-min-width": config.layout.workspaceCenterMinWidth,
    "--workspace-right-width": config.layout.workspaceRightWidth,
    "--workspace-sidepanel-primary-width": config.layout.workspaceSidepanelPrimaryWidth,
    "--workspace-message-max-width": config.layout.workspaceMessageMaxWidth,
    "--workspace-system-message-max-width": config.layout.workspaceSystemMessageMaxWidth,
    "--sessions-left-width": config.layout.sessionsLeftWidth,
    "--sessions-right-width": config.layout.sessionsRightWidth,
    "--memories-left-ratio": config.layout.memoriesLeftRatio,
    "--memories-right-ratio": config.layout.memoriesRightRatio,
    "--memories-right-min-width": config.layout.memoriesRightMinWidth,
    "--panel-center-x-padding": config.layout.panelCenterXPadding,
    "--border-width": config.measure.borderWidth,
    "--accent-strip-width": config.measure.accentStripWidth,
    "--session-row-indent": config.measure.sessionRowIndent,
    "--tab-min-height": config.measure.tabMinHeight,
    "--calendar-unit-size": config.measure.calendarUnitSize,
    "--calendar-cell-gap": config.measure.calendarCellGap,
    "--calendar-cell-padding-y": config.measure.calendarCellPaddingY,
    "--calendar-cell-padding-x": config.measure.calendarCellPaddingX,
    "--workspace-log-nudge-y": config.measure.workspaceLogNudgeY,
    "--font-meta-xs": config.typography.metaXs,
    "--font-meta": config.typography.meta,
    "--font-ui-sm": config.typography.uiSm,
    "--font-ui": config.typography.ui,
    "--font-nav": config.typography.nav,
    "--font-title-sm": config.typography.titleSm,
    "--font-title": config.typography.title,
  } as CSSProperties;
}

export { defaultUserUiToml };
export type { AppLanguage, AppTheme, AppDensity, AppUiFont, AppMonoFont, AppCjkFont, UiConfig, UserUiConfig };
