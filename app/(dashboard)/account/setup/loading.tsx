import { BrandLoading } from "@/components/ui/BrandLoading";

export default function AccountSetupLoading() {
  return (
    <div className="flex items-center justify-center flex-1 h-full">
      <BrandLoading message="Loading account setup..." />
    </div>
  );
}
