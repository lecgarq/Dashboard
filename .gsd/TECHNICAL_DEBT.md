# Technical Debt Audit — LECG Dashboard

> Auto-generated entirely via active codebase execution (`npm outdated`, `knip`, and structural grepping) on 2026-04-16

## 1. Dead Code / Unused Files (Knip AST Analysis)

The codebase has some orphaned files left over from previous sprints. These impact bundle overhead and search clutter:

- `hooks/use-chat-pulse.ts` (Abandoned during Mail/Chat refactors)
- `scratch/reorg.js` (Script leftover from library re-organization)
- `components/dashboard/GlobalSearch.tsx` (Stale/Unused component)
- `components/dashboard/calendar/DayView.tsx` (Calendar UI abandoned or deferred)
- `components/dashboard/calendar/WeekView.tsx` (Calendar UI abandoned or deferred)

*Recommended Action:* Delete these files.

## 2. Unlisted/Ghost Dependencies

Code imports packages that are NOT in `package.json` dependencies (they are either transitive or missing):

- `@tiptap/core` (used in `components/clash/WikiEditor.tsx`)
- `@radix-ui/react-visually-hidden` (used in `app/(dashboard)/users/UsersDirectoryClient.tsx`)

*Recommended Action:* Run `npm i @tiptap/core @radix-ui/react-visually-hidden`.

## 3. Outdated Packages (npm package graph)

Several critical libraries are out of date compared to the `latest` registry tag:

- `next` / `eslint-config-next`: Currently 15.5.12, **Next 16.2.4** is available.
- `prisma`: Currently 5.22.0, **7.7.0** is available. (Major upgrade requires schema/runtime audit)
- `next-auth`: Currently `5.0.0-beta.30`, **beta.31** and final releases exist.
- `lucide-react`: Currently 0.575.0, **1.8.0** is available.

*Recommended Action:* Schedule a dedicated dependabot sprint. The `prisma` upgrade to v7 is particularly high-risk.

## 4. Code Smells & "TODO" Markers

- **Zero "TODO" or "FIXME" codebase markers!** A deep recursive RegEx search over `/app`, `/lib`, `/server`, and `/components` returned strictly 0 technical debt comments. All "TODO" strings found were typescript string literal union types for task boards (`"TODO" | "IN_PROGRESS"`).

## 5. Architectural Debt (From Domain Files)

- **Redis/In-Memory Cache:** Search results are currently cached in a Postgres table (`LodSearchCache`). Introducing Redis would strip 50ms of latency penalty.
- **VRAM & GPU Affinity:** The Python `lod-engine` inference (`SiglipModel`) does not currently enforce FP16 mixed precision or TensorRT execution, leaving silicon utilization unoptimized.
- **Binary Streaming:** The LOD Graph returns 24k nodes over HTTP JSON. Integrating Protobuf or FlatBuffers would drastically reduce deserialization CPU overhead.
- **Push Notifications:** The Mail panel polling should be upgraded to Google Pub/Sub webhooks for instant arrival alerts.
