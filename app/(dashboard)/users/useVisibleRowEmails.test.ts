// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useVisibleRowEmails } from "./useVisibleRowEmails";

// ---------------------------------------------------------------------------
// Manual IntersectionObserver mock — exposes `.simulate(entries)` so tests
// can imperatively fire intersection events without scrolling a real layout.
// ---------------------------------------------------------------------------

type Cb = (entries: IntersectionObserverEntry[]) => void;

let observerInstances: MockIO[] = [];

class MockIO {
  callback: Cb;
  options: IntersectionObserverInit | undefined;
  observed: Set<Element> = new Set();
  disconnectCount = 0;
  constructor(cb: Cb, opts?: IntersectionObserverInit) {
    this.callback = cb;
    this.options = opts;
    observerInstances.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
    this.disconnectCount += 1;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  // Helper used by tests.
  simulate(entries: Array<{ target: Element; isIntersecting: boolean }>) {
    this.callback(
      entries.map(
        (e) =>
          ({
            target: e.target,
            isIntersecting: e.isIntersecting,
            intersectionRatio: e.isIntersecting ? 1 : 0,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: 0,
          }) as IntersectionObserverEntry,
      ),
    );
  }
}

// rAF mock that we can flush imperatively.
let rafQueue: FrameRequestCallback[] = [];
function flushRaf() {
  const q = rafQueue;
  rafQueue = [];
  q.forEach((cb) => cb(0));
}

beforeEach(() => {
  observerInstances = [];
  rafQueue = [];
  vi.stubGlobal(
    "IntersectionObserver",
    MockIO as unknown as typeof IntersectionObserver,
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (_id: number) => {
    // no-op for tests; we flush manually.
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeRow() {
  return document.createElement("div");
}

describe("useVisibleRowEmails", () => {
  it("returns the visible subset when some rows intersect", () => {
    const { result } = renderHook(() => useVisibleRowEmails());

    const elA = makeRow();
    const elB = makeRow();
    const elC = makeRow();

    act(() => {
      result.current.registerRow("a@x.com")(elA);
      result.current.registerRow("b@x.com")(elB);
      result.current.registerRow("c@x.com")(elC);
    });

    const obs = observerInstances[0];
    expect(obs).toBeDefined();

    act(() => {
      obs.simulate([
        { target: elA, isIntersecting: true },
        { target: elB, isIntersecting: true },
        { target: elC, isIntersecting: false },
      ]);
      flushRaf();
    });

    expect(result.current.visibleEmails).toEqual(["a@x.com", "b@x.com"]);
  });

  it("removes an email when its ref callback is invoked with null", () => {
    const { result } = renderHook(() => useVisibleRowEmails());

    const elA = makeRow();
    const refCbA = result.current.registerRow("a@x.com");

    act(() => {
      refCbA(elA);
    });
    const obs = observerInstances[0];

    act(() => {
      obs.simulate([{ target: elA, isIntersecting: true }]);
      flushRaf();
    });
    expect(result.current.visibleEmails).toEqual(["a@x.com"]);

    act(() => {
      refCbA(null);
      flushRaf();
    });
    expect(result.current.visibleEmails).toEqual([]);
    expect(obs.observed.has(elA)).toBe(false);
  });

  it("does not duplicate an email when re-registered with a new element", () => {
    const { result } = renderHook(() => useVisibleRowEmails());

    const el1 = makeRow();
    const el2 = makeRow();

    const refCb = result.current.registerRow("dup@x.com");
    act(() => {
      refCb(el1);
      refCb(el2); // rebind to a new node within the same closure
    });

    const obs = observerInstances[0];
    act(() => {
      obs.simulate([{ target: el2, isIntersecting: true }]);
      flushRaf();
    });

    expect(result.current.visibleEmails).toEqual(["dup@x.com"]);
    // Only el2 should remain observed.
    expect(obs.observed.has(el1)).toBe(false);
    expect(obs.observed.has(el2)).toBe(true);
  });

  it("disconnects the observer on unmount", () => {
    const { result, unmount } = renderHook(() => useVisibleRowEmails());
    act(() => {
      result.current.registerRow("a@x.com")(makeRow());
    });
    const obs = observerInstances[0];
    expect(obs.disconnectCount).toBe(0);
    unmount();
    expect(obs.disconnectCount).toBe(1);
  });

  it("coalesces rapid intersection callbacks via requestAnimationFrame", () => {
    const { result } = renderHook(() => useVisibleRowEmails());

    const elA = makeRow();
    const elB = makeRow();
    act(() => {
      result.current.registerRow("a@x.com")(elA);
      result.current.registerRow("b@x.com")(elB);
    });
    const obs = observerInstances[0];

    // Fire two intersection callbacks back-to-back without flushing rAF.
    act(() => {
      obs.simulate([{ target: elA, isIntersecting: true }]);
      obs.simulate([{ target: elB, isIntersecting: true }]);
    });

    // Before flushing rAF, the hook state has NOT been updated yet — only
    // one rAF is queued (coalesced).
    expect(rafQueue.length).toBe(1);
    expect(result.current.visibleEmails).toEqual([]);

    act(() => {
      flushRaf();
    });
    expect(result.current.visibleEmails).toEqual(["a@x.com", "b@x.com"]);
  });

  it("ignores empty / malformed email registrations", () => {
    const { result } = renderHook(() => useVisibleRowEmails());
    const el = makeRow();
    act(() => {
      result.current.registerRow("")(el);
      result.current.registerRow("not-an-email")(el);
    });
    // Observer should not have been used to observe these.
    // (Either no observer instance created, or it observed nothing.)
    const obs = observerInstances[0];
    if (obs) {
      expect(obs.observed.has(el)).toBe(false);
    }
    expect(result.current.visibleEmails).toEqual([]);
  });

  it("normalizes registered emails to lowercase", () => {
    const { result } = renderHook(() => useVisibleRowEmails());
    const el = makeRow();
    act(() => {
      result.current.registerRow("MixedCase@X.COM")(el);
    });
    const obs = observerInstances[0];
    act(() => {
      obs.simulate([{ target: el, isIntersecting: true }]);
      flushRaf();
    });
    expect(result.current.visibleEmails).toEqual(["mixedcase@x.com"]);
  });

  it("keeps registerRow identity stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useVisibleRowEmails());
    const before = result.current.registerRow;
    rerender();
    const after = result.current.registerRow;
    expect(after).toBe(before);
  });
});
