# Project State

## Last Session Summary

Codebase mapping complete (Super Phase - 2026-04-15).

- **Core Architecture**: Next.js 15, tRPC, React 19, Prisma (PostgreSQL).
- **Integration Mapping**: Successfully mapped APS, Google (Calendar, Chat, Directory, Drive, Forms), Trello, and OpenAI services.
- **Collaborative Systems**: Documented Yjs + Tiptap real-time sync infrastructure and Yjs binary persistence patterns.
- **Technical Debt**: Identified redundancy in SIM/Clash modules and recommended tRPC error handling standardization.
- **Dev Stack**: All orchestration logic in `scripts/run_dev_stack.py` fully documented in `STACK.md`.

## Current Session Summary

- **Super Codebase Mapping (Deep Audit)**: Conducted a high-fidelity audit of the application's security and synchronization engines.
- **Security Audit**: Documented the `middleware.ts` origin-rewriting logic and module-level access control claims.
- **Persistence Mapping**: Traced the Yjs binary state lifecycle from the independent WebSocket server to direct Prisma database updates.
- **Ecosystem Expansion**: Mapped the LOD Checker service interaction, infrastructure matrix (ports/services), and dev-ops orchestration logic.
