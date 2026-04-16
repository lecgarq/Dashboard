import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div className="space-y-1">
          <Skeleton className="h-8 w-[250px]" />
          <Skeleton className="h-4 w-[400px]" />
        </div>
        <div className="flex items-center space-x-2">
          <Skeleton className="h-9 w-[100px]" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    </div>
  );
}
