/**
 * lib/acc/folderCrawl.test.ts
 *
 * Vitest unit tests for crawlProjectFolders().
 *
 * All APS calls are mocked via vi.mock("@/lib/server/acc-admin").
 * No real network requests are made.
 *
 * Test groups:
 *   1. BFS termination — 3-level tree (root → A,B → A1,A2,B1)
 *   2. pLimit cap — assert no more than 5 concurrent fetches at once
 *   3. b.-prefix discipline — DM URLs use projectIdForDM; permissions use projectIdForPerms
 *   4. ROLE filter — only subjectType==="ROLE" entries pass
 *   5. Hard-cap abort — hardCapMs: 1 causes status="partial" / reason="hard_cap_exceeded"
 *   6. fullPath computation — root folders start with /; children nest correctly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { crawlProjectFolders } from "./folderCrawl";
import type { CrawlOptions } from "./folderCrawl";

// ---------------------------------------------------------------------------
// Mock @/lib/server/acc-admin
// ---------------------------------------------------------------------------

vi.mock("@/lib/server/acc-admin", () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchWithRetry } from "@/lib/server/acc-admin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN = "test-token";
const HUB_ID = "b.HUB-001";
const DM_ID = "b.PROJ-001";        // projectIdForDM
const PERMS_ID = "PROJ-001";       // projectIdForPerms (bare UUID)

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function folderData(id: string, displayName: string) {
  return { id, attributes: { displayName }, type: "folders" };
}

// ---------------------------------------------------------------------------
// Default options (no time pressure)
// ---------------------------------------------------------------------------

const defaultOpts: CrawlOptions = {
  dryRun: true,
  softCapMs: 60_000,
  hardCapMs: 120_000,
  pLimitConcurrency: 5,
};

// ---------------------------------------------------------------------------
// 1. BFS termination
// ---------------------------------------------------------------------------

describe("BFS termination — 3-level tree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crawls root → A,B → A1,A2,B1 and returns 5 folders with correct parent links", async () => {
    const mockFetch = vi.mocked(fetchWithRetry);

    // Track call sequence to return correct responses
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/topFolders")) {
        return jsonRes({ data: [folderData("id-A", "A"), folderData("id-B", "B")] });
      }
      if (url.includes("/folders/id-A/contents")) {
        return jsonRes({ data: [folderData("id-A1", "A1"), folderData("id-A2", "A2")] });
      }
      if (url.includes("/folders/id-B/contents")) {
        return jsonRes({ data: [folderData("id-B1", "B1")] });
      }
      if (url.includes("/folders/") && url.includes("/contents")) {
        return jsonRes({ data: [] });
      }
      // Permissions: return empty for simplicity
      return jsonRes([]);
    });

    const result = await crawlProjectFolders(HUB_ID, DM_ID, PERMS_ID, TOKEN, defaultOpts);

    expect(result.status).toBe("ok");
    expect(result.folders).toHaveLength(5);

    const byId = Object.fromEntries(result.folders.map((f) => [f.id, f]));

    // Root-level folders have no parent
    expect(byId["id-A"].parentId).toBeNull();
    expect(byId["id-B"].parentId).toBeNull();

    // Second-level folders parent back to root folders
    expect(byId["id-A1"].parentId).toBe("id-A");
    expect(byId["id-A2"].parentId).toBe("id-A");
    expect(byId["id-B1"].parentId).toBe("id-B");
  });
});

// ---------------------------------------------------------------------------
// 2. pLimit cap
// ---------------------------------------------------------------------------

describe("pLimit cap — max 5 concurrent fetches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never exceeds 5 simultaneous in-flight fetches", async () => {
    const mockFetch = vi.mocked(fetchWithRetry);
    let inFlight = 0;
    let maxInFlight = 0;

    // Build a 10-folder tree (root → f1..f10) so we have enough to stress the limit
    mockFetch.mockImplementation(async (url: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Small async yield to give other promises a chance to pile up
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;

      if (url.includes("/topFolders")) {
        const folders = Array.from({ length: 10 }, (_, i) =>
          folderData(`id-f${i + 1}`, `F${i + 1}`),
        );
        return jsonRes({ data: folders });
      }
      if (url.includes("/contents")) {
        return jsonRes({ data: [] });
      }
      // Permissions
      return jsonRes([]);
    });

    const result = await crawlProjectFolders(HUB_ID, DM_ID, PERMS_ID, TOKEN, {
      ...defaultOpts,
      pLimitConcurrency: 5,
    });

    expect(result.folders).toHaveLength(10);
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// 3. b.-prefix discipline
// ---------------------------------------------------------------------------

describe("b.-prefix discipline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses projectIdForDM (b.-prefixed) for topFolders and folder contents", async () => {
    const mockFetch = vi.mocked(fetchWithRetry);
    const capturedUrls: string[] = [];

    mockFetch.mockImplementation(async (url: string) => {
      capturedUrls.push(url);
      if (url.includes("/topFolders")) {
        return jsonRes({ data: [folderData("id-F1", "F1")] });
      }
      if (url.includes("/contents")) {
        return jsonRes({ data: [] });
      }
      return jsonRes([]);
    });

    await crawlProjectFolders(HUB_ID, DM_ID, PERMS_ID, TOKEN, defaultOpts);

    const topFoldersCalls = capturedUrls.filter((u) => u.includes("/topFolders"));
    const contentsCalls = capturedUrls.filter((u) => u.includes("/contents"));
    const permsCalls = capturedUrls.filter((u) => u.includes("/permissions"));

    // Top folders and contents must use b.-prefixed DM_ID
    for (const u of [...topFoldersCalls, ...contentsCalls]) {
      expect(u).toContain(DM_ID); // b.PROJ-001
    }

    // Permissions must use bare PERMS_ID (no b. prefix)
    for (const u of permsCalls) {
      expect(u).toContain(PERMS_ID);          // PROJ-001
      expect(u).not.toContain(`/${DM_ID}/`);  // must NOT use b.PROJ-001 in path
    }
  });
});

// ---------------------------------------------------------------------------
// 4. ROLE filter
// ---------------------------------------------------------------------------

describe("ROLE filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes only subjectType===ROLE entries; discards USER entries", async () => {
    const mockFetch = vi.mocked(fetchWithRetry);

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/topFolders")) {
        return jsonRes({ data: [folderData("id-F1", "F1")] });
      }
      if (url.includes("/contents")) {
        return jsonRes({ data: [] });
      }
      if (url.includes("/permissions")) {
        return jsonRes([
          { subjectType: "ROLE", subjectId: "role-aaa", actions: ["VIEW"] },
          { subjectType: "USER", subjectId: "user-bbb", actions: ["VIEW", "DOWNLOAD"] },
          { subjectType: "ROLE", subjectId: "role-ccc", actions: ["VIEW", "DOWNLOAD", "PUBLISH"] },
        ]);
      }
      return jsonRes([]);
    });

    const result = await crawlProjectFolders(HUB_ID, DM_ID, PERMS_ID, TOKEN, defaultOpts);

    expect(result.permissions).toHaveLength(2);
    const roleIds = result.permissions.map((p) => p.roleId);
    expect(roleIds).toContain("role-aaa");
    expect(roleIds).toContain("role-ccc");
    expect(roleIds).not.toContain("user-bbb");
  });
});

// ---------------------------------------------------------------------------
// 5. Hard-cap abort
// ---------------------------------------------------------------------------

describe("hard-cap abort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns status=partial and reason=hard_cap_exceeded when hardCapMs is 1", async () => {
    const mockFetch = vi.mocked(fetchWithRetry);

    // Add a real delay so we definitely exceed the 1ms hard cap
    mockFetch.mockImplementation(async (url: string) => {
      await new Promise((r) => setTimeout(r, 50));
      if (url.includes("/topFolders")) {
        return jsonRes({ data: [folderData("id-F1", "F1"), folderData("id-F2", "F2")] });
      }
      if (url.includes("/contents")) {
        return jsonRes({ data: [] });
      }
      return jsonRes([]);
    });

    const result = await crawlProjectFolders(HUB_ID, DM_ID, PERMS_ID, TOKEN, {
      dryRun: true,
      hardCapMs: 1,
      softCapMs: 0,
      pLimitConcurrency: 5,
    });

    expect(result.status).toBe("partial");
    expect(result.reason).toBe("hard_cap_exceeded");
  });
});

// ---------------------------------------------------------------------------
// 6. fullPath computation
// ---------------------------------------------------------------------------

describe("fullPath computation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("root folders have fullPath starting with /; children nest correctly", async () => {
    const mockFetch = vi.mocked(fetchWithRetry);

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/topFolders")) {
        return jsonRes({ data: [folderData("id-Root", "ProjectFiles")] });
      }
      if (url.includes("/folders/id-Root/contents")) {
        return jsonRes({ data: [folderData("id-Child", "Drawings")] });
      }
      if (url.includes("/contents")) {
        return jsonRes({ data: [] });
      }
      return jsonRes([]);
    });

    const result = await crawlProjectFolders(HUB_ID, DM_ID, PERMS_ID, TOKEN, defaultOpts);

    const byId = Object.fromEntries(result.folders.map((f) => [f.id, f]));

    expect(byId["id-Root"].fullPath).toBe("/ProjectFiles");
    expect(byId["id-Child"].fullPath).toBe("/ProjectFiles/Drawings");
  });
});
