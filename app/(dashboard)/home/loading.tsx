import { BrandLoading } from "@/components/ui/BrandLoading";

export default function HomeLoading() {
  return (
    <div className="flex items-center justify-center flex-1 h-full">
      <BrandLoading message="Loading mission control..." />
    </div>
  );
}
