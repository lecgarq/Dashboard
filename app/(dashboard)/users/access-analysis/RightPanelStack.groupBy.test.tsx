// @vitest-environment jsdom
import fs from "fs";
import path from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RightPanelStack } from "./RightPanelStack";
import { SliderProvider } from "./SliderContext";
import { SelectionProvider } from "./SelectionContext";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { PhysicsLayer } from "./physicsLayer";
import { useSelection } from "./SelectionContext";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    accDcGraph: { bulkUsers: { useQuery: () => ({ data: [] }) } },
    accMembers: { enrichedUsers: { useQuery: () => ({ data: [] }) } },
    users: {
      getOrgDirectory: { useQuery: () => ({ data: undefined }) },
      getDirectory: { useQuery: () => ({ data: [] }) },
    },
  },
}));

vi.mock("../UserProfilePanel", () => ({
  UserProfilePanel: (props: {
    onClose?: () => void;
    railPrelude?: React.ReactNode;
  }) => (
    <aside data-testid="user-detail-panel">
      <header data-testid="user-detail-header">
        Identity
        <button onClick={props.onClose}>Close</button>
      </header>
      {props.railPrelude}
      <div data-testid="acc-profile-body">ACC profile</div>
    </aside>
  ),
}));

function dim(id: string): CatalogDimension {
  return {
    id,
    label: id === "role" ? "Role" : "Company",
    family: "structure",
    kind: "categorical",
    source: "test",
    confidence: "high",
    available: true,
    surfaces: ["slider", "color"],
    extract: () => null,
  } as CatalogDimension;
}

const CATALOG = [dim("company"), dim("role")];
const physics = {
  getTargets: () => ({}),
  getDimWeights: () => ({}),
  registerTargets: vi.fn(),
  updateSliders: vi.fn(),
  setActiveInput: vi.fn(),
} as unknown as PhysicsLayer;

function SelectUserButton(): React.JSX.Element {
  const { setIsolated } = useSelection();
  return <button onClick={() => setIsolated(0)}>Select user</button>;
}

function renderStack(over: Partial<React.ComponentProps<typeof RightPanelStack>> = {}): void {
  render(
    <SliderProvider physics={physics} catalog={CATALOG}>
      <SelectionProvider>
        <SelectUserButton />
        <RightPanelStack
          features={[]}
          physics={physics}
          catalog={CATALOG}
          visibleSelectedIndices={null}
          groupBy="general"
          onGroupByChange={vi.fn()}
          colorLabel="Role"
          {...over}
        />
      </SelectionProvider>
    </SliderProvider>,
  );
}

describe("RightPanelStack — base rail views", () => {
  it("defaults to Layout and keeps Dimensions lazy", () => {
    renderStack();
    expect(screen.getByTestId("group-by-controls")).toBeTruthy();
    expect(screen.queryByTestId("catalog-slider-sidebar")).toBeNull();
    expect(screen.getByRole("tab", { name: "Layout" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Dimensions" }).getAttribute("aria-selected")).toBe("false");
  });

  it("loads Dimensions only after its tab is selected", async () => {
    renderStack();
    const dimensionsTab = screen.getByTestId("dimensions-tab");
    fireEvent.mouseDown(dimensionsTab, { button: 0, ctrlKey: false });
    fireEvent.click(dimensionsTab);
    expect(await screen.findByTestId("catalog-slider-sidebar")).toBeTruthy();
    expect(screen.queryByTestId("group-by-controls")).toBeNull();
    expect(screen.getByRole("tab", { name: "Dimensions" }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps user detail above the base rail and inserts matches before the profile body", () => {
    renderStack({
      features: [{
        nodeId: "u1::p1",
        nameLower: "ada",
        emailLower: "ada@example.com",
        project: "Tower",
        role: "Architect",
        permTier: "edit",
        isExternal: false,
        activityBucket: "High",
        signinBucket: "<7d",
        activityCountRaw: 1,
        lastSignInRel: "today",
        permissionCoverage: "known",
        firmName: "ACME",
        accountStatus: "active",
      }],
      neighborPanel: <section data-testid="neighbor-panel">Closest matches</section>,
    });
    fireEvent.click(screen.getByRole("button", { name: "Select user" }));
    expect(screen.getByTestId("right-panel-stack").getAttribute("data-top-layer")).toBe("user-detail");
    const matches = screen.getByTestId("neighbor-panel");
    const profile = screen.getByTestId("acc-profile-body");
    expect(matches.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("right-panel-stack").getAttribute("data-top-layer")).toBe("sliders");
  });

  it("pins 180ms rail motion and a zero-duration reduced-motion branch", () => {
    const source = fs.readFileSync(path.join(__dirname, "RightPanelStack.tsx"), "utf8");
    expect(source).toContain("useReducedMotion");
    expect(source).toContain("duration: reducedMotion ? 0 : 0.18");
    expect(source).not.toContain("stagger");
  });
});
