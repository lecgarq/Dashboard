"use client";
import type { ExplicitMap, FolderIndex } from "@/lib/forma/inheritance";
import type { FormaTier } from "@/lib/forma/tiers";
import type { FormaRole } from "@/lib/forma/defaultRoles";
import { useHierarchyLayout } from "./useHierarchyLayout";
import { HierarchyCanvas } from "./HierarchyCanvas";

/**
 * Thin shell — public 8-prop API is identical to the pre-split component.
 * The d3-hierarchy layout computation lives in `useHierarchyLayout`.
 * The SVG/DOM render + zoom/pan + role-picker live in `HierarchyCanvas`.
 *
 * This file is the `dynamic(ssr:false)` import boundary in plan 06-04:
 * the heavy d3-hierarchy bundle (~15KB gzipped) is deferred because it is
 * only reachable through this file → HierarchyCanvas → useHierarchyLayout.
 */
export function HierarchyView(props: {
  index: FolderIndex;
  explicit: ExplicitMap;
  rootLabel: string;
  roles: FormaRole[];
  activeRoleId: string;
  activeRoleLabel: string;
  onPickRole: (roleId: string) => void;
  onSetTier: (folderId: string, tier: FormaTier) => void;
  onApplySubtree: (folderId: string, tier: FormaTier) => void;
  onClear: (folderId: string) => void;
}) {
  const layout = useHierarchyLayout(props.index, props.explicit);
  return (
    <HierarchyCanvas
      nodes={layout.nodes}
      links={layout.links}
      bbox={layout.bbox}
      collapsed={layout.collapsed}
      onToggle={layout.toggle}
      {...props}
    />
  );
}
