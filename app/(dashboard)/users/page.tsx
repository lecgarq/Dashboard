import { Suspense } from "react";
import { HydrationBoundary } from "@tanstack/react-query";
import { createAccRouteHelpers, prefetchUsersRouteAccData } from "@/lib/server/acc-route-hydration";
import { UsersDirectoryClient } from "./UsersDirectoryClient";

export const metadata = { title: "Users Directory" };

export default async function UsersDirectoryPage() {
  const helpers = await createAccRouteHelpers();
  await prefetchUsersRouteAccData(helpers);

  return (
    <HydrationBoundary state={helpers.dehydrate()}>
      <Suspense fallback={
        <div className="flex items-center justify-center h-64">
          <div className="loading-spinner" />
        </div>
      }>
        <UsersDirectoryClient />
      </Suspense>
    </HydrationBoundary>
  );
}
