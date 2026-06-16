/**
 * Pure ranking for the "No activity" footer under each activity donut. An entity
 * (company or role) is dormant when it has members in the current selection but
 * contributed ZERO activity there — "people assigned, nothing happening". Ranked
 * by headcount so the biggest gaps surface first. Picker scope is the caller's
 * concern: pass the in-scope membership map + the in-scope set of active labels.
 * No React/DOM/IO.
 */
import type { DrillPerson } from "./roleCounts";

/** One entity with members but no activity in scope. */
export interface DormantEntity {
  label: string;
  /** Distinct members assigned (drives the ranking + bar length). */
  userCount: number;
  /** The members behind it, for the drill-through (each carries its seat count). */
  people: DrillPerson[];
}

export function rankDormantByPeople(
  /** Entity label -> its members. From summarizeCompanies/summarizeRoles (in scope). */
  membersByLabel: ReadonlyMap<string, ReadonlyArray<DrillPerson>>,
  /** Labels that had >= 1 attributed activity in scope — never dormant. */
  activeLabels: ReadonlySet<string>,
  /** Non-entity buckets to drop (UNKNOWN_COMPANY / UNKNOWN_ROLE + MULTIPLE_ROLES). */
  excluded: ReadonlySet<string>,
): DormantEntity[] {
  const out: DormantEntity[] = [];
  for (const [label, people] of membersByLabel) {
    if (activeLabels.has(label) || excluded.has(label)) continue;
    out.push({ label, userCount: people.length, people: [...people] });
  }
  return out.sort((a, b) => b.userCount - a.userCount || a.label.localeCompare(b.label));
}
