/**
 * Office grouping for the shared project picker. Hermosillo runs projects out of
 * several city offices (Monterrey, CDMX, Mexicali, Tijuana, …) and the office is
 * encoded as the leading code token of the project name ("MTY …", "MXL …"). A few
 * MTY-office projects have client-branded names with no "MTY" token, so the
 * curated `mty-allowlist.json` is an authoritative override.
 *
 * Pure + framework-free so it can drive the picker's grouped list and be unit
 * tested. The picker groups options by office, each group getting its own
 * select-all / clear control.
 */
import type { ProjectOption } from "./projectFilter";

/** Sentinel office code for projects with no recognizable office token. */
export const OTHER_CODE = "OTHER";

export interface OfficeGroup {
  code: string; // "MTY" | "CDMX" | … | "OTHER"
  label: string; // friendly label ("Monterrey", "Other", …)
  options: ProjectOption[]; // members, sorted by name
}

/** Known city offices with friendly labels, in the order they should appear. */
const CITY_OFFICES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "MTY", label: "Monterrey" },
  { code: "CDMX", label: "Ciudad de México" },
  { code: "MXL", label: "Mexicali" },
  { code: "TIJ", label: "Tijuana" },
  { code: "HMO", label: "Hermosillo" },
  { code: "GDL", label: "Guadalajara" },
  { code: "QRO", label: "Querétaro" },
];
const CITY_LABEL = new Map(CITY_OFFICES.map((o) => [o.code, o.label]));
const CITY_ORDER = new Map(CITY_OFFICES.map((o, i) => [o.code, i]));

/** Leading token of a name, split on whitespace / dash / underscore / slash. */
function firstToken(name: string): string {
  return (name ?? "").trim().split(/[\s_\-–—/]+/)[0] ?? "";
}

/**
 * Office code for one project. The MTY allowlist wins (some MTY projects carry
 * client-branded names). Otherwise the leading token decides: a known city code,
 * any other 2–5 letter all-caps code (FWD, VDC, DIS, AF, …), or OTHER.
 */
export function officeCodeFor(option: ProjectOption, mtyIds?: ReadonlySet<string>): string {
  if (mtyIds?.has(option.id)) return "MTY";
  const tok = firstToken(option.name);
  const upper = tok.toUpperCase();
  if (CITY_LABEL.has(upper)) return upper;
  if (/^[A-Z]{2,5}$/.test(tok)) return upper; // all-caps short code (case-sensitive: real office codes are upper)
  return OTHER_CODE;
}

/** Friendly label for an office code (city name, raw code, or "Other"). */
export function officeLabel(code: string): string {
  if (code === OTHER_CODE) return "Other";
  return CITY_LABEL.get(code) ?? code;
}

/**
 * Bucket options into office groups, sorted: known cities first (curated order),
 * then other code groups by size (desc) then label, with "Other" always last.
 * Members within a group are sorted by name.
 */
export function groupProjectOptions(
  options: ReadonlyArray<ProjectOption>,
  mtyIds?: ReadonlySet<string>,
): OfficeGroup[] {
  const byCode = new Map<string, ProjectOption[]>();
  for (const o of options) {
    const code = officeCodeFor(o, mtyIds);
    const arr = byCode.get(code);
    if (arr) arr.push(o);
    else byCode.set(code, [o]);
  }

  const tier = (code: string) => (code === OTHER_CODE ? 3 : CITY_ORDER.has(code) ? 0 : 1);

  return [...byCode.entries()]
    .map(([code, opts]) => ({
      code,
      label: officeLabel(code),
      options: [...opts].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const ta = tier(a.code);
      const tb = tier(b.code);
      if (ta !== tb) return ta - tb;
      if (ta === 0) return (CITY_ORDER.get(a.code) ?? 0) - (CITY_ORDER.get(b.code) ?? 0);
      if (ta === 1) return b.options.length - a.options.length || a.label.localeCompare(b.label);
      return 0;
    });
}
