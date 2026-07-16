/**
 * whySimilar.ts — pure resolution of python why-similar dimension keys into
 * human chip labels (SIM-02).
 *
 * The pipeline stores the exact top contributing dimension keys per match
 * (from the real hybrid vector). Two key families arrive here:
 *   - token keys carry their value ("company:ACME", "act:High", "mod:build");
 *   - numeric-column keys carry no value ("activityTotal") — the chip renders
 *     the LIVE values from the two NodeFeatureSnapshots (no new fetch).
 *
 * Coverage honesty (v2.4 convention): chips whose source dimension is
 * DC-sourced or folder-crawl-scoped name a coverageDimId; the shell resolves
 * it to coverageText via dimensionCoverage. Permission-derived keys are
 * suppressed when EITHER endpoint has permissionCoverage === "unknown" — an
 * uncrawled node never renders a confident permission explanation.
 * `cov:` tokens and `_missing` columns never render (python excludes them
 * too; this is defense in depth). No React/DOM/IO.
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { moduleLabel } from "@/lib/acc/modules";

export interface WhyChip {
  label: string;
  /** Aperture dim id for the coverage suffix (dimensionCoverage), if any. */
  coverageDimId?: string;
}

/** Dim ids chips can reference — the shell prebuilds coverageText for these. */
export const WHY_COVERAGE_DIM_IDS: readonly string[] = [
  "company",
  "permissionTier",
  "folderAccessPermissions",
  "activityVolume",
  "activityRecency",
  "folderBreadth",
  "accessibleDataTB",
  "membershipTenure",
];

/** Keys whose evidence comes from the folder-permission crawl. */
const PERMISSION_DERIVED = new Set([
  "perm",
  "permstr",
  "permissionStrength",
  "folderBreadth",
  "accessibleDataBytes",
]);

/** Compact byte string. Local on purpose: the existing formatBytes lives in
 * the OTHER access-analysis surface (charts page) — standing collision trap. */
function bytesText(bytes: number | undefined): string {
  const b = bytes ?? 0;
  if (b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const num = (v: number | null | undefined): string =>
  (v ?? 0).toLocaleString("en-US");

/**
 * Resolve one python dimension key to a chip, or null when the key is
 * non-signal (admin:0), meta (cov:, _missing), unknown, or suppressed by the
 * permission-coverage rule.
 */
export function resolveWhyKey(
  key: string,
  center: NodeFeatureSnapshot,
  match: NodeFeatureSnapshot | undefined,
): WhyChip | null {
  if (key.endsWith("_missing")) return null;

  const sep = key.indexOf(":");
  const prefix = sep >= 0 ? key.slice(0, sep) : key;
  const value = sep >= 0 ? key.slice(sep + 1) : "";

  if (
    PERMISSION_DERIVED.has(prefix) &&
    (center.permissionCoverage === "unknown" ||
      (match !== undefined && match.permissionCoverage === "unknown"))
  ) {
    return null;
  }

  switch (prefix) {
    case "role":
      return { label: `Same role: ${value}` };
    case "company":
      return { label: `Same company: ${value}`, coverageDimId: "company" };
    case "perm":
      return { label: `Same permission tier: ${value}`, coverageDimId: "permissionTier" };
    case "permstr":
      return {
        label: `Same permission strength (${value}/5)`,
        coverageDimId: "folderAccessPermissions",
      };
    case "act":
      return { label: `Similar activity: ${value}`, coverageDimId: "activityVolume" };
    case "recency":
      return { label: `Same activity recency: ${value}`, coverageDimId: "activityRecency" };
    case "aff":
      return { label: `Both ${value}` };
    case "status":
      return { label: `Same status: ${value}` };
    case "admin":
      return value === "1" ? { label: "Both project admins" } : null;
    case "mod":
      return { label: `Shared module: ${moduleLabel(value)}` };
    case "cov":
      return null;
    case "activityTotal":
      return {
        label: `Similar activity volume: ${num(center.activityTotal)}/${num(match?.activityTotal)}`,
        coverageDimId: "activityVolume",
      };
    case "folderBreadth":
      return {
        label: `Similar folder breadth: ${num(center.permissionTypeSummary?.folderBreadth)}/${num(match?.permissionTypeSummary?.folderBreadth)} folders`,
        coverageDimId: "folderBreadth",
      };
    case "accessibleDataBytes":
      return {
        label: `Similar data reach: ${bytesText(center.accessibleDataBytes)}/${bytesText(match?.accessibleDataBytes)}`,
        coverageDimId: "accessibleDataTB",
      };
    case "membershipAgeDays":
      return {
        label: `Similar tenure: ${num(center.membershipAgeDays)}/${num(match?.membershipAgeDays)} days`,
        coverageDimId: "membershipTenure",
      };
    case "permissionStrength":
      return {
        label: `Similar permission strength: ${num(center.permissionStrength)}/${num(match?.permissionStrength)}`,
        coverageDimId: "folderAccessPermissions",
      };
    case "riskScore":
      return { label: `Similar risk score: ${num(center.riskScore)}/${num(match?.riskScore)}` };
    default:
      return null;
  }
}
