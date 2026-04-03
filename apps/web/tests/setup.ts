import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined") {
  const localStorageStore = new Map<string, string>();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear() {
        localStorageStore.clear();
      },
      getItem(key: string) {
        return localStorageStore.has(key) ? localStorageStore.get(key)! : null;
      },
      key(index: number) {
        return Array.from(localStorageStore.keys())[index] ?? null;
      },
      removeItem(key: string) {
        localStorageStore.delete(key);
      },
      setItem(key: string, value: string) {
        localStorageStore.set(key, value);
      },
      get length() {
        return localStorageStore.size;
      },
    } satisfies Storage,
    writable: true,
  });

  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    writable: true,
    value: undefined,
  });

  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame;

  window.cancelAnimationFrame = vi.fn();

  class ResizeObserverMock {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  }

  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverMock,
    writable: true,
  });

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverMock,
    writable: true,
  });
}

if (typeof HTMLElement !== "undefined") {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
}
