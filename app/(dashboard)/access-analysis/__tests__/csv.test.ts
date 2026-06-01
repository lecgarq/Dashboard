import { describe, it, expect } from "vitest";
import { toCsv } from "../csv";

describe("toCsv", () => {
  it("emits a header and escapes commas/quotes", () => {
    const csv = toCsv([
      { name: "Ana, Q", email: "a@x.com", project: 'Tower "A"', role: "Admin", access: "Admin", type: "Internal", company: "H", status: "active", addedOn: "2024-01-01" },
    ]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toBe("Name,Email,Project,Role,Access,Type,Company,Status,Added");
    expect(row).toContain('"Ana, Q"');
    expect(row).toContain('"Tower ""A"""');
  });
});
