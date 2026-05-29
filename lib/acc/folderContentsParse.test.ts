import { describe, it, expect } from "vitest";
import { parseFolderContents, EMPTY_ROLLUP } from "./folderContentsParse";

// Realistic Data Management folder-contents payload: data[] mixes folders + items;
// included[] carries the tip versions with the file attributes.
const FIXTURE = {
  data: [
    { type: "folders", id: "urn:folderA", attributes: { displayName: "Drawings" } },
    { type: "items", id: "urn:item1", attributes: { displayName: "plan.rvt" } },
    { type: "items", id: "urn:item2", attributes: { displayName: "model.rvt" } },
  ],
  included: [
    { type: "versions", id: "urn:v1", attributes: { versionNumber: 3, storageSize: 1000, lastModifiedTime: "2024-03-21T05:55:50.0000000Z", lastModifiedUserName: "Alice", createUserName: "Bob" } },
    { type: "versions", id: "urn:v2", attributes: { versionNumber: 1, storageSize: 500, lastModifiedTime: "2024-05-01T10:00:00.0000000Z", lastModifiedUserName: "Carol", createUserName: "Carol" } },
  ],
};

describe("parseFolderContents", () => {
  it("extracts only sub-folders (ignores items) for the BFS", () => {
    const { folders } = parseFolderContents(FIXTURE);
    expect(folders.map((f) => f.id)).toEqual(["urn:folderA"]);
    expect(folders[0].attributes?.displayName).toBe("Drawings");
  });

  it("rolls up file count, total size, and max version from included versions", () => {
    const { rollup } = parseFolderContents(FIXTURE);
    expect(rollup.fileCount).toBe(2);
    expect(rollup.totalSizeBytes).toBe(1500);
    expect(rollup.maxVersionNumber).toBe(3);
  });

  it("takes lastModified/by from the most recent version", () => {
    const { rollup } = parseFolderContents(FIXTURE);
    expect(rollup.lastModifiedTime).toBe("2024-05-01T10:00:00.0000000Z");
    expect(rollup.lastModifiedBy).toBe("Carol");
    expect(rollup.latestVersionAddedBy).toBe("Carol");
  });

  it("returns empty folders + EMPTY_ROLLUP for an empty/garbage payload", () => {
    expect(parseFolderContents({})).toEqual({ folders: [], rollup: EMPTY_ROLLUP });
    expect(parseFolderContents({ data: undefined, included: undefined })).toEqual({ folders: [], rollup: EMPTY_ROLLUP });
  });

  it("tolerates versions missing some attributes", () => {
    const { rollup } = parseFolderContents({
      data: [{ type: "items", id: "i" }],
      included: [{ type: "versions", id: "v", attributes: { storageSize: 42 } }],
    });
    expect(rollup.fileCount).toBe(1);
    expect(rollup.totalSizeBytes).toBe(42);
    expect(rollup.maxVersionNumber).toBeNull();
    expect(rollup.lastModifiedTime).toBeNull();
  });
});
