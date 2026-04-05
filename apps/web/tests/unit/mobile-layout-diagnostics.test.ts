import { beforeEach, describe, expect, it } from "vitest";

import {
  MOBILE_LAYOUT_DEBUG_LOG_STORAGE_KEY,
  MOBILE_LAYOUT_DEBUG_STORAGE_KEY,
  captureMobileLayoutSnapshot,
  createMobileLayoutDiagnosticsStore,
  describeDiagnosticTarget,
  isMobileLayoutDiagnosticsEnabled,
} from "@/lib/debug/mobile-layout-diagnostics";

describe("mobile layout diagnostics", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.body.innerHTML = "";
  });

  it("enables diagnostics from query or local storage", () => {
    expect(isMobileLayoutDiagnosticsEnabled("?debugMobileLayout=1", window.localStorage)).toBe(true);
    expect(isMobileLayoutDiagnosticsEnabled("", window.localStorage)).toBe(false);

    window.localStorage.setItem(MOBILE_LAYOUT_DEBUG_STORAGE_KEY, "1");
    expect(isMobileLayoutDiagnosticsEnabled("", window.localStorage)).toBe(true);
  });

  it("persists entries in a capped session buffer", () => {
    const store = createMobileLayoutDiagnosticsStore({
      capacity: 2,
      now: (() => {
        let value = 100;
        return () => value++;
      })(),
      sessionStorage: window.sessionStorage,
    });

    store.record(makeEntry("one"));
    store.record(makeEntry("two"));
    store.record(makeEntry("three"));

    const entries = store.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.type).toBe("two");
    expect(entries[1]?.type).toBe("three");

    const persisted = JSON.parse(window.sessionStorage.getItem(MOBILE_LAYOUT_DEBUG_LOG_STORAGE_KEY) ?? "[]") as Array<{
      type: string;
    }>;
    expect(persisted.map((entry) => entry.type)).toEqual(["two", "three"]);

    store.clear();
    expect(window.sessionStorage.getItem(MOBILE_LAYOUT_DEBUG_LOG_STORAGE_KEY)).toBeNull();
  });

  it("captures the current layout snapshot from the app root", () => {
    const app = document.createElement("main");
    app.className = "mobile-app";
    app.style.setProperty("--mobile-app-height", "724px");
    app.style.setProperty("--mobile-composer-top", "412px");
    app.style.setProperty("--mobile-keyboard-fallback-reserve", "116px");

    const composer = document.createElement("div");
    composer.className = "mobile-composer";
    composer.style.position = "fixed";
    composer.style.top = "412px";

    const input = document.createElement("textarea");
    input.className = "mobile-composer-input";
    composer.appendChild(input);
    app.appendChild(composer);
    document.body.appendChild(app);
    input.focus();

    const snapshot = captureMobileLayoutSnapshot({
      appRoot: app,
      composer,
      input,
      timeline: null,
      topbar: null,
    });

    expect(snapshot.focus.activeElement).toContain("textarea");
    expect(snapshot.vars.mobileAppHeight).toBe("724px");
    expect(snapshot.vars.mobileComposerTop).toBe("412px");
    expect(snapshot.vars.mobileKeyboardFallbackReserve).toBe("116px");
    expect(snapshot.computed.composerPosition).toBe("fixed");
    expect(snapshot.computed.composerTop).toBe("412px");
    expect(describeDiagnosticTarget(input)).toContain("textarea.mobile-composer-input");
  });
});

function makeEntry(type: string) {
  return {
    note: "",
    snapshot: {
      computed: {
        appHeight: "0px",
        composerBottom: "auto",
        composerPosition: "fixed",
        composerTop: "0px",
      },
      focus: {
        activeElement: "textarea",
      },
      rects: {
        app: null,
        composer: null,
        input: null,
        topbar: null,
      },
      scroll: {
        timelineScrollTop: null,
        windowScrollY: 0,
      },
      vars: {
        mobileAppHeight: "0px",
        mobileComposerHeight: "0px",
        mobileComposerTop: "0px",
        mobileIosBottomBoost: "0px",
        mobileKeyboardFallbackReserve: "0px",
        mobileTopbarHeight: "0px",
        mobileViewportBottomOffset: "0px",
      },
      viewport: {
        innerHeight: 0,
        visualViewportHeight: null,
        visualViewportOffsetLeft: null,
        visualViewportOffsetTop: null,
      },
    },
    target: "textarea",
    type,
  };
}
