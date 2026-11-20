import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom lacks these browser APIs; animation code (motion) uses them.
if (typeof window !== "undefined") {
  if (!("IntersectionObserver" in window)) {
    class IO {
      private cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
      }
      observe(el: Element) {
        // Report everything as visible right away, so "reveal on scroll" content shows in tests.
        this.cb([{ isIntersecting: true, intersectionRatio: 1, target: el } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    Object.assign(window, { IntersectionObserver: IO });
  }
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
}

afterEach(() => {
  if (typeof document === "undefined") return; // node-environment tests (e.g. size checks)
  cleanup();
  localStorage.clear();
});
