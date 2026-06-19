// app/(dashboard)/template-mty/components/TemplateMembersTable.tsx
// Re-export alias — the old ARIA-div implementation has been retired.
// The shell (TemplateMembersTableShell) now owns search + filter chips + DataTable.
// This alias keeps any stray importer (including the test) compiling without a second source of truth.
export { TemplateMembersTableShell as TemplateMembersTable } from "./TemplateMembersTableShell";
