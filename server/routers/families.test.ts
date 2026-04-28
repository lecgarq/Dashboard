import { describe, it, expect, vi } from 'vitest';
import { familiesRouter } from './families';

describe('familiesRouter', () => {
  it('should be defined', () => {
    expect(familiesRouter).toBeDefined();
  });

  it('contains expected procedures', () => {
    const procedures = Object.keys(familiesRouter._def.procedures);
    expect(procedures).toContain('getAll');
    expect(procedures).toContain('getById');
    expect(procedures).toContain('movePhase');
  });

  // Example of a mocked call
  it('instantiates caller correctly', async () => {
    const mockCtx = {
      session: { user: { id: 'test-user', role: 'ADMIN' } },
      db: {} as any,
      projectId: 'test-project',
    };

    // We use createCaller which is part of tRPC router definition
    const caller = familiesRouter.createCaller(mockCtx as any);
    expect(caller).toBeDefined();
  });
});
