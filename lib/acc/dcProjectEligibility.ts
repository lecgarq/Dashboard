import mtyAllowlist from './mty-allowlist.json';

const mtySet = new Set<string>(mtyAllowlist);

const LOW_VALUE_TERMS = [
  'demo',
  'template',
  'pre template',
  'test',
  'prueba',
  'pruebas',
  'sharespace',
  'share space',
  'training',
  'capacitacion',
  'sandbox',
  'sample',
  'takeoff',
  'vdc',
] as const;

export function normalizeProjectNameForExtractionFilter(
  name: string | null | undefined,
): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isLowValueExtractionProjectName(
  name: string | null | undefined,
): boolean {
  const normalized = normalizeProjectNameForExtractionFilter(name);
  if (!normalized) return false;
  return LOW_VALUE_TERMS.some((term) => {
    const normalizedTerm = normalizeProjectNameForExtractionFilter(term);
    return new RegExp(`(^| )${normalizedTerm}( |$)`).test(normalized);
  });
}

export function isDcBackfillEligibleProject(
  projectId: string,
  projectName: string | null | undefined,
): boolean {
  return mtySet.has(projectId) && !isLowValueExtractionProjectName(projectName);
}
