/**
 * Mexican public holidays — dynamic, supports any year.
 * Fixed-date holidays are straightforward; Monday-shift holidays
 * (Law of 2006: 5 Feb, 21 Mar, 20 Nov) fall on the first/third Monday
 * of their respective months.
 * Format: "YYYY-MM-DD"
 */

function nthMonday(year: number, month: number, n: number): string {
  // month is 1-based. Returns the Nth Monday of that month.
  const date = new Date(year, month - 1, 1);
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon
  const firstMonday = dayOfWeek <= 1 ? 1 + (1 - dayOfWeek) : 1 + (8 - dayOfWeek);
  const day = firstMonday + (n - 1) * 7;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getHolidaysForYear(year: number): string[] {
  return [
    `${year}-01-01`, // Año Nuevo
    nthMonday(year, 2, 1), // Conmemoración 5 de febrero (1er lunes feb)
    nthMonday(year, 3, 3), // Conmemoración 21 de marzo (3er lunes mar)
    `${year}-05-01`, // Día del Trabajo
    `${year}-09-16`, // Independencia
    nthMonday(year, 11, 3), // Conmemoración 20 de noviembre (3er lunes nov)
    `${year}-12-25`, // Navidad
  ];
}

const cache = new Map<number, Set<string>>();

function getHolidaySet(year: number): Set<string> {
  if (!cache.has(year)) {
    cache.set(year, new Set(getHolidaysForYear(year)));
  }
  return cache.get(year)!;
}

/** Check if a date is a Mexican public holiday */
export function isHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const key = date.toISOString().slice(0, 10);
  return getHolidaySet(year).has(key);
}
