import { Suspense } from "react";
import { UsersDirectoryClient } from "./UsersDirectoryClient";

export const metadata = { title: "Users Directory" };

export default function UsersDirectoryPage() {
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
