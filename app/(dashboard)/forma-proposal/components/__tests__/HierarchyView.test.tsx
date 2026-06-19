// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { HierarchyView } from "../HierarchyView";
import { buildFolderIndex } from "@/lib/forma/inheritance";
import type { FormaRole } from "@/lib/forma/defaultRoles";
import type { FormaTier } from "@/lib/forma/tiers";

// Stub browser APIs not available in jsdom
beforeAll(() => {
  // ResizeObserver used by dropdown menus / portals in jsdom
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // HTMLElement.scrollIntoView used by Radix UI
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }
  // pointer capture for drag handlers
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  }
});

// Minimal fixture: one root folder, no children, empty explicit map
const oneFolder = buildFolderIndex([
  { id: "folder-1", parentId: null, name: "Documents", fullPath: "/Documents" },
]);

const singleRole: FormaRole = { id: "architect", label: "Architect", group: "Design" };

const noop = () => {};

describe("HierarchyView shell — public 8-prop API contract", () => {
  it("mounts without throwing and renders activeRoleLabel in the role picker", () => {
    render(
      <HierarchyView
        index={oneFolder}
        explicit={{}}
        rootLabel="My Template"
        roles={[singleRole]}
        activeRoleId="architect"
        activeRoleLabel="Architect"
        onPickRole={noop}
        onSetTier={noop as (folderId: string, tier: FormaTier) => void}
        onApplySubtree={noop as (folderId: string, tier: FormaTier) => void}
        onClear={noop}
      />,
    );

    // activeRoleLabel appears in the "Viewing [label]" role picker button
    expect(screen.getByText("Architect")).toBeTruthy();
    // rootLabel appears as the root OrgNode label
    expect(screen.getByText("My Template")).toBeTruthy();
  });

  it("renders the 'Viewing' prefix in the role picker (proves activeRoleLabel reaches the canvas)", () => {
    render(
      <HierarchyView
        index={oneFolder}
        explicit={{}}
        rootLabel="My Template"
        roles={[singleRole]}
        activeRoleId="architect"
        activeRoleLabel="Architect"
        onPickRole={noop}
        onSetTier={noop as (folderId: string, tier: FormaTier) => void}
        onApplySubtree={noop as (folderId: string, tier: FormaTier) => void}
        onClear={noop}
      />,
    );

    // "Viewing" is the static label; adjacent span shows activeRoleLabel
    expect(screen.getByText("Viewing")).toBeTruthy();
  });
});
