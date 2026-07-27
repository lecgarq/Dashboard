import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only guard — mock before importing the helper
vi.mock("server-only", () => ({}));

const mockAuth = vi.hoisted(() => vi.fn());

const mocks = vi.hoisted(() => ({
  findIssues: vi.fn(),
  findMembers: vi.fn(),
  findDcUsers: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: mockAuth }));

vi.mock("@/server/db", () => ({
  db: {
    accIssue: { findMany: mocks.findIssues },
    accProjectMember: { findMany: mocks.findMembers },
    accDcUser: { findMany: mocks.findDcUsers },
  },
}));

// Minimal raw rows that toClashIssue can map
const STUB_ROW = {
  displayId: 42,
  title: "Clash A",
  description: "Beam vs column",
  status: "open",
  createdBy: "user-111",
  confidence: "high",
  coordinationSource: "clash-endpoint",
  clashValidated: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  rawJson: null,
};

const DC_USER = { autodeskId: "user-111", name: "DC Name", email: "dc@example.com" };
const MEMBER = { autodeskId: "user-111", name: "Member Name", email: "member@example.com" };

import { loadProjectClashes } from "./projectClashView";

describe("loadProjectClashes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated session
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "admin@test.com" } });
    mocks.findIssues.mockResolvedValue([STUB_ROW]);
    mocks.findMembers.mockResolvedValue([MEMBER]);
    mocks.findDcUsers.mockResolvedValue([DC_USER]);
  });

  it("returns [] when session is null (unauthenticated)", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await loadProjectClashes("proj-123");
    expect(result).toEqual([]);
  });

  it("returns [] when projectId is empty string", async () => {
    const result = await loadProjectClashes("");
    expect(result).toEqual([]);
  });

  it("returns ClashIssue elements with the expected shape", async () => {
    const result = await loadProjectClashes("proj-123");
    expect(result).toHaveLength(1);
    const issue = result[0];
    // Assert all required ClashIssue keys are present
    expect(issue).toHaveProperty("displayId");
    expect(issue).toHaveProperty("title");
    expect(issue).toHaveProperty("status");
    expect(issue).toHaveProperty("author");
    expect(issue).toHaveProperty("authorEmail");
    expect(issue).toHaveProperty("validated");
    expect(issue).toHaveProperty("createdAt");
    expect(issue).toHaveProperty("closedAt");
    expect(issue).toHaveProperty("commentCount");
    expect(issue).toHaveProperty("attachmentCount");
  });

  it("DC snapshot wins over project member when same autodeskId", async () => {
    // Both MEMBER (name: "Member Name") and DC_USER (name: "DC Name") share user-111.
    // The helper sets member first, then overwrites with DC snapshot.
    const result = await loadProjectClashes("proj-123");
    expect(result).toHaveLength(1);
    // DC name should win
    expect(result[0].author).toBe("DC Name");
    expect(result[0].authorEmail).toBe("dc@example.com");
  });

  it("queries accIssue with the correct projectId filter and take:500", async () => {
    await loadProjectClashes("proj-abc");
    expect(mocks.findIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "proj-abc", isCoordination: true },
        take: 500,
      }),
    );
  });
});
