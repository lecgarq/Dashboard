import { BrandLoading } from "@/components/ui/BrandLoading";

export default function TasksLoading() {
  return (
    <div className="flex items-center justify-center flex-1 h-full">
      <BrandLoading message="Loading tasks..." />
    </div>
  );
}
