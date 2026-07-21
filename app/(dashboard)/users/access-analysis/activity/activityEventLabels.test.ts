import { describe, expect, it } from "vitest";
import { monthLabel, resolveActivityHoverLabels } from "./activityEventLabels";

const dicts = {
  verb: ["(none)", "view-document", "upload-file"],
  module: ["(none)", "admin", "docs"],
  project: ["(none)", "guid-1", "guid-2"],
  author: ["Unknown author", "ana@hermosillo.com"],
  role: ["Unknown", "Project Engineer"],
  company: ["Unknown", "Hermosillo"],
  monthFloor: "2024-12",
  monthCount: 20,
};

const columns = {
  verbId: new Uint16Array([1, 2]),
  moduleId: new Uint16Array([2, 0]),
  monthId: new Uint16Array([0, 13]),
  roleId: new Uint16Array([1, 0]),
  companyId: new Uint16Array([1, 0]),
  projectId: new Uint32Array([1, 2]),
  authorId: new Uint32Array([1, 0]),
};

describe("activityEventLabels (ACT-04 hover, zero-fetch)", () => {
  it("months since the 2024-12 floor label correctly across year boundaries", () => {
    expect(monthLabel("2024-12", 0)).toBe("Dec 2024");
    expect(monthLabel("2024-12", 1)).toBe("Jan 2025");
    expect(monthLabel("2024-12", 13)).toBe("Jan 2026");
    expect(monthLabel("2024-12", 19)).toBe("Jul 2026");
  });

  it("resolves all labels from resident ints + dicts + project names", () => {
    const labels = resolveActivityHoverLabels({
      index: 0,
      columns,
      dicts,
      projectNames: { "guid-1": "Torre Norte" },
    });
    expect(labels).toEqual({
      verb: "view-document",
      module: "docs",
      project: "Torre Norte",
      projectGuid: "guid-1",
      month: "Dec 2024",
      author: "ana@hermosillo.com",
      isUnknownAuthor: false,
      role: "Project Engineer",
      company: "Hermosillo",
    });
  });

  it("stays honest on unknown author and unmapped project name", () => {
    const labels = resolveActivityHoverLabels({
      index: 1,
      columns,
      dicts,
      projectNames: undefined, // names not loaded yet → GUID fallback
    });
    expect(labels.isUnknownAuthor).toBe(true);
    expect(labels.author).toBe("Unknown author");
    expect(labels.role).toBe("Unknown");
    expect(labels.company).toBe("Unknown");
    expect(labels.project).toBe("guid-2");
    expect(labels.module).toBe("(none)");
    expect(labels.month).toBe("Jan 2026");
  });
});
