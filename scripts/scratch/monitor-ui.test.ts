import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const html = readFileSync(join(process.cwd(), 'scripts/scratch/monitor-ui.html'), 'utf8');

describe('monitor UI structure', () => {
  it('renders quota as safe and hard budget rails instead of a battery-only meter', () => {
    expect(html).toContain('id="safe-quota-rail"');
    expect(html).toContain('id="hard-quota-rail"');
    expect(html).toContain('Safe Budget');
    expect(html).toContain('Hard Cap');
  });

  it('renders activity commands as preflightable command rows with metadata slots', () => {
    expect(html.match(/class="command-row/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(html).toContain('data-command="activity"');
    expect(html).toContain('data-command="backward"');
    expect(html).toContain('data-command="bulk"');
    expect(html).toContain('class="command-meta-cost"');
    expect(html).toContain('class="command-meta-plan"');
  });
});
