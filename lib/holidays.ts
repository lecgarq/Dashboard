/**
 * Mexican public holidays for 2026.
 * Format: "YYYY-MM-DD"
 * Used to grey out non-working days in calendar views.
 */
const MX_HOLIDAYS_2026: string[] = [
  "2026-01-01", // Año Nuevo
  "2026-02-02", // Conmemoración 5 de febrero (primer lunes de feb)
  "2026-03-16", // Conmemoración 21 de marzo (tercer lunes de mar)
  "2026-05-01", // Día del Trabajo
  "2026-05-05", // Batalla de Puebla
  "2026-09-16", // Independencia
  "2026-11-02", // Día de Muertos
  "2026-11-16", // Conmemoración 20 de noviembre (tercer lunes de nov)
  "2026-12-25", // Navidad
];

/** Quick lookup set */
const holidaySet = new Set(MX_HOLIDAYS_2026);

/** Check if a date is a Mexican holiday */
export function isHoliday(date: Date): boolean {
  const key = date.toISOString().slice(0, 10);
  return holidaySet.has(key);
}


