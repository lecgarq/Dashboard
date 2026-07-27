import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const usersDir = join(process.cwd(), "app", "(dashboard)", "users");

function source(fileName: string): string {
  return readFileSync(join(usersDir, fileName), "utf8");
}

describe("stat card module boundaries", () => {
  it("keeps shared stat-card types out of the ACC profile container", () => {
    expect(source("StatCardDetail.tsx")).not.toContain("./AccProfileSection");
    expect(source("statCardDetails.ts")).not.toContain("./AccProfileSection");
  });
});
