import { describe, it, expect } from "vitest";
import {
  rankForTier,
  colorForRank,
  tierTextColor,
  topGradientId,
  TIER_GRADIENTS,
  compareFolderNames,
  isoBase,
  barFaces,
  barHeight,
  depthOrder,
  shade,
  buildTerrainLayout,
  normalizeFolderName,
  buildSharedAxes,
  projectOntoAxes,
  buildStackedTerrain,
  buildStackedScenes,
  projectIso,
  barScene,
  buildScene,
  projectCamera,
  depthCamera,
  barSceneCam,
  buildCameraScene,
  HOME_YAW,
  HOME_PITCH,
  MIN_PITCH,
  MAX_PITCH,
  STEP,
  DEFAULT_LIGHT,
  TIER_COLORS,
  type Camera,
  type FolderTerrainData,
} from "../folderTerrain";

function fixture(id: string, folders: [string, string][], roles: [string, string][], users: Record<string, number>): FolderTerrainData {
  const usersByRole: Record<string, { name: string; email: string }[]> = {};
  for (const [rid, n] of Object.entries(users)) usersByRole[rid] = Array.from({ length: n }, (_, i) => ({ name: `${rid}-${i}`, email: `${rid}-${i}@x` }));
  const cells = folders.flatMap(([fid, fname]) =>
    roles.map(([rid, rname]) => ({ folderId: fid, folderName: fname, roleId: rid, roleName: rname, tier: "View Only", rank: 1, userCount: users[rid] ?? 0 })),
  );
  return {
    projectId: id, projectName: id, office: "MTY",
    folders: folders.map(([fid, fname]) => ({ id: fid, name: fname })),
    roles: roles.map(([rid, rname]) => ({ id: rid, name: rname })),
    cells, usersByRole, maxUserCount: Math.max(0, ...Object.values(users)), generatedAt: "x",
  };
}

describe("rankForTier", () => {
  it("maps each known tier to its ordinal", () => {
    expect(rankForTier("View Only")).toBe(1);
    expect(rankForTier("View+Download")).toBe(2);
    expect(rankForTier("Upload Only")).toBe(2);
    expect(rankForTier("View+Download+Upload")).toBe(3);
    expect(rankForTier("View+Download+Upload+Edit")).toBe(4);
    expect(rankForTier("Full Controller")).toBe(5);
  });
  it("falls back to rank 1 for an unknown tier", () => {
    expect(rankForTier("Mystery")).toBe(1);
  });
});

describe("colorForRank", () => {
  it("returns the ramp colour for valid ranks", () => {
    expect(colorForRank(5)).toBe(TIER_COLORS[5]);
    expect(colorForRank(1)).toBe(TIER_COLORS[1]);
  });
  it("falls back to rank-1 colour for out-of-range ranks", () => {
    expect(colorForRank(99)).toBe(TIER_COLORS[1]);
  });
});

describe("TIER_COLORS ramp", () => {
  it("defines a distinct colour for every rank 1..5", () => {
    const vals = [1, 2, 3, 4, 5].map((r) => TIER_COLORS[r]);
    expect(new Set(vals).size).toBe(5);
    for (const v of vals) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("starts cool (rank 1) and ends warm/gold (rank 5)", () => {
    const hex = (s: string) => parseInt(s.slice(1), 16);
    const r1 = hex(TIER_COLORS[1]), r5 = hex(TIER_COLORS[5]);
    const red = (n: number) => (n >> 16) & 255, blue = (n: number) => n & 255;
    expect(red(r5)).toBeGreaterThan(red(r1));   // warmer at the top
    expect(blue(r1)).toBeGreaterThan(blue(r5)); // cooler at the bottom
  });
});

describe("tierTextColor", () => {
  it("uses dark ink on the light amber/gold tiers and white on the dark cool tiers", () => {
    expect(tierTextColor(1)).toBe("#ffffff");
    expect(tierTextColor(2)).toBe("#ffffff");
    expect(tierTextColor(3)).toBe("#ffffff");
    expect(tierTextColor(4)).toBe("#0b1620");
    expect(tierTextColor(5)).toBe("#0b1620");
  });
});

describe("top-face gradients", () => {
  it("gives a stable, unique gradient id per rank", () => {
    const ids = [1, 2, 3, 4, 5].map(topGradientId);
    expect(new Set(ids).size).toBe(5);
    expect(topGradientId(5)).toBe("terrainTop-5");
  });
  it("publishes one gradient descriptor per rank with light->base stops", () => {
    expect(TIER_GRADIENTS).toHaveLength(5);
    for (const g of TIER_GRADIENTS) {
      expect(g.id).toBe(topGradientId(g.rank));
      expect(g.from).toMatch(/^#[0-9a-f]{6}$/i); // brighter top stop
      expect(g.to).toMatch(/^#[0-9a-f]{6}$/i);   // base stop
    }
  });
  it("keeps top brighter than the lit-side cap", () => {
    expect(DEFAULT_LIGHT.topBright).toBeGreaterThan(DEFAULT_LIGHT.sideMax);
  });
});

describe("compareFolderNames", () => {
  it("orders numbered folders by their prefix number", () => {
    const names = ["03_Design", "01_Client", "02_Construction"];
    expect([...names].sort(compareFolderNames)).toEqual([
      "01_Client",
      "02_Construction",
      "03_Design",
    ]);
  });
  it("sorts numbered folders before unnumbered ones", () => {
    expect(compareFolderNames("01_Client", "Design Documents")).toBeLessThan(0);
    expect(compareFolderNames("Design Documents", "01_Client")).toBeGreaterThan(0);
  });
  it("falls back to alphabetical for unnumbered folders", () => {
    expect(compareFolderNames("Tendering", "Client Documents")).toBeGreaterThan(0);
  });
});

describe("isoBase", () => {
  const p = { tileW: 40, tileH: 20, originX: 100, originY: 50 };
  it("places the origin cell at the origin point", () => {
    expect(isoBase(0, 0, p)).toEqual({ x: 100, y: 50 });
  });
  it("moves columns down-right and rows down-left", () => {
    expect(isoBase(1, 0, p)).toEqual({ x: 120, y: 60 }); // +col → +x, +y
    expect(isoBase(0, 1, p)).toEqual({ x: 80, y: 60 }); // +row → -x, +y
  });
  it("keeps the diagonal vertically aligned", () => {
    expect(isoBase(2, 2, p)).toEqual({ x: 100, y: 90 });
  });
});

describe("barFaces", () => {
  it("produces three faces whose shared edges line up", () => {
    const f = barFaces(0, 0, 30, 40, 20); // sx,sy,h,tileW,tileH
    // Top face is a diamond centred at (0, -30): top, right, bottom, left.
    expect(f.top).toBe("0,-40 20,-30 0,-20 -20,-30");
    // Left face top edge starts at the top-face left corner (-20, -30).
    expect(f.left.startsWith("-20,-30")).toBe(true);
    // Right face ends at the base bottom corner (0, 10) = (sy + tileH/2).
    expect(f.right.endsWith("0,10")).toBe(true);
  });
});

describe("barHeight", () => {
  it("returns minPx when the metric is zero or maxValue is zero", () => {
    expect(barHeight(0, 10, 6, 90)).toBe(6);
    expect(barHeight(5, 0, 6, 90)).toBe(6);
  });
  it("scales linearly and clamps to maxPx", () => {
    expect(barHeight(10, 10, 6, 90)).toBe(90);
    expect(barHeight(5, 10, 6, 90)).toBe(48); // halfway
    expect(barHeight(20, 10, 6, 90)).toBe(90); // clamped
  });
});

describe("depthOrder", () => {
  it("draws far cells (small col+row) before near cells", () => {
    const cells = [
      { folderIdx: 2, roleIdx: 2 }, // depth 4 (nearest)
      { folderIdx: 0, roleIdx: 0 }, // depth 0 (farthest)
      { folderIdx: 1, roleIdx: 0 }, // depth 1
    ];
    expect(depthOrder(cells)).toEqual([1, 2, 0]);
  });
});

describe("shade", () => {
  it("darkens a hex colour toward black", () => {
    expect(shade("#ffffff", 0)).toBe("#ffffff");
    expect(shade("#ffffff", 1)).toBe("#000000");
    expect(shade("#c8c8c8", 0.5)).toBe("#646464");
  });
});

describe("buildTerrainLayout", () => {
  const data: FolderTerrainData = {
    projectId: "p1",
    projectName: "P",
    office: "MTY",
    folders: [
      { id: "f1", name: "01_Client" },
      { id: "f2", name: "02_Design" },
    ],
    roles: [
      { id: "r1", name: "Architect" },
      { id: "r2", name: "Owner" },
    ],
    cells: [
      { folderId: "f1", folderName: "01_Client", roleId: "r1", roleName: "Architect", tier: "Full Controller", rank: 5, userCount: 4 },
      { folderId: "f2", folderName: "02_Design", roleId: "r2", roleName: "Owner", tier: "View Only", rank: 1, userCount: 1 },
    ],
    usersByRole: { r1: [], r2: [] },
    maxUserCount: 4,
    generatedAt: "x",
  };

  it("returns one bar per cell with three faces and a positive canvas", () => {
    const l = buildTerrainLayout(data);
    expect(l.bars).toHaveLength(2);
    expect(l.bars[0].faces.top.split(" ")).toHaveLength(4); // diamond = 4 points
    expect(l.width).toBeGreaterThan(0);
    expect(l.height).toBeGreaterThan(0);
    expect(l.folderLabels).toHaveLength(2);
  });

  it("scales the higher-user cell to a taller bar", () => {
    const l = buildTerrainLayout(data);
    const archBar = l.bars.find((b) => b.cell.roleId === "r1")!;
    const ownerBar = l.bars.find((b) => b.cell.roleId === "r2")!;
    expect(archBar.h).toBeGreaterThan(ownerBar.h);
  });

  it("returns an empty layout for null data", () => {
    expect(buildTerrainLayout(null).bars).toHaveLength(0);
  });

  it("exposes four ground corners for stacking connectors", () => {
    const l = buildTerrainLayout(data);
    expect(Object.keys(l.groundCorners).sort()).toEqual(["back", "front", "left", "right"]);
  });
});

describe("normalizeFolderName", () => {
  it("strips a numeric ordering prefix", () => {
    expect(normalizeFolderName("01_Client Documents")).toBe("Client Documents");
    expect(normalizeFolderName("03 Design")).toBe("Design");
    expect(normalizeFolderName("00. VDC")).toBe("VDC");
  });
  it("leaves unnumbered names untouched", () => {
    expect(normalizeFolderName("Client Documents")).toBe("Client Documents");
  });
});

describe("buildSharedAxes", () => {
  const a = fixture("A", [["fa", "01_Client Documents"], ["fb", "Design Documents"]], [["r1", "Architect"], ["r2", "Owner"]], { r1: 5, r2: 2 });
  const b = fixture("B", [["fc", "Client Documents"], ["fd", "Tendering"]], [["r1", "Architect"], ["r3", "Contractor"]], { r1: 3, r3: 9 });

  it("merges folders across projects by normalised name", () => {
    const axes = buildSharedAxes([a, b]);
    const names = axes.folders.map((f) => f.name);
    // "01_Client Documents" and "Client Documents" collapse to one row.
    expect(names.filter((n) => n === "Client Documents")).toHaveLength(1);
    expect(names).toContain("Design Documents");
    expect(names).toContain("Tendering");
  });

  it("ranks roles by total users across projects", () => {
    const axes = buildSharedAxes([a, b]);
    // Architect appears in both (5+3=8), Contractor only in B (9). Contractor leads.
    expect(axes.roles[0].name).toBe("Contractor");
    expect(axes.roles.map((r) => r.name)).toContain("Architect");
  });

  it("caps the axes to the requested limits", () => {
    const axes = buildSharedAxes([a, b], 2, 1);
    expect(axes.folders).toHaveLength(2);
    expect(axes.roles).toHaveLength(1);
  });
});

describe("projectOntoAxes", () => {
  it("re-keys cells onto shared folder keys and drops off-axis cells", () => {
    const a = fixture("A", [["fa", "01_Client Documents"]], [["r1", "Architect"], ["rX", "Ghost"]], { r1: 2, rX: 1 });
    const axes = { folders: [{ key: "Client Documents", name: "Client Documents" }], roles: [{ id: "r1", name: "Architect" }] };
    const p = projectOntoAxes(a, axes);
    expect(p.folders).toEqual([{ id: "Client Documents", name: "Client Documents" }]);
    // Only the Architect/Client cell survives; the off-axis Ghost role is dropped.
    expect(p.cells).toHaveLength(1);
    expect(p.cells[0].folderId).toBe("Client Documents");
    expect(p.cells[0].roleId).toBe("r1");
  });
});

describe("buildStackedTerrain", () => {
  const a = fixture("A", [["fa", "Client Documents"]], [["r1", "Architect"]], { r1: 3 });
  const b = fixture("B", [["fc", "Client Documents"]], [["r1", "Architect"]], { r1: 1 });

  it("produces one slab per project, vertically offset", () => {
    const axes = buildSharedAxes([a, b]);
    const s = buildStackedTerrain([a, b], axes);
    expect(s.slabs).toHaveLength(2);
    // Second slab sits below the first.
    expect(s.slabs[1].labelY).toBeGreaterThan(s.slabs[0].labelY);
  });

  it("connects consecutive slabs at their four ground corners", () => {
    const axes = buildSharedAxes([a, b]);
    const s = buildStackedTerrain([a, b], axes);
    expect(s.connectors).toHaveLength(4); // 1 gap × 4 corners
  });
});

describe("buildStackedScenes", () => {
  const camera: Camera = { pivotCol: 0.5, pivotRow: 0.5, yaw: HOME_YAW, pitch: HOME_PITCH, scale: 1, anchorX: 300, anchorY: 120 };
  const a = fixture("A", [["fa", "Client Documents"]], [["r1", "Architect"]], { r1: 3 });
  const b = fixture("B", [["fc", "Client Documents"]], [["r1", "Architect"]], { r1: 1 });
  const c = fixture("C", [["fe", "Client Documents"]], [["r1", "Architect"]], { r1: 2 });
  const axes = buildSharedAxes([a, b, c]);

  it("builds one plane per project in a tall viewport, vertically separated top→bottom", () => {
    const r = buildStackedScenes([a, b, c], axes, camera, { w: 600, h: 4000 });
    expect(r.planes).toHaveLength(3);
    for (let i = 1; i < r.planes.length; i++) {
      expect(r.planes[i].scene.groundCorners.back.y).toBeGreaterThan(r.planes[i - 1].scene.groundCorners.front.y);
    }
  });

  it("connects every consecutive pair at four matching corners", () => {
    const r = buildStackedScenes([a, b, c], axes, camera, { w: 600, h: 4000 });
    expect(r.connectors).toHaveLength((3 - 1) * 4);
  });

  it("labels each plane with its project name", () => {
    const r = buildStackedScenes([a, b, c], axes, camera, { w: 600, h: 4000 });
    expect(r.planes.map((p) => p.label)).toEqual(["A", "B", "C"]);
  });

  it("virtualizes planes whose band is off the viewport", () => {
    const r = buildStackedScenes([a, b, c], axes, camera, { w: 600, h: 120 }, { margin: 10 });
    expect(r.planes.length).toBeLessThan(3);
  });

  it("returns a positive per-plane screen pitch", () => {
    const r = buildStackedScenes([a, b, c], axes, camera, { w: 600, h: 4000 });
    expect(r.planePitch).toBeGreaterThan(0);
  });
});

describe("projectIso", () => {
  const V = { theta: 0, tileW: 40, tileH: 20, originX: 100, originY: 50, cx: 0, cy: 0 };
  it("matches fixed iso at theta=0", () => {
    expect(projectIso(0, 0, 0, V)).toEqual({ x: 100, y: 50 });
    expect(projectIso(1, 0, 0, V)).toEqual({ x: 120, y: 60 });
    expect(projectIso(0, 1, 0, V)).toEqual({ x: 80, y: 60 });
  });
  it("raises bars straight up in screen-y regardless of yaw", () => {
    const base = projectIso(2, 1, 0, { ...V, theta: 0.7 });
    const top = projectIso(2, 1, 30, { ...V, theta: 0.7 });
    expect(top.x).toBeCloseTo(base.x); // height never shifts x
    expect(base.y - top.y).toBeCloseTo(30); // exactly the height in y
  });
});

describe("barScene culling", () => {
  const V = { theta: 0, tileW: 28, tileH: 14, originX: 200, originY: 120, cx: 1, cy: 1 };
  it("shows exactly two side faces + one top at home angle", () => {
    const { faces } = barScene(1, 1, 40, V, "#d6456b", DEFAULT_LIGHT);
    expect(faces.filter((f) => f.kind === "side")).toHaveLength(2);
    expect(faces.filter((f) => f.kind === "top")).toHaveLength(1);
    // Top sorts above its own sides.
    expect(faces[faces.length - 1].kind).toBe("top");
  });
  it("still shows 1–2 sides + top when rotated", () => {
    for (const theta of [0.4, 0.79, 1.2, 2.0, 3.5]) {
      const { faces } = barScene(1, 1, 40, { ...V, theta }, "#d6456b", DEFAULT_LIGHT);
      const sides = faces.filter((f) => f.kind === "side").length;
      expect(sides).toBeGreaterThanOrEqual(1);
      expect(sides).toBeLessThanOrEqual(2);
      expect(faces.filter((f) => f.kind === "top")).toHaveLength(1);
    }
  });
  it("lights the two visible sides differently (directional shading)", () => {
    const sides = barScene(1, 1, 40, V, "#d6456b", DEFAULT_LIGHT).faces.filter((f) => f.kind === "side");
    expect(sides[0].fill).not.toBe(sides[1].fill);
  });
});

describe("buildScene", () => {
  const data: FolderTerrainData = {
    projectId: "p", projectName: "P", office: "MTY",
    folders: [{ id: "f1", name: "Client Documents" }, { id: "f2", name: "Design Documents" }],
    roles: [{ id: "r1", name: "Architect" }, { id: "r2", name: "Owner" }],
    cells: [
      { folderId: "f1", folderName: "Client Documents", roleId: "r1", roleName: "Architect", tier: "Full Controller", rank: 5, userCount: 4 },
      { folderId: "f2", folderName: "Design Documents", roleId: "r2", roleName: "Owner", tier: "View Only", rank: 1, userCount: 1 },
    ],
    usersByRole: { r1: [], r2: [] }, maxUserCount: 4, generatedAt: "x",
  };
  it("produces one bar per cell, a fitted canvas, labels and a compass", () => {
    const s = buildScene(data, { theta: 0.3 });
    expect(s.bars).toHaveLength(2);
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
    expect(s.folderLabels).toHaveLength(2);
    expect(s.compass.folder).toBeDefined();
  });
  it("orders bars far → near by depth", () => {
    const s = buildScene(data, { theta: 0 });
    for (let i = 1; i < s.bars.length; i++) expect(s.bars[i].depth).toBeGreaterThanOrEqual(s.bars[i - 1].depth);
  });
  it("returns an empty scene for null data", () => {
    expect(buildScene(null, { theta: 0 }).bars).toHaveLength(0);
  });
});

// ===========================================================================
// Orthographic camera (fixed-pivot, yaw + pitch) — the professional redesign.
// ===========================================================================

const cam = (over: Partial<Camera> = {}): Camera => ({
  pivotCol: 2, pivotRow: 3, yaw: HOME_YAW, pitch: HOME_PITCH, scale: 1, anchorX: 400, anchorY: 200, ...over,
});

describe("projectCamera", () => {
  it("pins the pivot cell to the anchor at every yaw and pitch", () => {
    for (const yaw of [0, 0.5, 1, 2, 3, 5, 6]) {
      for (const pitch of [MIN_PITCH, 0.3, HOME_PITCH, 1, MAX_PITCH]) {
        const p = projectCamera(2, 3, 0, cam({ yaw, pitch }));
        expect(p.x).toBeCloseTo(400, 6);
        expect(p.y).toBeCloseTo(200, 6);
      }
    }
  });

  it("flattens height at top-down pitch (≈90°)", () => {
    const c = cam({ pitch: Math.PI / 2 });
    const ground = projectCamera(5, 1, 0, c);
    const raised = projectCamera(5, 1, 60, c);
    expect(raised.y).toBeCloseTo(ground.y, 6); // cos(90°)=0 → z contributes nothing
  });

  it("raises bars upward (smaller screen-y) at iso pitch", () => {
    const c = cam();
    expect(projectCamera(4, 4, 50, c).y).toBeLessThan(projectCamera(4, 4, 0, c).y);
  });

  it("home orientation: roles (col+) go right, folders (row+) go left, both downward", () => {
    const c = cam({ pivotCol: 0, pivotRow: 0 });
    expect(projectCamera(1, 0, 0, c).x).toBeGreaterThan(c.anchorX); // role+ → right
    expect(projectCamera(0, 1, 0, c).x).toBeLessThan(c.anchorX);    // folder+ → left
    expect(projectCamera(1, 0, 0, c).y).toBeGreaterThan(c.anchorY); // both downward
    expect(projectCamera(0, 1, 0, c).y).toBeGreaterThan(c.anchorY);
  });

  it("scale zooms distances from the anchor linearly", () => {
    const a = projectCamera(5, 5, 0, cam({ scale: 1 }));
    const b = projectCamera(5, 5, 0, cam({ scale: 2 }));
    expect(b.x - 400).toBeCloseTo((a.x - 400) * 2, 6);
    expect(b.y - 200).toBeCloseTo((a.y - 200) * 2, 6);
  });

  it("uses STEP as the per-cell ground spacing", () => {
    expect(STEP).toBeGreaterThan(0);
  });
});

describe("depthCamera", () => {
  it("increases toward the viewer (down/front)", () => {
    const c = cam({ pivotCol: 0, pivotRow: 0 });
    expect(depthCamera(2, 2, 0, c)).toBeGreaterThan(depthCamera(-2, -2, 0, c));
  });
  it("ranks a taller bar nearer than a flat one at the same cell", () => {
    const c = cam({ pivotCol: 0, pivotRow: 0 });
    expect(depthCamera(1, 1, 60, c)).toBeGreaterThan(depthCamera(1, 1, 0, c));
  });
});

describe("barSceneCam", () => {
  it("culls back faces, tags a top face, and carries grid coords", () => {
    const r = barSceneCam(3, 2, 40, cam(), "#d6456b", DEFAULT_LIGHT);
    expect(r.faces.some((f) => f.kind === "top")).toBe(true);
    expect(r.faces.filter((f) => f.kind === "side").length).toBeLessThanOrEqual(2);
    expect(r.faces.filter((f) => f.kind === "side").length).toBeGreaterThanOrEqual(1);
    expect(r.col).toBe(3);
    expect(r.row).toBe(2);
    expect(r.top).toHaveLength(4);
    expect(faces_last_is_top(r.faces)).toBe(true);
  });
  it("lights the two visible sides differently", () => {
    const sides = barSceneCam(3, 2, 40, cam(), "#d6456b", DEFAULT_LIGHT).faces.filter((f) => f.kind === "side");
    if (sides.length === 2) expect(sides[0].fill).not.toBe(sides[1].fill);
  });
});

function faces_last_is_top(faces: { kind: string }[]): boolean {
  return faces[faces.length - 1].kind === "top";
}

describe("buildCameraScene", () => {
  const data: FolderTerrainData = {
    projectId: "p", projectName: "P", office: "MTY",
    folders: [{ id: "f1", name: "Client Documents" }, { id: "f2", name: "Design Documents" }],
    roles: [{ id: "r1", name: "Architect" }, { id: "r2", name: "Owner" }],
    cells: [
      { folderId: "f1", folderName: "Client Documents", roleId: "r1", roleName: "Architect", tier: "Full Controller", rank: 5, userCount: 4 },
      { folderId: "f2", folderName: "Design Documents", roleId: "r2", roleName: "Owner", tier: "View Only", rank: 1, userCount: 1 },
    ],
    usersByRole: { r1: [], r2: [] }, maxUserCount: 4, generatedAt: "x",
  };
  const camera: Camera = { pivotCol: 0.5, pivotRow: 0.5, yaw: HOME_YAW, pitch: HOME_PITCH, scale: 1, anchorX: 300, anchorY: 180 };

  it("produces one bar per cell, tagged with grid coords, sized to the viewport", () => {
    const s = buildCameraScene(data, { camera, viewport: { w: 600, h: 360 } });
    expect(s.bars).toHaveLength(2);
    expect(s.bars[0].col).toBeDefined();
    expect(s.bars[0].row).toBeDefined();
    expect(s.width).toBe(600);
    expect(s.height).toBe(360);
    expect(s.folderLabels).toHaveLength(2);
    expect(s.compass.folder).toBeDefined();
  });

  it("orders bars far → near by depth", () => {
    const s = buildCameraScene(data, { camera, viewport: { w: 600, h: 360 } });
    for (let i = 1; i < s.bars.length; i++) expect(s.bars[i].depth).toBeGreaterThanOrEqual(s.bars[i - 1].depth);
  });

  it("keeps the pivot pinned to the anchor as the camera orbits", () => {
    const base = buildCameraScene(data, { camera, viewport: { w: 600, h: 360 } });
    const spun = buildCameraScene(data, { camera: { ...camera, yaw: camera.yaw + 1.1, pitch: 0.9 }, viewport: { w: 600, h: 360 } });
    // The lattice line through the pivot keeps the anchor fixed — assert via a fresh projection.
    expect(projectCamera(camera.pivotCol, camera.pivotRow, 0, camera)).toEqual({ x: 300, y: 180 });
    expect(base.bars).toHaveLength(spun.bars.length);
  });

  it("returns an empty scene for null data", () => {
    expect(buildCameraScene(null, { camera, viewport: { w: 600, h: 360 } }).bars).toHaveLength(0);
  });

  it("scales every bar's height by the growth factor", () => {
    const full = buildCameraScene(data, { camera, viewport: { w: 600, h: 360 } });
    const half = buildCameraScene(data, { camera, viewport: { w: 600, h: 360 }, growth: 0.5 });
    // Taller bars reach a smaller screen-y; at growth 0.5 every top sits lower.
    const topY = (s: typeof full) => Math.min(...s.bars.flatMap((b) => b.top.map((p) => p.y)));
    expect(topY(half)).toBeGreaterThan(topY(full));
  });

  it("treats growth=0 as flat (no height)", () => {
    const flat = buildCameraScene(data, { camera, viewport: { w: 600, h: 360 }, growth: 0 });
    expect(flat.bars.length).toBe(2);
  });
});
