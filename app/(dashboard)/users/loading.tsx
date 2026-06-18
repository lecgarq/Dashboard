import { UsersTableSkeleton } from "./UsersTableSkeleton";

/**
 * Route-level skeleton rendered by Next.js Suspense while the /users page loads.
 *
 * Swapped from the previous card-grid skeleton to a table-shaped skeleton so
 * the ~200ms Suspense fallback matches the real DataTable layout (PERF-01).
 */
export default function UsersLoading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-[1600px] p-6 space-y-4">
      <UsersTableSkeleton />
    </div>
  );
}
