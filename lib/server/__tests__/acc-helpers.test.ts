import { describe, it, expect, vi } from "vitest";
import { getAccountId, getProjectIdForDM } from "@/lib/server/acc-helpers";

type ProjectFindFirstResult = { apsHubId: string | null } | null;

function makeDb(result: ProjectFindFirstResult) {
  return {
    project: {
      findFirst: vi.fn(async (_args: { select: { apsHubId: true } }) => result),
    },
  };
}

describe("getAccountId", () => {
  it("strips the leading 'b.' prefix from the hub id", async () => {
    const db = makeDb({ apsHubId: "b.abc-123" });
    await expect(getAccountId(db)).resolves.toBe("abc-123");
    expect(db.project.findFirst).toHaveBeenCalledWith({ select: { apsHubId: true } });
  });

  it("returns the hub id unchanged when there is no 'b.' prefix", async () => {
    const db = makeDb({ apsHubId: "abc-123" });
    await expect(getAccountId(db)).resolves.toBe("abc-123");
  });

  it("throws a plain Error (not TRPCError) when the project record is null", async () => {
    const db = makeDb(null);
    await expect(getAccountId(db)).rejects.toThrowError(/hub.*not configured/i);
    // Verify the thrown error is a plain Error, not a TRPCError.
    try {
      await getAccountId(db);
      throw new Error("expected getAccountId to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe("Error");
    }
  });

  it("throws when apsHubId is an empty string", async () => {
    const db = makeDb({ apsHubId: "" });
    await expect(getAccountId(db)).rejects.toThrowError(/hub.*not configured/i);
  });

  it("throws when apsHubId is null (Prisma optional column nullable)", async () => {
    const db = makeDb({ apsHubId: null });
    await expect(getAccountId(db)).rejects.toThrowError(/hub.*not configured/i);
  });
});

describe("getProjectIdForDM", () => {
  it("returns a 'b.'-prefixed id unchanged", () => {
    expect(getProjectIdForDM("b.proj-xyz")).toBe("b.proj-xyz");
  });

  it("returns an unprefixed id unchanged (caller's responsibility to pass correct format)", () => {
    expect(getProjectIdForDM("proj-xyz")).toBe("proj-xyz");
  });

  it("throws when given an empty string", () => {
    expect(() => getProjectIdForDM("")).toThrowError(/non-empty project id/);
  });
});
