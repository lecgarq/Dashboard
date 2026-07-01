// SPLIT-PENDING: REF-01 — this is the terrain monolith slated to split into data-hook,
// transform, and thin-view modules; its server boundary is characterized by
// lib/server/__tests__/folderPermissionTerrainView.test.ts so the split stays safe.
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  colorForRank,
  tierTextColor,
  projectCamera,
  HOME_YAW,
  HOME_PITCH,
  TIER_LEGEND,
  TIER_COLORS,
  TIER_GRADIENTS,
  topGradientId,
  type Camera,
  type FolderTerrainData,
  type TerrainCell,
  type TerrainProjectOption,
  type TerrainScene,
} from "../folderTerrain";
import { officeLabel } from "../projectGroups";
import { useCamera, useGrowth, prefersReducedMotion } from "./useFolderPermissionTerrainCamera";
import {
  type Mode,
  type Metric,
  type Hover,
  type Picked,
  type Theme,
  type SceneEntry,
  type StageView,
  VIEW_H,
  mixHex,
  activeDims,
  defaultPivot,
  fitScale,
  buildView,
  crossProjectTiers,
} from "./terrainViewModel";

// ---------------------------------------------------------------------------
export function FolderPermissionTerrain({
  projects, initial, loadTerrain, loadOverview, singleProject = false,
}: {
  projects: TerrainProjectOption[];
  initial: FolderTerrainData | null;
  loadTerrain: (projectId: string) => Promise<FolderTerrainData | null>;
  loadOverview?: () => Promise<FolderTerrainData | null>;
  // When true: lock to single-project mode and hide the mode toggle + project
  // picker (used by the Template MTY tab, which has exactly one "project").
  singleProject?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const theme: Theme = {
    ink: dark ? "#f1f1f4" : "#1f2024",
    sub: dark ? "#a1a1aa" : "#6b7280",
    grid: dark ? "rgba(161,161,170,0.10)" : "rgba(82,82,91,0.09)",
    connector: dark ? "rgba(161,161,170,0.45)" : "rgba(82,82,91,0.4)",
    hot: dark ? "#fafafa" : "#18181b",
    shadow: dark ? "rgba(0,0,0,0.5)" : "rgba(15,12,35,0.22)",
    topEdge: dark ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.62)",
    edge: dark ? "rgba(0,0,0,0.62)" : "rgba(24,27,38,0.42)",
    ground: dark ? "#191c28" : "#e4e8f0",        // opaque floor — nothing shows through
    groundEdge: dark ? "rgba(150,170,210,0.28)" : "rgba(40,55,90,0.24)",
    halo: dark ? "rgba(6,6,9,0.72)" : "rgba(255,255,255,0.78)",
    dark,
  };

  const [mode, setMode] = useState<Mode>("single");
  const [hover, setHover] = useState<Hover>(null);
  const [picked, setPicked] = useState<Picked>(null);
  const clear = () => { setHover(null); setPicked(null); };

  const [cache, setCache] = useState<Record<string, FolderTerrainData | null>>(() => (initial ? { [initial.projectId]: initial } : {}));
  const [singleId, setSingleId] = useState<string>(initial?.projectId ?? projects[0]?.id ?? "");
  const topStaffed = useMemo(() => [...projects].sort((a, b) => b.userRoleCount - a.userRoleCount).map((p) => p.id), [projects]);
  const [selected, setSelected] = useState<string[]>(() => topStaffed.slice(0, 6));
  const [overview, setOverview] = useState<FolderTerrainData | null>(null);
  const [loading, setLoading] = useState(false);

  // Lazy-load terrain for whatever the active mode needs.
  useEffect(() => {
    if (mode === "overview") return;
    const needed = mode === "single" ? [singleId] : selected;
    const missing = [...new Set(needed)].filter((id) => id && !(id in cache));
    if (missing.length === 0) return;
    let alive = true;
    setLoading(true);
    Promise.all(missing.map((id) => loadTerrain(id).then((d) => [id, d] as const)))
      .then((pairs) => { if (alive) setCache((c) => { const n = { ...c }; for (const [id, d] of pairs) n[id] = d; return n; }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mode, singleId, selected, cache, loadTerrain]);

  useEffect(() => {
    if (mode !== "overview" || overview || !loadOverview) return;
    let alive = true;
    setLoading(true);
    loadOverview().then((d) => { if (alive) setOverview(d); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mode, overview, loadOverview]);

  const single = cache[singleId] ?? null;
  const compareDatas = useMemo(() => {
    const seen = new Set<string>();
    const out: FolderTerrainData[] = [];
    for (const id of selected) { const d = cache[id]; if (d && !seen.has(d.projectId)) { seen.add(d.projectId); out.push(d); } }
    return out;
  }, [selected, cache]);

  // Measured stage viewport (width tracks the container; height fixed).
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ w: 920, h: VIEW_H });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const w = Math.max(360, el.clientWidth || 920);
      setViewport((v) => (v.w === w ? v : { w, h: VIEW_H }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const camApi = useCamera(viewport);
  const busy = loading;

  // Stable key for the active data set — drives reframe, grow-in, and cross-fade.
  const dataKey = mode === "single" ? (single ? `s:${single.projectId}` : "")
    : mode === "overview" ? (overview ? "o" : "")
    : (compareDatas.length >= 2 ? `c:${compareDatas.map((d) => d.projectId).join(",")}` : "");

  const growth = useGrowth(dataKey);

  const view = useMemo<StageView>(
    () => buildView(mode, single, overview, compareDatas, camApi.cam, viewport, busy, growth),
    [mode, single, overview, compareDatas, camApi.cam, viewport, busy, growth],
  );

  // Reframe the camera when the active data set (not the camera) changes.
  const lastKey = useRef("");
  const { resetTo, framePivot } = camApi;
  useEffect(() => {
    if (!dataKey || dataKey === lastKey.current) return;
    lastKey.current = dataKey;
    const p = defaultPivot(mode, single, overview, compareDatas);
    const { R, Cf } = activeDims(mode, single, overview, compareDatas);
    resetTo(p.col, p.row, fitScale(R, Cf, viewport.w, viewport.h));
  }, [dataKey, mode, single, overview, compareDatas, resetTo, viewport.w, viewport.h]);

  // Re-centre the anchor when the stage is measured / resized (keeps orbit+zoom).
  useEffect(() => { framePivot(); }, [viewport.w, viewport.h, framePivot]);

  return (
    <div className="panel-elevated overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div className="flex min-w-0 flex-col gap-2">
          {!singleProject && (
            <ModeToggle mode={mode} hasOverview={!!loadOverview} onChange={(m) => { clear(); setMode(m); }} />
          )}
          {mode === "single" ? (
            <div className="flex flex-col gap-1">
              {!singleProject && (
                <ProjectSelect projects={projects} value={singleId} onChange={(id) => { clear(); setSingleId(id); }} disabled={busy} />
              )}
              {single && (
                <p className="text-xs text-muted-foreground">
                  {officeLabel(single.office)} · {single.folders.length} folders
                  {(() => { const inh = single.folders.filter((f) => f.inherited).length; return inh > 0 ? ` (${single.folders.length - inh} changed · ${inh} inherited)` : ""; })()}
                  {" · "}{single.roles.length} roles
                  {single.maxUserCount > 0 ? " · height = users in role" : " · height = permission level"}
                </p>
              )}
            </div>
          ) : mode === "compare" ? (
            <div className="flex flex-col gap-1.5">
              <ProjectMultiSelect projects={projects} selected={selected} onChange={(ids) => { clear(); setSelected(ids); }} disabled={busy} />
              <p className="text-xs text-muted-foreground">
                {selected.length} projects · each on its own plane, stacked top→bottom — scan a column straight down to compare the same folder × role. Drag to orbit the whole stack; scroll-drag to pan through it.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <div className="text-sm font-semibold text-foreground">All projects · account-wide standard</div>
              <p className="text-xs text-muted-foreground">
                {overview ? `${overview.folders.length} folders × ${overview.roles.length} roles · ` : ""}colour = typical permission · height = projects configuring it
              </p>
            </div>
          )}
        </div>
        <TierLegend ink={theme.sub} />
      </div>

      <SceneStage
        wrapRef={wrapRef}
        view={view}
        viewport={viewport}
        theme={theme}
        dark={dark}
        cam={camApi.cam}
        busy={busy}
        hover={hover}
        picked={picked}
        setHover={setHover}
        setPicked={setPicked}
        camApi={camApi}
        dataKey={dataKey}
      />

      {picked && (
        <div className="px-4 pb-4">
          <DetailPanel
            cell={picked.cell}
            project={picked.source.projectName}
            metric={picked.source.heightMetric === "projects" ? "projects" : "users"}
            users={picked.source.usersByRole[picked.cell.roleId] ?? []}
            crossProject={mode === "compare" ? crossProjectTiers(picked.cell, compareDatas) : null}
            onClose={() => setPicked(null)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage — fixed viewport SVG; pan/zoom/orbit move content within it.
// ---------------------------------------------------------------------------
function SceneStage({
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

function ToolButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`${label} (left-drag)`}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >{label}</button>
  );
}

function Tooltip({ hover, width, metric }: { hover: Hover; width: number; metric: Metric }) {
  if (!hover) return null;
  const n = hover.cell.userCount;
  const line = metric === "projects" ? `${n} ${n === 1 ? "project" : "projects"} configure this` : `${n} ${n === 1 ? "user" : "users"} in this role`;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
      style={{ left: Math.min(hover.x + 12, width - 210), top: Math.max(4, hover.y - 10) }}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-foreground">{hover.cell.folderName}</span>
        {hover.cell.inherited && (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">inherited</span>
        )}
      </div>
      <div className="text-muted-foreground">{hover.cell.roleName}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorForRank(hover.cell.rank) }} />
        <span className="text-foreground">{metric === "projects" ? "typically " : ""}{hover.cell.tier}</span>
        {hover.cell.inherited && <span className="text-muted-foreground">· from parent</span>}
      </div>
      <div className="text-muted-foreground">{line}</div>
    </div>
  );
}

// --- Controls ------------------------------------------------------------------

function ModeToggle({ mode, hasOverview, onChange }: { mode: Mode; hasOverview: boolean; onChange: (m: Mode) => void }) {
  const modes: Mode[] = hasOverview ? ["single", "compare", "overview"] : ["single", "compare"];
  const label: Record<Mode, string> = { single: "Single project", compare: "Compare", overview: "Overview" };
  return (
    <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
      {modes.map((m) => (
        <button key={m} onClick={() => onChange(m)} className={`rounded-md px-3 py-1 font-medium transition ${mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          {label[m]}
        </button>
      ))}
    </div>
  );
}

function useOfficeGroups(projects: TerrainProjectOption[]) {
  return useMemo(() => {
    const by = new Map<string, TerrainProjectOption[]>();
    for (const p of projects) { const arr = by.get(p.office); if (arr) arr.push(p); else by.set(p.office, [p]); }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [projects]);
}

function ProjectSelect({ projects, value, onChange, disabled }: { projects: TerrainProjectOption[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const groups = useOfficeGroups(projects);
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="max-w-[460px] rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
      {groups.map(([office, opts]) => (
        <optgroup key={office} label={officeLabel(office)}>
          {opts.map((p) => (<option key={p.id} value={p.id}>{p.name} · {p.permCount} perms</option>))}
        </optgroup>
      ))}
    </select>
  );
}

function ProjectMultiSelect({ projects, selected, onChange, disabled }: { projects: TerrainProjectOption[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const groups = useOfficeGroups(projects);
  const sel = useMemo(() => new Set(selected), [selected]);
  const nameById = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (id: string) => { const next = new Set(sel); next.has(id) ? next.delete(id) : next.add(id); onChange([...next]); };
  const filtered = (opts: TerrainProjectOption[]) => (q ? opts.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : opts);
  const toggleOffice = (opts: TerrainProjectOption[]) => {
    const ids = opts.map((p) => p.id);
    const allOn = ids.every((id) => sel.has(id));
    const next = new Set(sel);
    for (const id of ids) allOn ? next.delete(id) : next.add(id);
    onChange([...next]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className="flex max-w-[460px] items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <span className="truncate">
          {selected.length === 0 ? "Pick projects to compare…" : selected.slice(0, 2).map((id) => nameById.get(id) ?? id).join(", ")}
          {selected.length > 2 ? ` +${selected.length - 2}` : ""}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{selected.length}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 flex max-h-[360px] w-[360px] flex-col rounded-xl border border-border bg-popover shadow-xl">
          <div className="flex items-center gap-2 border-b border-border p-2">
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button onClick={() => onChange([])} className="shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">Clear</button>
          </div>
          <div className="overflow-y-auto p-1">
            {groups.map(([office, opts]) => {
              const fopts = filtered(opts);
              if (fopts.length === 0) return null;
              return (
                <div key={office} className="mb-1">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{officeLabel(office)}</span>
                    <button onClick={() => toggleOffice(fopts)} className="rounded px-1.5 text-[10px] text-primary hover:underline">All</button>
                  </div>
                  {fopts.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted">
                      <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="accent-primary" />
                      <span className="truncate text-foreground">{p.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{p.permCount}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TierLegend({ ink }: { ink: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: ink }}>
      <span className="uppercase tracking-wider">Less</span>
      <div className="flex items-center gap-0.5">
        {TIER_LEGEND.map((t) => (<span key={t.rank} title={t.label} className="inline-block h-3 w-5 rounded-sm" style={{ background: TIER_COLORS[t.rank] }} />))}
      </div>
      <span className="uppercase tracking-wider">Full control</span>
      <span className="mx-0.5 h-3 w-px opacity-25" style={{ background: "currentColor" }} aria-hidden />
      <span className="inline-flex items-center gap-1" title="Folders that simply inherit their parent's permissions are dimmed; the bright bars are deliberate access changes.">
        <span className="inline-block h-3 w-5 rounded-sm" style={{ background: TIER_COLORS[3], opacity: 0.28 }} />
        <span>inherited</span>
      </span>
    </div>
  );
}

function DetailPanel({ cell, project, metric, users, crossProject, onClose }: {
  cell: TerrainCell; project: string; metric: Metric; users: { name: string; email: string }[];
  crossProject: { project: string; tier: string; rank: number }[] | null; onClose: () => void;
}) {
  const overview = metric === "projects";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
      <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ background: colorForRank(cell.rank), color: tierTextColor(cell.rank) }}>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{cell.roleName} <span className="opacity-80">on</span> {cell.folderName}</div>
          <div className="truncate text-[11px] opacity-90">{project} · {cell.tier}</div>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-md bg-black/20 px-2 py-0.5 text-xs hover:bg-black/30">Close</button>
      </div>
      <div className="p-3">
        <div className="mb-2 text-xs text-muted-foreground">
          {overview
            ? `Typically ${cell.tier} · configured in ${cell.userCount} ${cell.userCount === 1 ? "project" : "projects"}`
            : `${cell.tier} · ${users.length} ${users.length === 1 ? "user holds" : "users hold"} this role`}
        </div>
        {overview ? (
          <TierBreakdown breakdown={cell.tierBreakdown ?? {}} total={cell.userCount} />
        ) : users.length === 0 ? (
          <p className="text-xs text-muted-foreground">No members are currently assigned this role on the project.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {users.map((u) => (<li key={u.email || u.name} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs" title={u.email}>{u.name}</li>))}
          </ul>
        )}
        {crossProject && crossProject.length > 1 && (
          <div className="mt-3 border-t border-border pt-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">This cell across your projects</div>
            <ul className="flex flex-wrap gap-1.5">
              {crossProject.map((c) => (
                <li key={c.project} className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-[11px]" title={`${c.project}: ${c.tier}`}>
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorForRank(c.rank) }} />
                  <span className="max-w-[140px] truncate text-foreground">{c.project}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function TierBreakdown({ breakdown, total }: { breakdown: Record<number, number>; total: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-3 overflow-hidden rounded-full border border-border">
        {TIER_LEGEND.map((t) => {
          const n = breakdown[t.rank] ?? 0;
          if (n === 0) return null;
          return <span key={t.rank} title={`${t.label}: ${n}`} style={{ width: `${(n / Math.max(1, total)) * 100}%`, background: TIER_COLORS[t.rank] }} />;
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {TIER_LEGEND.filter((t) => (breakdown[t.rank] ?? 0) > 0).map((t) => (
          <span key={t.rank} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: TIER_COLORS[t.rank] }} />
            {t.label}: {breakdown[t.rank]}
          </span>
        ))}
      </div>
    </div>
  );
}
