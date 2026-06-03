import { GraphLoadingSkeleton } from "@/components/ui/GraphLoadingSkeleton";

// Shown instantly by the App Router while the server component prefetches the
// access snapshot. Replaces the previous blank screen during the (heavy) load.
export default function SpatialGraphLoading(): React.JSX.Element {
  return (
    <div className="h-screen">
      <GraphLoadingSkeleton message="Loading spatial graph…" />
    </div>
  );
}
