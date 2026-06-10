import { describe, expect, it } from 'vitest';
import {
  isLowValueExtractionProjectName,
  normalizeProjectNameForExtractionFilter,
} from './dcProjectEligibility';

describe('dcProjectEligibility', () => {
  it('normalizes accents, punctuation, and casing for extraction filtering', () => {
    expect(
      normalizeProjectNameForExtractionFilter('  VDC / MONTERREY (PRUEBA-01)  '),
    ).toBe('vdc monterrey prueba 01');
    expect(
      normalizeProjectNameForExtractionFilter('Capacitación - PRE-TEMPLATE'),
    ).toBe('capacitacion pre template');
  });

  it.each([
    'ACC MTY DEMO',
    'ACC Template Ejecucion MTY',
    'ACC TEMPLATE MTY PRUEBA',
    'MTY BIM Sharespace',
    'MTY CDP DEMO ACC',
    'MTY Template Demo Project',
    'Template Rvt Mty',
    'PRE-TEMPLATE MTY EJEC',
    'VDC / MONTERREY (PRUEBA-01)',
    'MTY Introduccion Takeoff',
    'ACC VDC Training',
    'Sandbox Modelo',
    'Sample Project',
  ])('marks "%s" as low-value for extraction', (name) => {
    expect(isLowValueExtractionProjectName(name)).toBe(true);
  });

  it.each([
    'MTY Caterpillar Azteca - OMTY083',
    'MTY Flex-N-Gate Plasticos PROM',
    'CDMX Prologis Park Apodaca East Building 16 OMTY081',
    'MXL American Industries CMCO - OMTY072',
  ])('keeps legitimate project "%s" eligible by name', (name) => {
    expect(isLowValueExtractionProjectName(name)).toBe(false);
  });
});
