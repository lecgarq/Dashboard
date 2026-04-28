import { vi } from 'vitest';

process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
process.env.NODE_ENV = "test";

// Mock server-only to prevent it from throwing in tests
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ NextResponse: {} }));
vi.mock('next-auth', () => ({
  default: () => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));
vi.mock('next-auth/next', () => ({
  default: vi.fn(),
}));
