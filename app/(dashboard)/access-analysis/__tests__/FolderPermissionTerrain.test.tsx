// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { FolderPermissionTerrain } from "../components/FolderPermissionTerrain";
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
    expect(svg.querySelectorAll("linearGradient[id^='terrainTop-']").length).toBe(5);
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
