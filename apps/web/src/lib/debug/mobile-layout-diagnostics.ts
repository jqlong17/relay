"use client";

export const MOBILE_LAYOUT_DEBUG_QUERY_PARAM = "debugMobileLayout";
export const MOBILE_LAYOUT_DEBUG_STORAGE_KEY = "relay.debug.mobile-layout";
export const MOBILE_LAYOUT_DEBUG_LOG_STORAGE_KEY = "relay.debug.mobile-layout.log.v1";
export const MOBILE_LAYOUT_DEBUG_DEFAULT_CAPACITY = 200;

export type MobileLayoutDiagnosticEntry = {
  id: string;
  timestamp: number;
  type: string;
  note: string;
  target: string;
  snapshot: MobileLayoutDiagnosticSnapshot;
};

export type MobileLayoutDiagnosticSnapshot = {
  focus: {
    activeElement: string;
  };
  viewport: {
    innerHeight: number;
    visualViewportHeight: number | null;
    visualViewportOffsetTop: number | null;
    visualViewportOffsetLeft: number | null;
  };
  scroll: {
    windowScrollY: number;
    timelineScrollTop: number | null;
  };
  vars: Record<string, string>;
  computed: {
    appHeight: string;
    composerPosition: string;
    composerTop: string;
    composerBottom: string;
  };
  rects: {
    app: SerializedRect | null;
    topbar: SerializedRect | null;
    composer: SerializedRect | null;
    input: SerializedRect | null;
  };
};

export type MobileLayoutDiagnosticsStore = {
  clear: () => void;
  exportEntries: () => string;
  getEntries: () => MobileLayoutDiagnosticEntry[];
  record: (entry: Omit<MobileLayoutDiagnosticEntry, "id" | "timestamp">) => void;
};

type MobileLayoutDiagnosticsStoreOptions = {
  capacity?: number;
  now?: () => number;
  onChange?: (entries: MobileLayoutDiagnosticEntry[]) => void;
  sessionStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
};

type CaptureSnapshotOptions = {
  appRoot: HTMLElement | null;
  composer: HTMLElement | null;
  doc?: Document;
  input: HTMLElement | null;
  timeline: HTMLElement | null;
  topbar: HTMLElement | null;
  win?: Window;
};

type SerializedRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export function isMobileLayoutDiagnosticsEnabled(
  search: string,
  storage?: Pick<Storage, "getItem"> | null,
) {
  const params = new URLSearchParams(search);
  if (params.get(MOBILE_LAYOUT_DEBUG_QUERY_PARAM) === "1") {
    return true;
  }

  return storage?.getItem(MOBILE_LAYOUT_DEBUG_STORAGE_KEY) === "1";
}

export function describeDiagnosticTarget(target: EventTarget | Element | null | undefined) {
  if (!(target instanceof Element)) {
    return "unknown";
  }

  const tagName = target.tagName.toLowerCase();
  const id = target.id ? `#${target.id}` : "";
  const className = typeof target.className === "string"
    ? target.className
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((name) => `.${name}`)
        .join("")
    : "";

  return `${tagName}${id}${className}` || tagName;
}

export function captureMobileLayoutSnapshot({
  appRoot,
  composer,
  doc = document,
  input,
  timeline,
  topbar,
  win = window,
}: CaptureSnapshotOptions): MobileLayoutDiagnosticSnapshot {
  const viewport = win.visualViewport;
  const appStyles = appRoot ? win.getComputedStyle(appRoot) : null;
  const composerStyles = composer ? win.getComputedStyle(composer) : null;

  return {
    focus: {
      activeElement: describeDiagnosticTarget(doc.activeElement),
    },
    viewport: {
      innerHeight: win.innerHeight,
      visualViewportHeight: viewport?.height ?? null,
      visualViewportOffsetTop: viewport?.offsetTop ?? null,
      visualViewportOffsetLeft: viewport?.offsetLeft ?? null,
    },
    scroll: {
      windowScrollY: win.scrollY,
      timelineScrollTop: timeline?.scrollTop ?? null,
    },
    vars: {
      mobileAppHeight: appStyles?.getPropertyValue("--mobile-app-height").trim() ?? "",
      mobileTopbarHeight: appStyles?.getPropertyValue("--mobile-topbar-height").trim() ?? "",
      mobileComposerHeight: appStyles?.getPropertyValue("--mobile-composer-height").trim() ?? "",
      mobileComposerTop: appStyles?.getPropertyValue("--mobile-composer-top").trim() ?? "",
      mobileViewportBottomOffset: appStyles?.getPropertyValue("--mobile-viewport-bottom-offset").trim() ?? "",
      mobileIosBottomBoost: appStyles?.getPropertyValue("--mobile-ios-bottom-boost").trim() ?? "",
      mobileKeyboardFallbackReserve: appStyles?.getPropertyValue("--mobile-keyboard-fallback-reserve").trim() ?? "",
    },
    computed: {
      appHeight: appStyles?.height ?? "",
      composerPosition: composerStyles?.position ?? "",
      composerTop: composerStyles?.top ?? "",
      composerBottom: composerStyles?.bottom ?? "",
    },
    rects: {
      app: serializeRect(appRoot),
      topbar: serializeRect(topbar),
      composer: serializeRect(composer),
      input: serializeRect(input),
    },
  };
}

export function createMobileLayoutDiagnosticsStore({
  capacity = MOBILE_LAYOUT_DEBUG_DEFAULT_CAPACITY,
  now = () => Date.now(),
  onChange,
  sessionStorage = null,
}: MobileLayoutDiagnosticsStoreOptions = {}): MobileLayoutDiagnosticsStore {
  let sequence = 0;
  let entries = readPersistedEntries(sessionStorage, capacity);

  const emit = () => {
    persistEntries(sessionStorage, entries);
    onChange?.([...entries]);
  };

  return {
    clear() {
      entries = [];
      emit();
    },
    exportEntries() {
      return JSON.stringify(entries, null, 2);
    },
    getEntries() {
      return [...entries];
    },
    record(entry) {
      const timestamp = now();
      sequence += 1;
      entries = [...entries, {
        ...entry,
        id: `mobile-layout-${timestamp}-${sequence}`,
        timestamp,
      }].slice(-capacity);
      emit();
    },
  };
}

function serializeRect(element: HTMLElement | null): SerializedRect | null {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  return {
    bottom: roundRectValue(rect.bottom),
    height: roundRectValue(rect.height),
    left: roundRectValue(rect.left),
    right: roundRectValue(rect.right),
    top: roundRectValue(rect.top),
    width: roundRectValue(rect.width),
  };
}

function roundRectValue(value: number) {
  return Math.round(value * 100) / 100;
}

function persistEntries(
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
  entries: MobileLayoutDiagnosticEntry[],
) {
  if (!storage) {
    return;
  }

  if (entries.length === 0) {
    storage.removeItem(MOBILE_LAYOUT_DEBUG_LOG_STORAGE_KEY);
    return;
  }

  storage.setItem(MOBILE_LAYOUT_DEBUG_LOG_STORAGE_KEY, JSON.stringify(entries));
}

function readPersistedEntries(
  storage: Pick<Storage, "getItem"> | null | undefined,
  capacity: number,
) {
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(MOBILE_LAYOUT_DEBUG_LOG_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as MobileLayoutDiagnosticEntry[];
    return Array.isArray(parsed) ? parsed.slice(-capacity) : [];
  } catch {
    return [];
  }
}
