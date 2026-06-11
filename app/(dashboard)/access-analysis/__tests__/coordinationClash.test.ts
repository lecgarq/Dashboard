import { describe, it, expect } from "vitest";
import { toClashIssue, summarizeAuthors, type ClashIssue } from "../coordinationClash";

describe("toClashIssue", () => {
  it("maps columns, resolves the author name+email, and pulls comment/attachment/closedAt from rawJson", () => {
    const out = toClashIssue(
      {
        displayId: 146,
        title: "Panel and Fire-Protection clash",
        description: "1 clash between A and B",
        status: "closed",
        createdBy: "ZA7HKTXKCE9T",
        confidence: "high",
        coordinationSource: "description",
        clashValidated: true,
        createdAt: new Date("2024-10-20T03:45:59.316Z"),
        rawJson: { closedAt: "2024-11-01T00:00:00.000Z", commentCount: 3, attachmentCount: 2, extra: "ignored" },
      },
      (id) => (id === "ZA7HKTXKCE9T" ? { name: "Edgar Martinez", email: "edgar@hermosillo.com" } : null),
    );
    expect(out).toEqual({
      displayId: 146,
      title: "Panel and Fire-Protection clash",
      description: "1 clash between A and B",
      status: "closed",
      author: "Edgar Martinez",
      authorEmail: "edgar@hermosillo.com",
      confidence: "high",
      source: "description",
      validated: true,
      createdAt: "2024-10-20T03:45:59.316Z",
      closedAt: "2024-11-01T00:00:00.000Z",
      commentCount: 3,
      attachmentCount: 2,
    });
  });

  it("leaves author/authorEmail null when there is no createdBy or no resolver", () => {
    const base = {
      displayId: 1, title: "x", description: null, status: "open", confidence: null,
      coordinationSource: null, clashValidated: false, createdAt: null, rawJson: {},
    };
    expect(toClashIssue({ ...base, createdBy: null }, () => ({ name: "Someone", email: "a@b.c" })).author).toBeNull();
    const noResolver = toClashIssue({ ...base, createdBy: "abc" });
    expect(noResolver.author).toBeNull();
    expect(noResolver.authorEmail).toBeNull();
    expect(toClashIssue({ ...base, createdBy: "abc" }, () => null).author).toBeNull(); // unresolved id
  });

  it("is null-safe when rawJson is absent or not an object", () => {
    const out = toClashIssue({
      displayId: null,
      title: "x",
      description: null,
      status: null,
      createdBy: null,
      confidence: null,
      coordinationSource: null,
      clashValidated: false,
      createdAt: null,
      rawJson: null,
    });
    expect(out.status).toBe("unknown");
    expect(out.author).toBeNull();
    expect(out.closedAt).toBeNull();
    expect(out.commentCount).toBeNull();
    expect(out.attachmentCount).toBeNull();
    expect(out.createdAt).toBeNull();
  });

  it("accepts ISO-string createdAt as well as Date", () => {
    const out = toClashIssue({
      displayId: 1, title: "x", description: null, status: "open", createdBy: null, confidence: null,
      coordinationSource: null, clashValidated: false, createdAt: "2025-01-01T00:00:00.000Z", rawJson: {},
    });
    expect(out.createdAt).toBe("2025-01-01T00:00:00.000Z");
  });
});

describe("summarizeAuthors", () => {
  const mk = (author: string | null, authorEmail: string | null): ClashIssue => ({
    displayId: null, title: "t", description: null, status: "open", author, authorEmail,
    confidence: null, source: null, validated: false, createdAt: null, closedAt: null,
    commentCount: null, attachmentCount: null,
  });

  it("tallies clashes per author, most issues first", () => {
    const out = summarizeAuthors([
      mk("Luis", "luis@x.com"),
      mk("Cain", "cain@x.com"),
      mk("Luis", "luis@x.com"),
      mk("Luis", "luis@x.com"),
      mk("Cain", "cain@x.com"),
    ]);
    expect(out).toEqual([
      { name: "Luis", email: "luis@x.com", count: 3 },
      { name: "Cain", email: "cain@x.com", count: 2 },
    ]);
  });

  it("skips authorless clashes and groups by email case-insensitively", () => {
    const out = summarizeAuthors([
      mk("Luis", "Luis@X.com"),
      mk("Luis", "luis@x.com"),
      mk(null, null),
    ]);
    expect(out).toEqual([{ name: "Luis", email: "Luis@X.com", count: 2 }]);
  });
});
