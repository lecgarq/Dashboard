import { describe, it, expect } from "vitest";
import { buildEffectiveMatrix, toJson, toCsv, type ExportInput } from "./exportProposal";
import type { FormaFolder } from "./inheritance";

const folders: FormaFolder[] = [
  { id: "root", parentId: null, name: "Project Files", fullPath: "/Project Files" },
  { id: "a", parentId: "root", name: "A, B", fullPath: "/Project Files/A, B" }, // comma → CSV quoting
];
const input: ExportInput = {
  templateProjectId: "tpl",
  templateName: "ACC Template MTY",
  roles: [{ id: "architect", label: "Architect", group: "Design" }],
  folders,
  assignments: { architect: { root: "View+Download" } }, // 'a' inherits root
};

describe("exportProposal", () => {
  it("buildEffectiveMatrix resolves inheritance for every role×folder", () => {
    const m = buildEffectiveMatrix(input);
    expect(m.architect.root).toBe("View+Download");
    expect(m.architect.a).toBe("View+Download"); // inherited
  });

  it("toJson includes tierActions and the effective matrix", () => {
    const parsed = JSON.parse(toJson(input));
    expect(parsed.template.name).toBe("ACC Template MTY");
    expect(parsed.matrix.architect.a).toBe("View+Download");
    expect(parsed.tierActions["Full Controller"]).toContain("CONTROL");
  });

  it("toCsv has a header row and quotes fields with commas", () => {
    const csv = toCsv(input);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Folder Path,Architect");
    // folder 'a' path contains a comma → must be quoted
    expect(lines).toContain('"/Project Files/A, B",View+Download');
  });
});
