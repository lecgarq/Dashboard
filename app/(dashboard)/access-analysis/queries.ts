"use client";
import { useQuery } from "@tanstack/react-query";
import { serializeFilters } from "./filterParams";
import type { FilterState, SummaryDTO, Category } from "./types";

export const accessKeys = {
  summary: (f: FilterState) => ["access-analysis", "summary", f] as const,
  trends: (f: FilterState) => ["access-analysis", "trends", f] as const,
  members: (f: FilterState, page: number, size: number) => ["access-analysis", "members", f, page, size] as const,
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export function useSummary(f: FilterState) {
  const qs = encodeURIComponent(serializeFilters(f));
  return useQuery({ queryKey: accessKeys.summary(f), queryFn: () => getJson<SummaryDTO>(`/api/access-analysis/summary?filters=${qs}`) });
}

export interface TrendsDTO { activityPerWeek: Category[]; accessAdded: Category[] }
export function useTrends(f: FilterState) {
  const qs = encodeURIComponent(serializeFilters(f));
  return useQuery({ queryKey: accessKeys.trends(f), queryFn: () => getJson<TrendsDTO>(`/api/access-analysis/trends?filters=${qs}`) });
}

export interface MembersDTO { total: number; page: number; size: number; rows: Record<string, string>[] }
export function useMembers(f: FilterState, page: number, size: number) {
  const qs = encodeURIComponent(serializeFilters(f));
  return useQuery({ queryKey: accessKeys.members(f, page, size), queryFn: () => getJson<MembersDTO>(`/api/access-analysis/members?filters=${qs}&page=${page}&size=${size}`) });
}
