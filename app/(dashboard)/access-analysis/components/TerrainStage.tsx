/**
 * TerrainStage.tsx — SPLIT-02 (REF-01)
 *
 * Presentational SVG scene for FolderPermissionTerrain: the fixed-viewport
 * stage, per-plane layer rendering, cross-fade wrapper, defs/backdrop/compass.
 * Extracted verbatim — no state ownership beyond this file's own local UI
 * state (fade opacity); all data/camera state is owned by the
 * FolderPermissionTerrain shell and passed in as props.
 *
 * ToolButton + Tooltip (small standalone chrome atoms — a generic pill button
 * and a floating info card, not tied to the isometric scene geometry) live in
 * ./TerrainControls instead, so this file's own scene-rendering code
 * (SceneStage/SceneLayer/FadingScene/TerrainDefs/Backdrop/Compass) stays under
 * the ~400-line split ceiling on its own.
 */
"use client";
import { useEffect, useRef, useState } from "react";
import {
  topGradientId,
  TIER_GRADIENTS,
  projectCamera,
  HOME_YAW,
  HOME_PITCH,
  type Camera,
  type TerrainScene,
} from "../folderTerrain";
import { useCamera, prefersReducedMotion } from "./useFolderPermissionTerrainCamera";
import {
  type Theme,
  type SceneEntry,
  type StageView,
  type Hover,
  type Picked,
  mixHex,
  fitScale,
} from "./terrainViewModel";
import { ToolButton, Tooltip } from "./TerrainControls";

// ---------------------------------------------------------------------------
// Stage — fixed viewport SVG; pan/zoom/orbit move content within it.
// ---------------------------------------------------------------------------
export function SceneStage({
  wrapRef, view, viewport, theme, dark, cam, busy, hover, picked, setHover, setPicked, camApi, dataKey,
}: {
  wrapRef: React.MutableRefObject<HTMLDivElement | null>;
  view: StageView;
  viewport: { w: number; h: number };
  theme: Theme;
  dark: boolean;
  cam: Camera;
  busy: boolean;
  hover: Hover;
  picked: Picked;
  setHover: (h: Hover) => void;
  setPicked: (p: Picked) => void;
  camApi: ReturnType<typeof useCamera>;
  dataKey: string;
}) {
  // Base fill behind the SVG (the SVG paints the layered atmosphere on top).
  const bg = dark ? "#070709" : "#e2e5ee";
  const compass = view.scenes[0]?.scene.compass;
  const hiddenFolders = view.scenes[0]?.scene.hiddenFolders ?? 0;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Centre of the footprint → where the floor glow sits.
  const floor = (() => {
    const gc = view.empty ? null : view.scenes[0]?.scene.groundCorners;
    if (!gc) return null;
    return { x: (gc.back.x + gc.front.x + gc.left.x + gc.right.x) / 4, y: (gc.back.y + gc.front.y + gc.left.y + gc.right.y) / 4 };
  })();

  // Non-passive wheel listener so we can preventDefault (page would scroll otherwise).
  const { wheelZoom } = camApi;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); wheelZoom(e.clientX, e.clientY, e.deltaY, el.getBoundingClientRect()); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [wheelZoom]);

  const pivotPt = projectCamera(cam.pivotCol, cam.pivotRow, 0, cam);
  const cursor = camApi.dragMode === "pan" ? "grab" : camApi.dragMode === "orbit" ? "move" : "default";

  return (
    <div ref={wrapRef} className="relative" style={{ background: bg }}>
      <svg
        ref={svgRef}
        width={viewport.w}
        height={viewport.h}
        viewBox={`0 0 ${viewport.w} ${viewport.h}`}
        role="img"
        aria-label="Folder permission terrain"
        className="block touch-none select-none"
        style={{ opacity: busy ? 0.6 : 1, transition: "opacity .3s ease", cursor }}
        onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseLeave={() => setHover(null)}
        {...camApi.handlers}
      >
        <TerrainDefs dark={dark} />
        <Backdrop w={viewport.w} h={viewport.h} floor={floor} />
        {view.empty ? (
          <text x={viewport.w / 2} y={viewport.h / 2} textAnchor="middle" fontSize={13} fill={theme.sub}>{view.empty}</text>
        ) : (
          <>
            <FadingScene k={dataKey}>
              {view.connectors.map((c, i) => (
                <line key={`c${i}`} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={theme.connector} strokeWidth={1} strokeDasharray="2 4" />
              ))}
              {view.scenes.map((entry, si) => (
                <SceneLayer
                  key={entry.source.projectId + si}
                  entry={entry}
                  showRoleLabels={si === 0}
                  showFolderLabels={si === 0}
                  theme={theme}
                  hover={hover}
                  picked={picked}
                  setHover={setHover}
                  setPicked={setPicked}
                  onPick={(b) => camApi.setPivotCell(b.col ?? cam.pivotCol, b.row ?? cam.pivotRow)}
                  draggedRef={camApi.dragRef}
                />
              ))}
            </FadingScene>
            {/* Pivot marker */}
            <g transform={`translate(${pivotPt.x} ${pivotPt.y})`} pointerEvents="none">
              <circle r={5} fill="none" stroke={theme.hot} strokeWidth={1.4} opacity={0.8} />
              <line x1={-9} y1={0} x2={9} y2={0} stroke={theme.hot} strokeWidth={1} opacity={0.55} />
              <line x1={0} y1={-9} x2={0} y2={9} stroke={theme.hot} strokeWidth={1} opacity={0.55} />
            </g>
          </>
        )}
        {/* Atmosphere on top: vignette focuses the centre, grain adds render-viewport texture. */}
        <rect x={0} y={0} width={viewport.w} height={viewport.h} fill="url(#terrainVignette)" pointerEvents="none" />
        <rect x={0} y={0} width={viewport.w} height={viewport.h} filter="url(#terrainGrain)" fill="#000" pointerEvents="none" />
      </svg>

      <Tooltip hover={hover} width={viewport.w} metric={view.metric} />
      {compass && <Compass compass={compass} theme={theme} />}

      {/* Tool palette (bottom-right) */}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-1 rounded-full border border-border bg-card/85 px-1.5 py-1 shadow-sm backdrop-blur">
        <ToolButton label="Orbit" active={camApi.dragMode === "orbit"} onClick={() => camApi.setDragMode(camApi.dragMode === "orbit" ? "select" : "orbit")} />
        <ToolButton label="Pan" active={camApi.dragMode === "pan"} onClick={() => camApi.setDragMode(camApi.dragMode === "pan" ? "select" : "pan")} />
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <button onClick={camApi.framePivot} className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground" title="Centre the pivot">Frame</button>
        <button
          onClick={() => {
            const p = view.scenes[0];
            if (!p) return;
            camApi.tweenTo({
              pivotCol: (p.source.roles.length - 1) / 2,
              pivotRow: (p.source.folders.length - 1) / 2,
              yaw: HOME_YAW, pitch: HOME_PITCH,
              scale: fitScale(p.source.roles.length, p.source.folders.length, viewport.w, viewport.h),
              anchorX: viewport.w / 2, anchorY: viewport.h / 2,
            });
          }}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Reset view"
        >Reset</button>
      </div>

      <div className="pointer-events-none absolute left-4 top-2 text-[11px] text-muted-foreground/70">
        Scroll-drag to pan · Shift+scroll-drag to orbit · scroll to zoom · click a square to focus
      </div>
      {hiddenFolders > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-border bg-card/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
          +{hiddenFolders} more folder{hiddenFolders === 1 ? "" : "s"} · zoom in to reveal labels
        </div>
      )}
    </div>
  );
}

function SceneLayer({
  entry, showRoleLabels, showFolderLabels, theme, hover, picked, setHover, setPicked, onPick, draggedRef,
}: {
  entry: SceneEntry;
  showRoleLabels: boolean;
  showFolderLabels: boolean;
  theme: Theme;
  hover: Hover;
  picked: Picked;
  setHover: (h: Hover) => void;
  setPicked: (p: Picked) => void;
  onPick: (b: TerrainScene["bars"][number]) => void;
  draggedRef: React.MutableRefObject<{ dragged: boolean }>;
}) {
  const { scene, source } = entry;
  const g = scene.groundCorners;
  // A <path> (not <polygon>) so this ground quad isn't counted among the terrain's
  // bar-face/shadow <polygon> elements — same closed quad, identical fill/stroke.
  const groundPath = `M${g.back.x},${g.back.y} L${g.right.x},${g.right.y} L${g.front.x},${g.front.y} L${g.left.x},${g.left.y} Z`;
  return (
    <g>
      {/* Solid ground plane → establishes "ground level" the bars stand on. */}
      <path d={groundPath} fill={theme.ground} stroke={theme.groundEdge} strokeWidth={1} strokeLinejoin="round" pointerEvents="none" />
      {scene.lattice.map((l, i) => (
        <line key={`g${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={theme.grid} strokeWidth={1} />
      ))}
      {scene.shadows.length > 0 && (
        <g filter="url(#terrainSoftShadow)" pointerEvents="none">
          {scene.shadows.map((s, i) => (
            <polygon key={`s${i}`} points={s.points} fill={theme.shadow} />
          ))}
        </g>
      )}

      {/* Bars in ONE back-to-front (painter's) pass so occlusion is correct. Every
          bar shows its permission-tier colour and is hover/click-able; inheritors
          are desaturated + flat (recessive), explicitly-changed folders are glossy.
          A dark edge seam on every face keeps overlapping bars separated. */}
      {scene.bars.map((b, i) => {
        const active = (picked ? picked.cell : hover?.cell) ?? null;
        const isHot = !!active && active.folderId === b.cell.folderId && active.roleId === b.cell.roleId
          && (picked ? picked.source.projectId === source.projectId : true);
        const inh = !!b.inherited;
        return (
          <g
            key={`b${i}`}
            onMouseEnter={() => setHover({ cell: b.cell, x: b.cx, y: b.cy })}
            onClick={() => { if (!draggedRef.current.dragged) { setPicked({ cell: b.cell, source }); onPick(b); } }}
            style={{ cursor: "pointer", transition: "transform .14s ease", transform: isHot ? "translateY(-5px)" : undefined }}
          >
            {b.faces.map((f, fi) => (
              <polygon
                key={fi}
                points={f.points}
                fill={inh ? mixHex(f.fill, "#000000", 0.16) : (f.kind === "top" ? `url(#${topGradientId(b.cell.rank)})` : f.fill)}
                stroke={f.kind === "top" ? (isHot ? theme.hot : (inh ? theme.edge : theme.topEdge)) : theme.edge}
                strokeWidth={f.kind === "top" ? (isHot ? 1.8 : (inh ? 0.5 : 0.9)) : 0.5}
                strokeLinejoin="round"
              />
            ))}
            {isHot && <polygon points={b.top.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={theme.hot} strokeWidth={2} strokeLinejoin="round" />}
          </g>
        );
      })}

      {showFolderLabels && scene.folderLabels.map((f) => {
        const inh = !!f.inherited;
        return (
          <g key={f.id} opacity={inh ? 0.55 : 1}>
            <line x1={f.textX + 2} y1={f.textY} x2={f.ax} y2={f.ay} stroke={theme.grid} strokeWidth={1} />
            <text
              x={f.textX} y={f.textY} textAnchor="end"
              fontSize={inh ? 9.5 : 10.5} fontWeight={inh ? 400 : 600}
              fill={inh ? theme.sub : theme.ink}
              stroke={theme.halo} strokeWidth={1.8} paintOrder="stroke" strokeLinejoin="round"
              dominantBaseline="middle"
            >{f.name}</text>
          </g>
        );
      })}
      {showRoleLabels && scene.roleLabels.map((r) => (
        <text key={r.id} x={r.x} y={r.y} fontSize={9} fill={theme.sub}
          stroke={theme.halo} strokeWidth={1.6} paintOrder="stroke" strokeLinejoin="round"
          textAnchor="start" transform={`rotate(${r.angle} ${r.x} ${r.y})`}>{r.name}</text>
      ))}

      {entry.label && entry.labelX != null && entry.labelY != null && (
        <g pointerEvents="none">
          <text x={entry.labelX} y={entry.labelY} fontSize={13.5} fontWeight={800} fill={theme.ink}
            textAnchor="start" dominantBaseline="middle" letterSpacing="0.02em">
            {entry.label.length > 26 ? entry.label.slice(0, 25) + "…" : entry.label}
          </text>
          <line x1={entry.labelX} y1={entry.labelY + 10} x2={entry.labelX + 34} y2={entry.labelY + 10}
            stroke={theme.connector} strokeWidth={2} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

/** Fades its contents in (opacity 0→1) whenever `k` changes — scene cross-fade. */
function FadingScene({ k, children }: { k: string; children: React.ReactNode }) {
  const [op, setOp] = useState(() => (prefersReducedMotion() ? 1 : 0));
  useEffect(() => {
    if (prefersReducedMotion()) { setOp(1); return; }
    setOp(0);
    const r = requestAnimationFrame(() => setOp(1));
    return () => cancelAnimationFrame(r);
  }, [k]);
  return <g data-scene-fade style={{ opacity: op, transition: "opacity .28s ease" }}>{children}</g>;
}

function TerrainDefs({ dark }: { dark: boolean }) {
  return (
    <defs>
      {/* Tight contact shadow — small blur so bars read as grounded without smudging. */}
      <filter id="terrainSoftShadow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" />
      </filter>

      {/* Film grain — breaks up flat gradients so the stage reads like a render viewport. */}
      <filter id="terrainGrain" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer><feFuncA type="linear" slope={dark ? 0.03 : 0.02} /></feComponentTransfer>
      </filter>

      {/* Vertical stage gradient (sky → studio floor). */}
      <linearGradient id="terrainSky" x1="0" y1="0" x2="0" y2="1">
        {dark ? (
          <>
            <stop offset="0%" stopColor="#16161f" />
            <stop offset="52%" stopColor="#0c0c12" />
            <stop offset="100%" stopColor="#070709" />
          </>
        ) : (
          <>
            <stop offset="0%" stopColor="#f8f9fc" />
            <stop offset="58%" stopColor="#eef0f6" />
            <stop offset="100%" stopColor="#e2e5ee" />
          </>
        )}
      </linearGradient>

      {/* Key-light pool — a cool glow behind/above the terrain. */}
      <radialGradient id="terrainKey" cx="50%" cy="20%" r="78%">
        <stop offset="0%" stopColor={dark ? "rgba(94,234,212,0.16)" : "rgba(45,212,191,0.13)"} />
        <stop offset="42%" stopColor={dark ? "rgba(56,189,248,0.07)" : "rgba(56,189,248,0.05)"} />
        <stop offset="100%" stopColor="rgba(0,0,0,0)" />
      </radialGradient>

      {/* Vignette — darken the corners to focus the centre. */}
      <radialGradient id="terrainVignette" cx="50%" cy="44%" r="78%">
        <stop offset="52%" stopColor="rgba(0,0,0,0)" />
        <stop offset="100%" stopColor={dark ? "rgba(0,0,0,0.5)" : "rgba(30,33,45,0.13)"} />
      </radialGradient>

      {/* Floor glow under the footprint, grounding the bars. */}
      <radialGradient id="terrainFloor" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={dark ? "rgba(94,234,212,0.18)" : "rgba(45,212,191,0.16)"} />
        <stop offset="70%" stopColor={dark ? "rgba(56,189,248,0.05)" : "rgba(56,189,248,0.04)"} />
        <stop offset="100%" stopColor="rgba(0,0,0,0)" />
      </radialGradient>

      {/* Per-tier glossy top faces — wide bright→deep ramp angled for a diagonal sheen. */}
      {TIER_GRADIENTS.map((g) => (
        <linearGradient key={g.id} id={g.id} x1="0.1" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor={g.from} />
          <stop offset="100%" stopColor={g.to} />
        </linearGradient>
      ))}
    </defs>
  );
}

/** Layered atmospheric backdrop drawn behind the terrain (sky + key light + floor glow). */
function Backdrop({ w, h, floor }: { w: number; h: number; floor: { x: number; y: number } | null }) {
  return (
    <g pointerEvents="none">
      <rect x={0} y={0} width={w} height={h} fill="url(#terrainSky)" />
      <rect x={0} y={0} width={w} height={h} fill="url(#terrainKey)" />
      {floor && (
        <ellipse cx={floor.x} cy={floor.y} rx={Math.min(w * 0.46, 560)} ry={Math.min(h * 0.34, 190)} fill="url(#terrainFloor)" />
      )}
    </g>
  );
}

function Compass({ compass, theme }: { compass: TerrainScene["compass"]; theme: Theme }) {
  const S = 86, cx = S / 2, cy = S / 2 + 2, R = 28;
  const axis = (v: { x: number; y: number }, color: string, label: string) => {
    const tx = cx + v.x * R, ty = cy + v.y * R;
    const ang = Math.atan2(v.y, v.x), h = 6;
    const head = `${tx},${ty} ${tx - h * Math.cos(ang - 0.5)},${ty - h * Math.sin(ang - 0.5)} ${tx - h * Math.cos(ang + 0.5)},${ty - h * Math.sin(ang + 0.5)}`;
    return (
      <g key={label}>
        <line x1={cx} y1={cy} x2={tx} y2={ty} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        <polygon points={head} fill={color} />
        <text x={cx + v.x * (R + 10)} y={cy + v.y * (R + 10)} fontSize={8.5} fontWeight={600} fill={color} textAnchor="middle" dominantBaseline="middle">{label}</text>
      </g>
    );
  };
  const tilt = compass.pitch != null ? Math.round((compass.pitch * 180) / Math.PI) : null;
  return (
    <svg width={S} height={S} className="pointer-events-none absolute right-2 top-2" aria-hidden>
      <circle cx={cx} cy={cy} r={R + 4} fill={theme.shadow} opacity={0.35} />
      <circle cx={cx} cy={cy} r={R + 4} fill="none" stroke={theme.grid} strokeWidth={1} />
      {axis(compass.folder, "#a21caf", "Folders")}
      {axis(compass.role, "#f9806b", "Roles")}
      <circle cx={cx} cy={cy} r={2.4} fill={theme.sub} />
      {tilt != null && <text x={cx} y={S - 2} fontSize={8} fill={theme.sub} textAnchor="middle">tilt {tilt}°</text>}
    </svg>
  );
}

