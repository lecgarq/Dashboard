import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { SessionProvider } from "next-auth/react";
import { DualAuthGuard } from "@/components/auth/DualAuthGuard";
import { CredentialsBanner } from "@/components/auth/CredentialsBanner";
import { DashboardAuthProvider } from "@/components/providers/dashboard-auth-provider";
import { ProjectProvider } from "@/components/providers/project-provider";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { HydrationBoundary } from "@tanstack/react-query";
import { appRouter } from "@/server/routers/root";
import { createTRPCContext } from "@/server/trpc";
import superjson from "superjson";
import { ParticleZoneProvider } from "@/lib/particle-zones";
import ParticleBackground from "@/components/ui/ParticleBackground";
import { PageTransition } from "@/components/ui/PageTransition";
import { NavigationProvider } from "@/components/providers/navigation-provider";
import { ChatPanelWrapper } from "@/components/dashboard/ChatPanelWrapper";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx: await createTRPCContext(),
    transformer: superjson,
  });

  await Promise.allSettled([
    helpers.families.getAll.prefetch(),
    helpers.clash.getWikiSections.prefetch(),
    helpers.sim.getWikiSections.prefetch(),
    helpers.exam.getExams.prefetch(),
    helpers.kpi.getHomeDashboard.prefetch(),
    helpers.tasks.getMyTasks.prefetch(),
    helpers.trello.getBoards.prefetch(),
  ]);

  return (
    <SessionProvider session={session}>
      <DashboardAuthProvider>
        <ProjectProvider>
          <HydrationBoundary state={helpers.dehydrate()}>
            <ParticleZoneProvider>
              <div className="relative min-h-screen overflow-hidden">
                <ParticleBackground />
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -left-28 top-20 h-80 w-80 rounded-full bg-sky-200/30 blur-3xl" />
                  <div className="absolute right-[-6rem] top-[-3rem] h-96 w-96 rounded-full bg-amber-200/35 blur-3xl" />
                  <div className="absolute bottom-[-6rem] right-[18%] h-80 w-80 rounded-full bg-teal-200/25 blur-3xl" />
                </div>
              </div>
              <div className="relative z-10 flex h-screen overflow-hidden">
                <Sidebar />
                <main className="relative flex flex-1 flex-col overflow-y-auto">
                  <CredentialsBanner />
                  <NavigationProvider>
                    <PageTransition>
                      <DualAuthGuard>{children}</DualAuthGuard>
                    </PageTransition>
                  </NavigationProvider>
                </main>
                <ChatPanelWrapper />
              </div>
            </ParticleZoneProvider>
          </HydrationBoundary>
        </ProjectProvider>
      </DashboardAuthProvider>
    </SessionProvider>
  );
}
