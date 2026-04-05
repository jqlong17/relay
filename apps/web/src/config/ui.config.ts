import type { CSSProperties } from "react";

import fs from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";

type AppLanguage = "zh" | "en";
type AppTheme = "dark" | "light" | "tea" | "linen";
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

# 全局主题：dark / light / tea / linen
theme = "light"

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

# workspace 页面中间对话区的横向内边距
workspaceCenterXPadding = "56px"

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

# automation 页面左侧规则列表宽度
automationListWidth = "320px"

# automation 页面右侧详情区最小宽度
automationDetailMinWidth = "780px"

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

[overview]
# 首页 / about 概览页品牌字尺寸
heroBrandSize = "clamp(2.5rem, 5.4vw, 4.4rem)"

# 首页 / about 概览页主标题尺寸
heroTitleSize = "clamp(1.5rem, 3.3vw, 2.7rem)"

# 首页 / about 概览页主标题移动端尺寸
heroTitleSizeMobile = "clamp(1.65rem, 7.4vw, 2.35rem)"

# 首页 / about 概览页说明文字尺寸
heroBodySize = "clamp(0.94rem, 1.18vw, 1rem)"

# 首页 / about 概览页章节标题尺寸
sectionTitleSize = "clamp(1.08rem, 1.55vw, 1.5rem)"

[shape]
# 常规卡片/消息块圆角
radiusMd = "10px"

# 胶囊按钮/状态标签圆角
radiusPill = "999px"

[effects]
# 浮层毛玻璃强度
blurStrong = "18px"

# workspace 底部输入区阴影
shadowComposer = "0 -12px 24px rgba(2, 3, 4, 0.42)"

# 底部吸附类面板阴影
shadowRaised = "0 -16px 36px rgba(0, 0, 0, 0.28)"

# 抽屉类面板阴影
shadowDrawer = "0 -18px 48px rgba(0, 0, 0, 0.34)"

# 下拉/菜单类浮层阴影
shadowFloating = "0 18px 40px rgba(0, 0, 0, 0.42)"

# 弹窗/对话框阴影
shadowDialog = "0 16px 40px rgba(1, 2, 3, 0.46)"

# 大型弹窗阴影
shadowDialogStrong = "0 24px 64px rgba(1, 2, 3, 0.5)"
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
  effects: {
    blurStrong: "18px",
    shadowComposer: "0 -12px 24px rgba(2, 3, 4, 0.42)",
    shadowRaised: "0 -16px 36px rgba(0, 0, 0, 0.28)",
    shadowDrawer: "0 -18px 48px rgba(0, 0, 0, 0.34)",
    shadowFloating: "0 18px 40px rgba(0, 0, 0, 0.42)",
    shadowDialog: "0 16px 40px rgba(1, 2, 3, 0.46)",
    shadowDialogStrong: "0 24px 64px rgba(1, 2, 3, 0.5)",
  },
} as const;

const lightThemeTokens = {
  color: {
    bg: "#f7f8f8",
    bgPanel: "#edf0f1",
    bgSoft: "#f9fafb",
    bgTopbar: "#f3f5f6",
    bgElevated: "#ffffff",
    bgSettings: "#f5f7f8",
    line: "rgba(79, 86, 94, 0.11)",
    lineStrong: "rgba(79, 86, 94, 0.18)",
    text: "#2a3138",
    textSoft: "#5e6872",
    textDim: "#89939d",
    blue: "#6f8fb2",
    green: "#4f7c62",
    amber: "#9d8866",
    red: "#c46f7d",
    accent: "#8b98a5",
  },
  surface: {
    overlay: "rgba(24, 30, 36, 0.05)",
    level1: "rgba(87, 96, 105, 0.025)",
    level2: "rgba(87, 96, 105, 0.04)",
    level3: "rgba(87, 96, 105, 0.055)",
    level4: "rgba(87, 96, 105, 0.07)",
    level5: "rgba(87, 96, 105, 0.09)",
    sessionActive: "#e6eaed",
    calendar1: "rgba(111, 143, 178, 0.12)",
    calendar2: "rgba(111, 143, 178, 0.2)",
    calendar3: "rgba(111, 143, 178, 0.3)",
    legend1: "rgba(111, 143, 178, 0.14)",
    legend2: "rgba(111, 143, 178, 0.24)",
    legend3: "rgba(111, 143, 178, 0.38)",
    accentBorder: "rgba(139, 152, 165, 0.28)",
    codeText: "#37414a",
  },
  effects: {
    blurStrong: "18px",
    shadowComposer: "0 -12px 24px rgba(77, 97, 122, 0.12)",
    shadowRaised: "0 -16px 36px rgba(77, 97, 122, 0.12)",
    shadowDrawer: "0 -18px 48px rgba(77, 97, 122, 0.14)",
    shadowFloating: "0 18px 40px rgba(77, 97, 122, 0.16)",
    shadowDialog: "0 16px 40px rgba(77, 97, 122, 0.14)",
    shadowDialogStrong: "0 24px 64px rgba(77, 97, 122, 0.18)",
  },
} as const;

const teaThemeTokens = {
  color: {
    bg: "#e7e0d2",
    bgPanel: "#ddd3c0",
    bgSoft: "#f2ebdf",
    bgTopbar: "rgba(228, 220, 205, 0.94)",
    bgElevated: "#f8f3ea",
    bgSettings: "#efe6d8",
    line: "rgba(92, 85, 67, 0.16)",
    lineStrong: "rgba(92, 85, 67, 0.28)",
    text: "#2f2a22",
    textSoft: "#5c5543",
    textDim: "#8c8473",
    blue: "#7f9697",
    green: "#5c5543",
    amber: "#b19c6b",
    red: "#9f6f5e",
    accent: "#8f7a4e",
  },
  surface: {
    overlay: "rgba(61, 47, 27, 0.06)",
    level1: "rgba(255, 251, 244, 0.4)",
    level2: "rgba(255, 250, 242, 0.56)",
    level3: "rgba(250, 242, 228, 0.72)",
    level4: "rgba(244, 233, 214, 0.82)",
    level5: "rgba(238, 224, 201, 0.92)",
    sessionActive: "#ede2cf",
    calendar1: "rgba(177, 156, 107, 0.16)",
    calendar2: "rgba(177, 156, 107, 0.28)",
    calendar3: "rgba(92, 85, 67, 0.34)",
    legend1: "rgba(177, 156, 107, 0.18)",
    legend2: "rgba(177, 156, 107, 0.3)",
    legend3: "rgba(92, 85, 67, 0.42)",
    accentBorder: "rgba(143, 122, 78, 0.42)",
    codeText: "#4d4535",
  },
  effects: {
    blurStrong: "18px",
    shadowComposer: "0 -12px 24px rgba(92, 85, 67, 0.14)",
    shadowRaised: "0 -16px 36px rgba(92, 85, 67, 0.12)",
    shadowDrawer: "0 -18px 48px rgba(92, 85, 67, 0.16)",
    shadowFloating: "0 18px 40px rgba(92, 85, 67, 0.14)",
    shadowDialog: "0 16px 40px rgba(92, 85, 67, 0.14)",
    shadowDialogStrong: "0 24px 64px rgba(92, 85, 67, 0.16)",
  },
} as const;

const linenThemeTokens = {
  color: {
    bg: "#fbfbf9",
    bgPanel: "#f6f7f4",
    bgSoft: "#ffffff",
    bgTopbar: "rgba(250, 250, 247, 0.94)",
    bgElevated: "#ffffff",
    bgSettings: "#f9faf7",
    line: "rgba(82, 88, 96, 0.1)",
    lineStrong: "rgba(82, 88, 96, 0.16)",
    text: "#2f3338",
    textSoft: "#606871",
    textDim: "#8a939d",
    blue: "#8ea0b2",
    green: "#6d7568",
    amber: "#b9afa0",
    red: "#b48784",
    accent: "#9da8b2",
  },
  surface: {
    overlay: "rgba(31, 38, 46, 0.04)",
    level1: "rgba(255, 255, 255, 0.82)",
    level2: "rgba(251, 252, 253, 0.9)",
    level3: "rgba(247, 248, 249, 0.94)",
    level4: "rgba(241, 243, 245, 0.98)",
    level5: "rgba(235, 238, 241, 1)",
    sessionActive: "#eef1f4",
    calendar1: "rgba(157, 168, 178, 0.12)",
    calendar2: "rgba(157, 168, 178, 0.2)",
    calendar3: "rgba(96, 104, 113, 0.24)",
    legend1: "rgba(157, 168, 178, 0.14)",
    legend2: "rgba(157, 168, 178, 0.24)",
    legend3: "rgba(96, 104, 113, 0.3)",
    accentBorder: "rgba(157, 168, 178, 0.24)",
    codeText: "#4d5560",
  },
  effects: {
    blurStrong: "18px",
    shadowComposer: "0 -12px 24px rgba(82, 88, 96, 0.08)",
    shadowRaised: "0 -16px 36px rgba(82, 88, 96, 0.06)",
    shadowDrawer: "0 -18px 48px rgba(82, 88, 96, 0.08)",
    shadowFloating: "0 18px 40px rgba(82, 88, 96, 0.08)",
    shadowDialog: "0 16px 40px rgba(82, 88, 96, 0.1)",
    shadowDialogStrong: "0 24px 64px rgba(82, 88, 96, 0.12)",
  },
} as const;

function getThemeTokens(theme: AppTheme) {
  if (theme === "light") {
    return lightThemeTokens;
  }

  if (theme === "linen") {
    return linenThemeTokens;
  }

  if (theme === "tea") {
    return teaThemeTokens;
  }

  return darkThemeTokens;
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
    workspaceCenterXPadding: "48px",
    workspaceRightWidth: "min(50vw, 720px)",
    workspaceSidepanelPrimaryWidth: "420px",
    workspaceMessageMaxWidth: "80%",
    workspaceSystemMessageMaxWidth: "58%",
    sessionsLeftWidth: "220px",
    sessionsRightWidth: "360px",
    automationListWidth: "320px",
    automationDetailMinWidth: "780px",
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
  overview: {
    heroBrandSize: "clamp(2.5rem, 5.4vw, 4.4rem)",
    heroTitleSize: "clamp(1.5rem, 3.3vw, 2.7rem)",
    heroTitleSizeMobile: "clamp(1.65rem, 7.4vw, 2.35rem)",
    heroBodySize: "clamp(0.94rem, 1.18vw, 1rem)",
    sectionTitleSize: "clamp(1.08rem, 1.55vw, 1.5rem)",
  },
  shape: {
    radiusMd: "10px",
    radiusPill: "999px",
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
    workspaceCenterXPadding: "64px",
    workspaceRightWidth: "min(54vw, 800px)",
    workspaceSidepanelPrimaryWidth: "460px",
    workspaceMessageMaxWidth: "78%",
    workspaceSystemMessageMaxWidth: "60%",
    sessionsLeftWidth: "248px",
    sessionsRightWidth: "396px",
    automationListWidth: "344px",
    automationDetailMinWidth: "840px",
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
  overview: {
    heroBrandSize: "clamp(2.7rem, 5.8vw, 4.8rem)",
    heroTitleSize: "clamp(1.62rem, 3.5vw, 2.9rem)",
    heroTitleSizeMobile: "clamp(1.74rem, 7.8vw, 2.5rem)",
    heroBodySize: "clamp(0.98rem, 1.28vw, 1.05rem)",
    sectionTitleSize: "clamp(1.14rem, 1.7vw, 1.62rem)",
  },
  shape: {
    radiusMd: "10px",
    radiusPill: "999px",
  },
} as const;

function getDensityTokens(density: AppDensity) {
  return density === "comfortable" ? comfortableDensityTokens : compactDensityTokens;
}

const defaultUiConfig = {
  language: "zh" as AppLanguage,
  theme: "light" as AppTheme,
  density: "compact" as AppDensity,
  font: {
    ui: "source-sans-3" as AppUiFont,
    mono: "jetbrains-mono" as AppMonoFont,
    cjk: "noto-sans-sc" as AppCjkFont,
  },
  ...getThemeTokens("light"),
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
  overview: DeepWiden<typeof compactDensityTokens.overview>;
  shape: DeepWiden<typeof compactDensityTokens.shape>;
  effects: DeepWiden<typeof darkThemeTokens.effects>;
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
  overview?: Partial<UiConfig["overview"]>;
  shape?: Partial<UiConfig["shape"]>;
  effects?: Partial<UiConfig["effects"]>;
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
    overview: { ...densityTokens.overview, ...override.overview },
    shape: { ...densityTokens.shape, ...override.shape },
    effects: { ...themeTokens.effects, ...override.effects },
  };
}

function parseUserUiConfigText(tomlText: string): UserUiConfig {
  return parse(tomlText) as UserUiConfig;
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
    const parsed = parseUserUiConfigText(tomlText);
    return mergeUiConfig(defaultUiConfig, parsed);
  } catch (error) {
    console.error("Failed to load relay.ui.toml, falling back to defaults.", error);
    return defaultUiConfig;
  }
}

export function resolveUiConfig(override: UserUiConfig = {}): UiConfig {
  return mergeUiConfig(defaultUiConfig, override);
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
    "--workspace-center-x-padding": config.layout.workspaceCenterXPadding,
    "--workspace-right-width": config.layout.workspaceRightWidth,
    "--workspace-sidepanel-primary-width": config.layout.workspaceSidepanelPrimaryWidth,
    "--workspace-message-max-width": config.layout.workspaceMessageMaxWidth,
    "--workspace-system-message-max-width": config.layout.workspaceSystemMessageMaxWidth,
    "--sessions-left-width": config.layout.sessionsLeftWidth,
    "--sessions-right-width": config.layout.sessionsRightWidth,
    "--automation-list-width": config.layout.automationListWidth,
    "--automation-detail-min-width": config.layout.automationDetailMinWidth,
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
    "--overview-hero-brand-size": config.overview.heroBrandSize,
    "--overview-hero-title-size": config.overview.heroTitleSize,
    "--overview-hero-title-size-mobile": config.overview.heroTitleSizeMobile,
    "--overview-hero-body-size": config.overview.heroBodySize,
    "--overview-section-title-size": config.overview.sectionTitleSize,
    "--radius-md": config.shape.radiusMd,
    "--radius-pill": config.shape.radiusPill,
    "--blur-strong": config.effects.blurStrong,
    "--shadow-composer": config.effects.shadowComposer,
    "--shadow-raised": config.effects.shadowRaised,
    "--shadow-drawer": config.effects.shadowDrawer,
    "--shadow-floating": config.effects.shadowFloating,
    "--shadow-dialog": config.effects.shadowDialog,
    "--shadow-dialog-strong": config.effects.shadowDialogStrong,
  } as CSSProperties;
}

export { defaultUserUiToml, parseUserUiConfigText };
export type { AppLanguage, AppTheme, AppDensity, AppUiFont, AppMonoFont, AppCjkFont, UiConfig, UserUiConfig };
