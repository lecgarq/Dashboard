import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the heavy extractors so the test exercises only the orchestration.
vi.mock("@/lib/acc/quick-sync-extraction", () => ({
  extractAndPersistProjectData: vi.fn(async () => {}),
}));
vi.mock("@/lib/acc/folderCrawl", () => ({
  extractAndPersistFolders: vi.fn(async () => ({ folderCount: 7, permissionCount: 21, status: "ok" })),
}));

import { syncTemplate } from "@/lib/acc/templateSync";
import { extractAndPersistProjectData } from "@/lib/acc/quick-sync-extraction";
import { extractAndPersistFolders } from "@/lib/acc/folderCrawl";
import { TEMPLATE_MTY_ID } from "@/lib/acc/template-mty";

describe("syncTemplate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("seeds the AccProject row as a template and runs both extractors", async () => {
    const upsert = vi.fn(async () => ({}));
    const prisma = { accProject: { upsert } };
    const refreshAccessToken = vi.fn(async () => "tok");

    const res = await syncTemplate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      "acct-1",
      "b.acct-1",
      "tok",
      { refreshAccessToken },
    );

    const args = (upsert.mock.calls as unknown as [unknown[]])[0][0] as {
      where: { id: string };
      create: { type: string; status: string };
      update: { type: string; status: string };
    };
    expect(args.where.id).toBe(TEMPLATE_MTY_ID);
    expect(args.create.type).toBe("template");
    expect(args.create.status).toBe("active");
    expect(args.update.type).toBe("template");

    expect(extractAndPersistProjectData).toHaveBeenCalledOnce();
    expect((extractAndPersistProjectData as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][2])
      .toMatchObject({ id: TEMPLATE_MTY_ID });
    expect(extractAndPersistFolders).toHaveBeenCalledOnce();

    expect(res).toEqual({ folders: 7, perms: 21 });
  });
});
