// @vitest-environment jsdom
/**
 * ParticleBackground sits in the dashboard layout, so its requestAnimationFrame
 * loop runs behind every route including the data surfaces. The blanket rule in
 * app/globals.css clamps CSS animation and transition only — it cannot reach a
 * canvas draw loop, so the component has to consult the preference itself.
 */
import { render } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/client/particle-zones", () => ({
  useParticleZones: () => ({ zones: [] }),
}));

import ParticleBackground from "../ParticleBackground";

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  // @ts-expect-error — drop the per-test stub
  delete window.matchMedia;
  vi.restoreAllMocks();
});

describe("ParticleBackground", () => {
  it("renders no canvas and starts no animation frame under reduced motion", () => {
    mockReducedMotion(true);
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { container } = render(<ParticleBackground />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(raf).not.toHaveBeenCalled();
  });

  it("renders the canvas when no preference is set", () => {
    mockReducedMotion(false);
    // jsdom ships no 2D context; a no-op proxy lets the draw setup run so the
    // assertion is about our gate, not about jsdom's canvas support.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D,
    );
    const { container } = render(<ParticleBackground />);
    expect(container.querySelector("canvas")).not.toBeNull();
  });
});
