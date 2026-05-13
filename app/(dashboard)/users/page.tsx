import { Suspense } from "react";
import { AccessAnalysisPage } from "./access-analysis/AccessAnalysisPage";
import { UsersDirectoryClient } from "./UsersDirectoryClient";

export const metadata = { title: "Users Directory" };

export default function UsersDirectoryPage() {
  const newTabEnabled = process.env.NEXT_PUBLIC_NEW_ACCESS_ANALYSIS === "1";
  if (newTabEnabled) return <AccessAnalysisPage />;

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="loading-spinner" />
      </div>
    }>
      <UsersDirectoryClient />
    </Suspense>
  );
}
