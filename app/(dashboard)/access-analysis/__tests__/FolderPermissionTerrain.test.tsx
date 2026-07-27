// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { FolderPermissionTerrain, deriveTerrainSelection } from "../components/FolderPermissionTerrain";
import type { FolderTerrainData, TerrainProjectOption } from "../folderTerrain";

const data: FolderTerrainData = {
  projectId: "p1",
  projectName: "Demo Project",
  office: "MTY",
  folders: [
    { id: "f1", name: "Client Documents" },
    { id: "f2", name: "Design Documents" },
  ],
  roles: [
    { id: "r1", name: "Architect" },
    { id: "r2", name: "Owner" },
  ],
  cells: [
    { folderId: "f1", folderName: "Client Documents", roleId: "r1", roleName: "Architect", tier: "Full Controller", rank: 5, userCount: 2 },
    { folderId: "f2", folderName: "Design Documents", roleId: "r1", roleName: "Architect", tier: "View Only", rank: 1, userCount: 2 },
    { folderId: "f1", folderName: "Client Documents", roleId: "r2", roleName: "Owner", tier: "View+Download", rank: 2, userCount: 1 },
  ],
  usersByRole: {
    r1: [{ name: "Ana", email: "ana@x.com" }, { name: "Beto", email: "beto@x.com" }],
    r2: [{ name: "Caro", email: "caro@x.com" }],
  },
  maxUserCount: 2,
  generatedAt: "2026-06-08T00:00:00Z",
};

// A second project sharing folder/role names so the shared axes overlap.
const data2: FolderTerrainData = {
  ...data,
  projectId: "p2",
  projectName: "Project Two",
  cells: [
    { folderId: "f1", folderName: "Client Documents", roleId: "r1", roleName: "Architect", tier: "View Only", rank: 1, userCount: 1 },
  ],
  usersByRole: { r1: [{ name: "Dana", email: "dana@x.com" }] },
  maxUserCount: 1,
};

const projects: TerrainProjectOption[] = [
  { id: "p1", name: "Demo Project", office: "MTY", folderCount: 2, permCount: 3, userRoleCount: 3 },
  { id: "p2", name: "Project Two", office: "MTY", folderCount: 2, permCount: 1, userRoleCount: 2 },
];

describe("FolderPermissionTerrain", () => {
  const terrain = (container: HTMLElement) => container.querySelector('svg[aria-label="Folder permission terrain"]')!;

  it("renders culled lit faces + a contact shadow per cell and labels the folders", async () => {
    const { container, getByText } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
    );
    // Folders are labelled in the gutter (the user's priority) — independent of grow-in.
    expect(getByText("Client Documents")).toBeTruthy();
    expect(getByText("Design Documents")).toBeTruthy();
    // After grow-in settles each bar shows 2 sides + 1 top (=3 faces), plus 1 ground
    // shadow polygon per cell: 3 cells × (3 + 1) = 12 polygons (compass excluded).
    await vi.waitFor(() => {
      expect(terrain(container).querySelectorAll("polygon").length).toBe(12);
    });
  });

  it("renders full geometry immediately under reduced motion (no grow-in)", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    try {
      const { container } = render(
        <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
      );
      // Reduced motion → growth starts at 1, so all 12 polygons appear synchronously.
      expect(terrain(container).querySelectorAll("polygon").length).toBe(12);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("defines blur + top-gradient defs and uses a gradient fill on top faces", () => {
    const { container } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
    );
    const svg = terrain(container);
    expect(svg.querySelector("filter#terrainSoftShadow")).toBeTruthy();
    expect(svg.querySelectorAll("linearGradient[id^='terrainTop-']").length).toBe(6); // one top-face gradient per ACC tier (ranks 1..6)
    // At least one top face references a gradient.
    const grad = [...svg.querySelectorAll("polygon")].some((p) => (p.getAttribute("fill") || "").includes("url(#terrainTop-"));
    expect(grad).toBe(true);
  });

  it("opens a details card when a square is clicked", () => {
    const { container, getByText, queryByText } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
    );
    expect(queryByText(/this role/)).toBeNull();
    // Click a bar face (shadows render first and carry no handler), so target the last terrain polygon.
    const polys = terrain(container).querySelectorAll("polygon");
    fireEvent.click(polys[polys.length - 1]);
    // The details card appears with the per-role summary line.
    expect(getByText(/this role/)).toBeTruthy();
  });

  it("uses dark header ink on a high-access (gold) cell", () => {
    const gold: FolderTerrainData = {
      ...data,
      cells: [{ folderId: "f1", folderName: "Client Documents", roleId: "r1", roleName: "Architect", tier: "Full Controller", rank: 5, userCount: 2 }],
    };
    const { container, getByText } = render(
      <FolderPermissionTerrain projects={projects} initial={gold} loadTerrain={vi.fn(async () => null)} />,
    );
    const polys = terrain(container).querySelectorAll("polygon");
    fireEvent.click(polys[polys.length - 1]);
    // The coloured details header carries the legible dark ink (rank 5), not white.
    const header = getByText("Close").closest("[style]") as HTMLElement;
    const style = (header.getAttribute("style") || "").toLowerCase();
    expect(/0b1620|11,\s*22,\s*32/.test(style)).toBe(true);
  });

  it("lifts the hovered bar", () => {
    const { container } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
    );
    const polys = terrain(container).querySelectorAll("polygon");
    const barGroup = polys[polys.length - 1].closest("g")!;
    fireEvent.mouseEnter(barGroup);
    expect(barGroup.getAttribute("transform") || barGroup.style.transform || "").toMatch(/translate|matrix/);
  });

  it("toggles the Orbit / Pan tool buttons", () => {
    const { getByTitle } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
    );
    const orbit = getByTitle("Orbit (left-drag)");
    expect(orbit.className).not.toMatch(/bg-primary/);
    fireEvent.click(orbit);
    expect(orbit.className).toMatch(/bg-primary/);
  });

  it("wraps the scene in a keyed fading group", () => {
    const { container } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
    );
    const fade = terrain(container).querySelector("g[data-scene-fade]") as SVGGElement | null;
    expect(fade).toBeTruthy();
    expect(fade!.style.transition).toMatch(/opacity/);
  });

  it("keeps the BIM-style navigation help visible", () => {
    const { getByText } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
    );
    expect(getByText(/click a square to focus/i)).toBeTruthy();
  });

  it("shows the empty state when there is no data", () => {
    const { getByText } = render(
      <FolderPermissionTerrain projects={[]} initial={null} loadTerrain={vi.fn(async () => null)} />,
    );
    expect(getByText(/No folder-permission data/)).toBeTruthy();
  });

  it("stacks projects as separated planes with connectors in compare mode", async () => {
    const loadTerrain = vi.fn(async (id: string) => (id === "p2" ? data2 : id === "p1" ? data : null));
    const { getByText, findByText, container } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={loadTerrain} />,
    );
    fireEvent.click(getByText("Compare"));
    // Each project keeps its own header once its data has loaded.
    expect(await findByText("Project Two")).toBeTruthy();
    expect(getByText("Demo Project")).toBeTruthy();
    expect(loadTerrain).toHaveBeenCalledWith("p2");
    // Dotted connector drop-lines join the two planes (4 corners per gap).
    const dashed = [...terrain(container).querySelectorAll("line")].filter((l) => l.getAttribute("stroke-dasharray"));
    expect(dashed.length).toBeGreaterThanOrEqual(4);
  });

  it("renders a bold, sizeable project header per plane in compare mode", async () => {
    const loadTerrain = vi.fn(async (id: string) => (id === "p2" ? data2 : id === "p1" ? data : null));
    const { getByText, findByText } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={loadTerrain} />,
    );
    fireEvent.click(getByText("Compare"));
    const header = await findByText("Project Two");
    expect(Number(header.getAttribute("font-weight") || "400")).toBeGreaterThanOrEqual(700);
    expect(Number(header.getAttribute("font-size") || "0")).toBeGreaterThanOrEqual(13);
  });

  it("lazily loads the account-wide overview and drills into tiers", async () => {
    const overview: FolderTerrainData = {
      projectId: "__overview__",
      projectName: "All projects",
      office: "",
      folders: [{ id: "Client Documents", name: "Client Documents" }],
      roles: [{ id: "r1", name: "Architect" }],
      cells: [{ folderId: "Client Documents", folderName: "Client Documents", roleId: "r1", roleName: "Architect", tier: "View Only", rank: 1, userCount: 470, tierBreakdown: { 1: 400, 4: 70 } }],
      usersByRole: {},
      maxUserCount: 470,
      heightMetric: "projects",
      generatedAt: "x",
    };
    const loadOverview = vi.fn(async () => overview);
    const { getByText, findByText, container } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} loadOverview={loadOverview} />,
    );
    fireEvent.click(getByText("Overview"));
    expect(await findByText("Client Documents")).toBeTruthy();
    expect(loadOverview).toHaveBeenCalled();
    // Clicking a cell drills into "configured in N projects" (not a user list).
    const polys = terrain(container).querySelectorAll("polygon");
    fireEvent.click(polys[polys.length - 1]);
    expect(getByText(/configured in 470 projects/)).toBeTruthy();
  });
});

// 20.1-04: externalSelectedIds / hidePickers — the terrain driven by the
// page's global project picker (owner UAT item 4). All tests below are
// ADDITIVE; the suite above characterizes the unchanged default behavior.

describe("deriveTerrainSelection", () => {
  it("returns overview for 0 external ids", () => {
    expect(deriveTerrainSelection([], ["p1", "p2"])).toEqual({ mode: "overview", singleId: "", selected: [] });
  });

  it("returns single mode on that id for 1 external id", () => {
    expect(deriveTerrainSelection(["p2"], ["p1", "p2", "p3"])).toEqual({ mode: "single", singleId: "p2", selected: ["p2"] });
  });

  it("returns compare mode with the top-staffed-ordered intersection for 5 ids all present", () => {
    const topStaffed = ["p5", "p4", "p3", "p2", "p1"]; // userRoleCount-desc order
    const result = deriveTerrainSelection(["p1", "p2", "p3", "p4", "p5"], topStaffed);
    expect(result.mode).toBe("compare");
    expect(result.singleId).toBe("p5");
    expect(result.selected).toEqual(["p5", "p4", "p3", "p2", "p1"]);
  });

  it("caps the compare selection at 6 for 10 external ids", () => {
    const topStaffed = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const external = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const result = deriveTerrainSelection(external, topStaffed);
    expect(result.mode).toBe("compare");
    expect(result.selected).toEqual(topStaffed.slice(0, 6));
  });

  it("falls back to single when only 1 of 2 external ids is in topStaffed", () => {
    const result = deriveTerrainSelection(["p1", "pX"], ["p1", "p9"]);
    expect(result).toEqual({ mode: "single", singleId: "p1", selected: ["p1"] });
  });

  it("falls back to overview when external ids are fully disjoint from topStaffed", () => {
    const result = deriveTerrainSelection(["pX", "pY"], ["p1", "p2"]);
    expect(result).toEqual({ mode: "overview", singleId: "", selected: [] });
  });
});

describe("FolderPermissionTerrain — externalSelectedIds / hidePickers", () => {
  // Wider fixture (3 projects, distinct userRoleCount) to exercise the
  // top-staffed intersection with a set larger than the 2-project default fixture.
  const projects3: TerrainProjectOption[] = [
    { id: "p1", name: "Demo Project", office: "MTY", folderCount: 2, permCount: 3, userRoleCount: 5 },
    { id: "p2", name: "Project Two", office: "MTY", folderCount: 2, permCount: 1, userRoleCount: 4 },
    { id: "p3", name: "Project Three", office: "MTY", folderCount: 1, permCount: 1, userRoleCount: 3 },
  ];

  it("hides pickers and loads the overview when externally driven with an empty selection", async () => {
    const loadOverview = vi.fn(async () => null);
    const { container } = render(
      <FolderPermissionTerrain
        projects={projects}
        initial={data}
        loadTerrain={vi.fn(async () => null)}
        loadOverview={loadOverview}
        externalSelectedIds={[]}
        hidePickers
      />,
    );
    expect(container.querySelector("select")).toBeNull();
    expect(container.textContent).not.toMatch(/Pick projects to compare/);
    await vi.waitFor(() => expect(loadOverview).toHaveBeenCalled());
  });

  it("drives single mode from one external id, hides the ProjectSelect, and loads exactly that project", async () => {
    const loadTerrain = vi.fn(async (id: string) => (id === "p2" ? data2 : null));
    const { container } = render(
      <FolderPermissionTerrain
        projects={projects}
        initial={null}
        loadTerrain={loadTerrain}
        externalSelectedIds={["p2"]}
        hidePickers
      />,
    );
    expect(container.querySelector("select")).toBeNull();
    await vi.waitFor(() => expect(loadTerrain).toHaveBeenCalledWith("p2"));
    expect(loadTerrain).toHaveBeenCalledTimes(1);
  });

  it("drives compare mode from 3 external ids using only the top-staffed intersection (capped at 6)", async () => {
    const loadTerrain = vi.fn(async (id: string) => {
      if (id === "p1") return data;
      if (id === "p2") return data2;
      return null;
    });
    const { container } = render(
      <FolderPermissionTerrain
        projects={projects3}
        initial={null}
        loadTerrain={loadTerrain}
        externalSelectedIds={["p1", "p2", "pX"]}
        hidePickers
      />,
    );
    expect(container.textContent).not.toMatch(/Pick projects to compare/);
    await vi.waitFor(() => expect(loadTerrain).toHaveBeenCalledWith("p1"));
    await vi.waitFor(() => expect(loadTerrain).toHaveBeenCalledWith("p2"));
    expect(loadTerrain).not.toHaveBeenCalledWith("pX");
    expect(loadTerrain).toHaveBeenCalledTimes(2);
  });

  it("re-syncs mode when externalSelectedIds changes after mount", async () => {
    const loadOverview = vi.fn(async () => null);
    const loadTerrain = vi.fn(async (id: string) => (id === "p1" ? data : null));
    const { rerender, getByText, queryByText } = render(
      <FolderPermissionTerrain
        projects={projects}
        initial={data}
        loadTerrain={loadTerrain}
        loadOverview={loadOverview}
        externalSelectedIds={["p1"]}
        hidePickers
      />,
    );
    expect(queryByText("All projects · account-wide standard")).toBeNull();

    rerender(
      <FolderPermissionTerrain
        projects={projects}
        initial={data}
        loadTerrain={loadTerrain}
        loadOverview={loadOverview}
        externalSelectedIds={[]}
        hidePickers
      />,
    );
    expect(getByText("All projects · account-wide standard")).toBeTruthy();
    await vi.waitFor(() => expect(loadOverview).toHaveBeenCalled());
  });

  it("regression guard: renders pickers exactly as before when externalSelectedIds/hidePickers are absent", () => {
    const { container, getByText } = render(
      <FolderPermissionTerrain projects={projects} initial={data} loadTerrain={vi.fn(async () => null)} />,
    );
    // Default (unchanged) behavior: ProjectSelect (<select>) renders in single mode.
    expect(container.querySelector("select")).toBeTruthy();
    fireEvent.click(getByText("Compare"));
    // ProjectMultiSelect (a <button>, not <select>) renders with its existing
    // default `topStaffed.slice(0, 6)` selection — unaffected by this plan.
    expect(container.querySelector("select")).toBeNull();
    expect(getByText("Demo Project, Project Two")).toBeTruthy();
  });
});
