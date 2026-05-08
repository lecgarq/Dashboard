"use client";

/**
 * Phase 04.1 Plan 03 — AdminAccessWidget rewrite (DASH-05).
 *
 * Animated orbit constellation. Replaces the prior table.
 *
 *   - Account-level admins only (`isAccountAdmin === true`).
 *   - Hand-rolled orbit math (cos/sin, angle = -π/2 + 2π·i/n) inside useMemo.
 *   - framer-motion drives spring entrance only (collapses to instant under
 *     prefers-reduced-motion via useTransition).
 *   - Hover/focus reveals INITIALS only (CONTEXT exception). Click → side
 *     panel via setSelected({ kind: "admin", email }).
 *   - Edge cases (Pitfall 6): 0 admins → empty state; 1 admin → centered
 *     pulsing node; 2 admins → forced poles at ±90° on smaller R.
 *   - Keyboard nav: arrow keys cycle admins by orbit index; Enter selects.
 *   - aria-label uses ordinal only ("Account admin 2 of 5") — no names in
 *     accessible text per CONTEXT lock.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import type { BulkAccUser } from "@/lib/acc/acc-types";

import { useSelection } from "../selectionContext";
import {
  HOVER_OPACITY_DIM,
  HOVER_OPACITY_FOCUS,
  ORBIT_SPRING,
  useDashboardAccent,
} from "./_shared/dashboardTokens";
import { useTransition } from "./_shared/useTransition";
import { useHoverSpotlight } from "./_shared/HoverSpotlight";
import { FocusRing } from "./_shared/FocusRing";
import { OrbitSkeleton } from "./_shared/WidgetSkeleton";

const W = 320;
const H = 320;
const CX = W / 2;
const CY = H / 2;
const R_DEFAULT = 110;
const R_TWO = 80;
const NODE_R = 14;

interface OrbitPoint {
  u: BulkAccUser;
  cx: number;
  cy: number;
}

function initialsOf(u: BulkAccUser): string {
  const name = (u.name ?? "").trim();
  if (name) {
    const parts = name.split(/\s+/);
    const first = parts[0]?.charAt(0) ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
    const initials = (first + last).toUpperCase();
    if (initials) return initials;
  }
  // Fallback: first 2 chars of email local-part
  const local = u.email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase();
}

export function AdminAccessWidget({ users }: { users: BulkAccUser[] }) {
  const { setSelected, selected } = useSelection();
  const { neutral, highlight } = useDashboardAccent();
  const transition = useTransition(ORBIT_SPRING);
  const { hoveredId, getOpacity, bind } = useHoverSpotlight();

  const admins = useMemo(
    () =>
      users
        .filter((u) => u.isAccountAdmin === true)
        .sort((a, b) => a.email.localeCompare(b.email)),
    [users],
  );

  // Orbit positions (Pitfall 6 edge cases).
  const points: OrbitPoint[] = useMemo(() => {
    const n = admins.length;
    if (n === 0) return [];
    if (n === 1) return [{ u: admins[0]!, cx: CX, cy: CY }];
    if (n === 2) {
      // Forced poles to enforce minimum visual separation.
      return [
        { u: admins[0]!, cx: CX, cy: CY - R_TWO },
        { u: admins[1]!, cx: CX, cy: CY + R_TWO },
      ];
    }
    return admins.map((u, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      return {
        u,
        cx: CX + R_DEFAULT * Math.cos(angle),
        cy: CY + R_DEFAULT * Math.sin(angle),
      };
    });
  }, [admins]);

  // Keyboard focus index (cycles admins by orbit position).
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  useEffect(() => {
    // Reset focus when admin set changes shape.
    setFocusIdx(null);
  }, [admins.length]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (admins.length === 0) return;
      if (
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight" &&
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "Enter"
      ) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      const cur = focusIdx ?? 0;
      if (e.key === "Enter") {
        const u = admins[cur];
        if (u) setSelected({ kind: "admin", email: u.email });
        return;
      }
      const dir =
        e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      const next = (cur + dir + admins.length) % admins.length;
      setFocusIdx(next);
    },
    [admins, focusIdx, setSelected],
  );

  const handleDownload = useCallback(() => {
    downloadCsv(
      "account-admins.csv",
      admins.map((u) => ({
        Email: u.email,
        Name: u.name,
        CompanyRole: u.companyRole ?? "",
        AddedOn: u.addedOn ?? "",
        // BulkAccUser may not expose lastSignIn directly; emit empty when absent.
        LastSignIn:
          (u as unknown as { lastSignIn?: string | null }).lastSignIn ?? "",
      })),
    );
  }, [admins]);

  // Loading sentinel: empty users array (Phase 4 pattern).
  if (users.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <OrbitSkeleton />
      </div>
    );
  }

  const selectedEmail =
    selected && selected.kind === "admin" ? selected.email : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Account-level only — project admins excluded.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={admins.length === 0}
        >
          <Download className="mr-2 size-4" />
          Download CSV
        </Button>
      </div>

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-roledescription="account admin constellation"
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{ outline: "none" }}
      >
        <title>{`${admins.length} account admin${admins.length === 1 ? "" : "s"}`}</title>

        {/* Center sun + faint orbit ring (visual anchor). */}
        {admins.length > 1 && (
          <circle
            cx={CX}
            cy={CY}
            r={admins.length === 2 ? R_TWO : R_DEFAULT}
            fill="none"
            stroke={neutral}
            strokeOpacity={0.2}
            strokeDasharray="3 4"
          />
        )}
        {admins.length > 1 && (
          <circle
            cx={CX}
            cy={CY}
            r={6}
            fill={neutral}
            opacity={0.5}
            style={{ filter: `drop-shadow(0 0 8px ${highlight})` }}
          />
        )}

        {/* 0-admin empty state */}
        {admins.length === 0 && (
          <text
            x={CX}
            y={CY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            fontSize={14}
          >
            No account admins
          </text>
        )}

        {/* Admin nodes */}
        {points.map((p, i) => {
          const id = p.u.email;
          const isHovered = hoveredId === id;
          const isFocused = focusIdx === i;
          const isSelected = selectedEmail === id;
          const reveal = isHovered || isFocused || isSelected;
          const opacity = isSelected
            ? HOVER_OPACITY_FOCUS
            : getOpacity(id);
          const scale = isSelected ? 1.08 : 1;
          const isSingle = admins.length === 1;

          return (
            <motion.g
              key={id}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={
                isSingle
                  ? {
                      opacity,
                      scale: [1, 1.06, 1],
                    }
                  : { opacity, scale }
              }
              transition={
                isSingle
                  ? {
                      ...transition,
                      scale: { duration: 2.4, repeat: Infinity },
                    }
                  : transition
              }
              tabIndex={-1}
              role="button"
              aria-label={`Account admin ${i + 1} of ${admins.length}`}
              onClick={() => setSelected({ kind: "admin", email: id })}
              {...bind(id)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={p.cx}
                cy={p.cy}
                r={NODE_R}
                fill={highlight}
                stroke={neutral}
                strokeWidth={1}
              />
              {reveal && (
                <text
                  x={p.cx}
                  y={p.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10}
                  fontWeight={600}
                  fill="white"
                  pointerEvents="none"
                >
                  {initialsOf(p.u)}
                </text>
              )}
              <FocusRing
                shape="circle"
                cx={p.cx}
                cy={p.cy}
                r={NODE_R + 4}
                visible={isSelected || isFocused}
              />
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
