import { BrandLoading } from "@/components/ui/BrandLoading";

export default function SimAutomationLoading() {
  return (
    <div className="flex items-center justify-center flex-1 h-full">
      <BrandLoading message="Loading sim automation..." />
    </div>
  );
}
