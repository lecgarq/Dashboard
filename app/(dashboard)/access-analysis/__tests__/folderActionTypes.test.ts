import { describe, it, expect } from "vitest";
import {
  actionTypeFor,
  summarizeFolderActionMatrix,
  ACTION_TYPES,
  type FolderActionCell,
} from "../folderActionTypes";

describe("actionTypeFor", () => {
  it("buckets the live folder-scoped verbs into their action types", () => {
    // Views
    expect(actionTypeFor("view-entity")).toBe("Views");
    expect(actionTypeFor("print-entity")).toBe("Views");
    expect(actionTypeFor("view-in-autocad-web")).toBe("Views");
    // Downloads & exports
    expect(actionTypeFor("download-entity")).toBe("Downloads & exports");
    expect(actionTypeFor("export-file")).toBe("Downloads & exports");
    // Uploads
    expect(actionTypeFor("upload-entity")).toBe("Uploads");
    // Edits & moves
    expect(actionTypeFor("create-entity")).toBe("Edits & moves");
    expect(actionTypeFor("rename-entity")).toBe("Edits & moves");
    expect(actionTypeFor("move-entity")).toBe("Edits & moves");
    expect(actionTypeFor("copy-file")).toBe("Edits & moves");
    expect(actionTypeFor("restore-entity")).toBe("Edits & moves");
    expect(actionTypeFor("lock-entity")).toBe("Edits & moves");
    expect(actionTypeFor("edit-office-file")).toBe("Edits & moves");
    // Deletions
    expect(actionTypeFor("delete-entity")).toBe("Deletions");
    // Sharing & links (transmittals distribute documents)
    expect(actionTypeFor("create-transmittal")).toBe("Sharing & links");
    expect(actionTypeFor("view-public-link")).toBe("Sharing & links");
    expect(actionTypeFor("shared-with-recipients-for-folders")).toBe("Sharing & links");
    // Reviews & approvals
    expect(actionTypeFor("add-docs-to-review")).toBe("Reviews & approvals");
    expect(actionTypeFor("set-approval-status")).toBe("Reviews & approvals");
    expect(actionTypeFor("submit-review")).toBe("Reviews & approvals");
    // Fallback
    expect(actionTypeFor("mystery-verb-xyz")).toBe("Other");
  });

  it("review/sharing classification wins over the generic prefix rules", () => {
    // view-public-link starts with "view" but is sharing; add-docs-to-review starts
    // with "add-" but is review workflow.
    expect(actionTypeFor("view-public-link")).not.toBe("Views");
    expect(actionTypeFor("add-docs-to-review")).not.toBe("Edits & moves");
  });
});

describe("summarizeFolderActionMatrix", () => {
  const cells: FolderActionCell[] = [
    { folderName: "Project Files", verb: "view-entity", count: 100 },
    { folderName: "Project Files", verb: "upload-entity", count: 40 },
    { folderName: "Project Files", verb: "print-entity", count: 10 }, // merges into Views
    { folderName: "ARQ", verb: "download-entity", count: 30 },
  ];

  it("ranks folders by total desc and merges same-type verbs into one cell", () => {
    const m = summarizeFolderActionMatrix(cells);
    expect(m.folders).toEqual(["Project Files", "ARQ"]);
    expect(m.totalByFolder.get("Project Files")).toBe(150);
    expect(m.total).toBe(180);
    // Views cell for Project Files = view-entity + print-entity.
    const viewsIdx = m.types.indexOf("Views");
    const cell = m.cells.find(([ti, fi]) => ti === viewsIdx && fi === 0);
    expect(cell?.[2]).toBe(110);
    expect(m.maxCount).toBe(110);
  });

  it("only emits columns actually present, in canonical ACTION_TYPES order", () => {
    const m = summarizeFolderActionMatrix(cells);
    expect(m.types).toEqual(["Views", "Downloads & exports", "Uploads"]);
    for (const t of m.types) expect(ACTION_TYPES).toContain(t);
  });

  it("omits zero cells and returns empty shapes for no rows", () => {
    const m = summarizeFolderActionMatrix(cells);
    // ARQ has no Views/Uploads cells — only its Downloads cell exists.
    expect(m.cells.filter(([, fi]) => fi === 1)).toHaveLength(1);
    const empty = summarizeFolderActionMatrix([]);
    expect(empty.folders).toEqual([]);
    expect(empty.cells).toEqual([]);
    expect(empty.maxCount).toBe(0);
  });
});
