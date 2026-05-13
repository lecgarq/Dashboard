// @vitest-environment jsdom

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Selection } from "@uwdata/mosaic-core";
import {
  MosaicCoordinatorProvider,
  useMosaicCoordinator,
  useMosaicSelection,
} from "./MosaicCoordinatorContext";

vi.mock("./duckdbClient", () => ({
  getDuckDbClient: vi.fn().mockResolvedValue({
    db: {},
    connection: {
      query: vi.fn().mockResolvedValue({ toArray: () => [] }),
    },
  }),
}));

describe("MosaicCoordinatorProvider", () => {
  it("exposes a Coordinator and a shared crossfilter Selection", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MosaicCoordinatorProvider>{children}</MosaicCoordinatorProvider>
    );

    const coordHook = renderHook(() => useMosaicCoordinator(), { wrapper });
    const selHook = renderHook(() => useMosaicSelection(), { wrapper });

    await act(async () => {
      // Drain microtasks AND the next macrotask so the deferred setCoordinator
      // (which awaits getDuckDbClient before flipping state) has fired. A bare
      // `await Promise.resolve()` flushes one microtask tick only and can pass
      // on a still-null coordinator.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(coordHook.result.current).not.toBeNull();
    expect(selHook.result.current).toBeInstanceOf(Selection);
  });

  it("throws if hooks are used outside the provider", () => {
    expect(() => renderHook(() => useMosaicCoordinator())).toThrow(
      /MosaicCoordinatorProvider/,
    );
    expect(() => renderHook(() => useMosaicSelection())).toThrow(
      /MosaicCoordinatorProvider/,
    );
  });
});
