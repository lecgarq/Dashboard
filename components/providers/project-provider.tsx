"use client";

import React, { createContext, useContext, useMemo } from "react";
import { trpc } from "@/lib/core/trpc";

type ProjectContextType = {
  activeProjectId: string | null;
};

const ProjectContext = createContext<ProjectContextType>({ activeProjectId: null });

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { data: project } = trpc.project.get.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const value = useMemo(
    () => ({ activeProjectId: project?.id ?? null }),
    [project?.id]
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}




