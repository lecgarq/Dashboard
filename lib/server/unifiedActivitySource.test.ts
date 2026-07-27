import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  countUnifiedActivityRows,
  groupUnifiedActivityRowsByUserProjectAction,
  listUnifiedActivityRows,
  mergeActivitySources,
} from "./unifiedActivitySource";

const dcRow = (overrides: Partial<any>) => ({
  id: "dc-row",
  autodeskId: "actor-1",
  userEmail: "user@example.com",
  projectId: "p1",
  rawAction: "view-entity",
  service: "docs",
  tool: null,
  details: "DC detail",
  sourceFile: "project",
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  ...overrides,
});

const accdsRow = (overrides: Partial<any>) => ({
  accdsActivityId: "accds-row",
  autodeskId: "actor-1",
  userEmail: "user@example.com",
  userName: "User Example",
  projectId: "p1",
  serviceGroup: "docs",
  activityVerb: "view-entity",
  objectId: "obj-1",
  objectType: "items",
  objectName: "Drawing A.pdf",
  folderId: null,
  folderName: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  ingestRunId: null,
  fetchedAt: new Date("2026-06-01T00:01:00.000Z"),
  ...overrides,
});

describe("unified activity source", () => {
  it("merges ACCDS rows, DC project backfill, and DC account admin rows without overlap", () => {
    const rows = mergeActivitySources({
      accdsRows: [
        accdsRow({ accdsActivityId: "accds-p1", projectId: "p1", createdAt: new Date("2026-06-01T00:00:00.000Z") }),
        accdsRow({ accdsActivityId: "accds-p2", projectId: "p2", createdAt: new Date("2026-05-15T00:00:00.000Z") }),
      ],
      dcRows: [
        dcRow({ id: "dc-p1-old", projectId: "p1", createdAt: new Date("2026-05-01T00:00:00.000Z") }),
        dcRow({ id: "dc-p1-overlap", projectId: "p1", createdAt: new Date("2026-06-02T00:00:00.000Z") }),
        dcRow({ id: "dc-p3-unreached", projectId: "p3", createdAt: new Date("2026-06-03T00:00:00.000Z") }),
        dcRow({ id: "dc-admin-empty", projectId: "", sourceFile: "admin", createdAt: new Date("2026-06-04T00:00:00.000Z") }),
        dcRow({ id: "dc-admin-null", projectId: null, sourceFile: "admin", createdAt: new Date("2026-06-05T00:00:00.000Z") }),
      ],
    });

    expect(rows.map((row) => row.id).sort()).toEqual([
      "accds:accds-p1",
      "accds:accds-p2",
      "dc-admin-empty",
      "dc-admin-null",
      "dc-p1-old",
      "dc-p3-unreached",
    ]);
  });

  it("normalizes ACCDS ids, source, action, service, and display details", () => {
    const rows = mergeActivitySources({
      dcRows: [],
      accdsRows: [
        accdsRow({
          accdsActivityId: "folder-row",
          activityVerb: "upload-entity",
          serviceGroup: "docs",
          objectName: null,
          folderName: "Plans",
          objectType: "folders",
        }),
        accdsRow({
          accdsActivityId: "type-row",
          objectName: null,
          folderName: null,
          objectType: "issues",
        }),
      ],
    });

    expect(rows[0]).toMatchObject({
      id: "accds:folder-row",
      rawAction: "upload-entity",
      service: "docs",
      sourceFile: "accds",
      details: "Plans",
    });
    expect(rows[1]).toMatchObject({
      id: "accds:type-row",
      details: "issues",
    });
  });

  it("groups file actions with recent ACCDS rows and pre-ACCDS DC history", () => {
    const rows = mergeActivitySources({
      accdsRows: [
        accdsRow({ accdsActivityId: "recent-view", projectId: "p1", createdAt: new Date("2026-06-10T00:00:00.000Z") }),
      ],
      dcRows: [
        dcRow({ id: "old-view", projectId: "p1", createdAt: new Date("2026-05-10T00:00:00.000Z") }),
        dcRow({ id: "overlap-view", projectId: "p1", createdAt: new Date("2026-06-11T00:00:00.000Z") }),
      ],
    });

    const groups = groupUnifiedActivityRowsByUserProjectAction(rows);

    expect(groups).toEqual([
      {
        userEmail: "user@example.com",
        projectId: "p1",
        rawAction: "view-entity",
        count: 2,
        lastCreatedAt: "2026-06-10T00:00:00.000Z",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Query-shape guards (perf regression pins). Clicking a person on /users runs
// three per-user unified queries; these two shapes are what keep them at ~70ms
// instead of ~12s each (measured 2026-07-07 on 5.8M activity rows):
//   1. userEmail filtered by RAW equality on the lowercased param — wrapping
//      the column in LOWER() disables the (userEmail, createdAt) indexes and
//      forces full scans of both activity tables.
//   2. The accds start boundary (astart) derived via LATERAL index probes from
//      the small project tables — a GROUP BY over all of AccActivityAccds
//      re-scanned ~4.7M rows on every call.
// ---------------------------------------------------------------------------
describe("unified query SQL shape (index-friendly pins)", () => {
  function captureDb() {
    const calls: Prisma.Sql[] = [];
    const db = {
      $queryRaw: async (query: Prisma.Sql) => {
        calls.push(query);
        return [{ count: BigInt(0) }];
      },
    };
    return { db, calls };
  }

  it("filters userEmail with raw equality on the lowercased param, never LOWER(column)", async () => {
    const { db, calls } = captureDb();
    await countUnifiedActivityRows(db as never, { userEmail: "User@Example.COM" });
    const sql = calls[0].sql;
    expect(sql).toContain(`"userEmail" = `);
    expect(sql).not.toMatch(/LOWER\("userEmail"\)/);
    expect(calls[0].values).toContain("user@example.com");
  });

  it("filters userEmails (batch) with raw = ANY on lowercased params", async () => {
    const { db, calls } = captureDb();
    await countUnifiedActivityRows(db as never, { userEmails: ["A@x.com", "B@y.com"] });
    const sql = calls[0].sql;
    expect(sql).toContain(`"userEmail" = ANY`);
    expect(sql).not.toMatch(/LOWER\("userEmail"\)/);
    expect(calls[0].values).toContainEqual(["a@x.com", "b@y.com"]);
  });

  it("derives the accds start boundary via LATERAL probes, not GROUP BY over the table", async () => {
    const { db, calls } = captureDb();
    await listUnifiedActivityRows(db as never, { where: { userEmail: "a@x.com" }, take: 20 });
    const sql = calls[0].sql;
    expect(sql).toContain("CROSS JOIN LATERAL");
    expect(sql).not.toMatch(/FROM "AccActivityAccds"\s+GROUP BY "projectId"/);
  });
});
