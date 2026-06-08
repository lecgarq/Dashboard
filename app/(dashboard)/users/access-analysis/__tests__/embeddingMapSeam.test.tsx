// @vitest-environment jsdom
/**
 * embeddingMapSeam.test.tsx — flag-OFF renderer-integration seam.
 *
 * Confirms the similarity-embedding map (flag NEXT_PUBLIC_ACC_3D_GRAPH unset, the
 * default) drives the Group-by + Strength morph through the descriptor seam while
 * keeping the embedding scatter as the rest state:
 *   - GraphCanvas receives a layoutTarget (a function) → clusterActive=true so the
 *     clusterTransitionLayer eases toward the embedding-blob descriptor. At rest
 *     (strength 0) that descriptor returns the embedding scatter, so positions are
 *     unchanged until the user raises the Grouping-strength slider.
 *   - GraphCanvas receives gpuSimulation=false → no GPU force sim; positions come
 *     purely from the eased descriptor (real-time, no physics to lag or jump).
 *   - At rest (strength 0) MapClusterLabels receives null centers / empty labels →
 *     it renders nothing (labels fade in only once grouping begins).
 *
 * The default test env leaves NEXT_PUBLIC_ACC_3D_GRAPH unset, so ACC_3D_GRAPH_ENABLED
 * is false — exactly the flag-OFF path under test. Child components and tRPC are
 * mocked so we can render ShellBody and observe the prop seam without GPU/DuckDB.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { PhysicsLayer } from "../physicsLayer";
import type { NodeFeatureSnapshot } from "../interactionTypes";
import type { CatalogDimension } from "../dimensionCatalog.types";

// ---- Capture sinks ----------------------------------------------------------

const captured: {
  graphCanvasProps: Record<string, unknown> | null;
  mapLabelProps: Record<string, unknown> | null;
} = { graphCanvasProps: null, mapLabelProps: null };

// ---- Child + dependency mocks ----------------------------------------------

vi.mock("../GraphCanvas", () => ({
  GraphCanvas: function MockGraphCanvas(props: Record<string, unknown>): null {
    captured.graphCanvasProps = props;
    return null;
  },
}));

vi.mock("../MapClusterLabels", () => ({
  // Mirror the real component's render contract: renders nothing when there are
  // no labelable clusters (empty labels / null centers), which is the flag-OFF
  // case. We capture props to assert the seam directly.
  MapClusterLabels: function MockMapClusterLabels(
    props: Record<string, unknown>,
  ): React.JSX.Element | null {
    captured.mapLabelProps = props;
    const labels = props.labels as ReadonlyArray<string>;
    if (!labels || labels.length === 0) return null;
    return <div data-testid="map-cluster-labels" />;
  },
}));

// Stub the heavy sibling children so we don't drag their dependency trees in;
// none participate in the position seam under test.
vi.mock("../Toolbar", () => ({ Toolbar: () => null }));
vi.mock("../GraphInteractions", () => ({
  GraphInteractions: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../RightPanelStack", () => ({ RightPanelStack: () => null }));
vi.mock("../Legend", () => ({ Legend: () => null }));
vi.mock("../NeighborMatchesPanel", () => ({ NeighborMatchesPanel: () => null }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

// tRPC: the only external data dependency ShellBody touches (instanceNeighbors).
vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    accDcGraph: {
      instanceNeighbors: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
  },
}));

import { ShellBody } from "../AccessAnalysisShell";
import { SliderProvider } from "../SliderContext";
import { FilterProvider } from "../FilterContext";
import { SelectionProvider } from "../SelectionContext";

// ---- Fixtures ---------------------------------------------------------------

function mkPhysics(n: number): PhysicsLayer {
  const xyz = new Float32Array(n * 3);
  // Distinctive embedding-like coords so a real static layer would render these.
  for (let i = 0; i < n; i++) {
    xyz[i * 3] = i * 11;
    xyz[i * 3 + 1] = i * 13;
    xyz[i * 3 + 2] = 0;
  }
  return {
    alphaMask: new Float32Array(n).fill(1),
    maskVersion: 0,
    positionsVersion: 1,
    frozen: true,
    updateSliders: vi.fn(),
    setMask: vi.fn(),
    setActiveInput: vi.fn(),
    getPositions: () => xyz,
    getTargets: () => ({}),
    getDimWeights: () => ({}),
    getSliders: () => ({}),
    syncPositions: vi.fn(),
    dispose: vi.fn(),
  } as unknown as PhysicsLayer;
}

function mkFeatures(n: number): NodeFeatureSnapshot[] {
  return Array.from({ length: n }, (_, i) => ({
    nodeId: String(i),
    nameLower: `n${i}`,
    emailLower: `n${i}@x.com`,
    project: "P",
    role: "member",
    permTier: null,
    isExternal: false,
    activityBucket: "Low",
    signinBucket: "<30d",
    activityCountRaw: 1,
    lastSignInRel: "today",
    permissionCoverage: "unknown",
    firmName: "",
    accountStatus: "",
  })) as unknown as NodeFeatureSnapshot[];
}

const catalog: CatalogDimension[] = [];

function renderBody(): void {
  const physics = mkPhysics(4);
  const features = mkFeatures(4);
  const Wrapper: React.FC = () => {
    const graphRef = React.useRef(null);
    return (
      <SliderProvider physics={physics as never} catalog={catalog}>
        <FilterProvider>
          <SelectionProvider>
            <ShellBody
              physics={physics}
              features={features}
              catalog={catalog}
              mode="2d"
              setMode={() => {}}
              lassoActive={false}
              setLassoActive={() => {}}
              graphRef={graphRef}
            />
          </SelectionProvider>
        </FilterProvider>
      </SliderProvider>
    );
  };
  render(<Wrapper />);
}

// ---- Tests ------------------------------------------------------------------

describe("flag-OFF embedding-map seam", () => {
  it("passes a layoutTarget to GraphCanvas (Group-by descriptor morph enabled)", () => {
    captured.graphCanvasProps = null;
    renderBody();
    expect(captured.graphCanvasProps).not.toBeNull();
    // The projector map is no longer inert: it always supplies a layoutTarget so the
    // descriptor morph runs. gpuSimulation stays false (next test), so positions come
    // from the eased descriptor — and at strength 0 that descriptor is the scatter.
    expect(typeof captured.graphCanvasProps!.layoutTarget).toBe("function");
  });

  it("freezes cosmos via gpuSimulation=false (static embedding coords are not scattered)", () => {
    captured.graphCanvasProps = null;
    renderBody();
    expect(captured.graphCanvasProps!.gpuSimulation).toBe(false);
  });

  it("feeds MapClusterLabels no blob footprints (null centers, empty labels)", () => {
    captured.mapLabelProps = null;
    renderBody();
    expect(captured.mapLabelProps).not.toBeNull();
    expect(captured.mapLabelProps!.centersX).toBeNull();
    expect(captured.mapLabelProps!.centersY).toBeNull();
    expect(captured.mapLabelProps!.labels).toEqual([]);
  });
});
