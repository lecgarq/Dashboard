import { create } from "zustand";
import { EMPTY_FILTERS, type FilterState, type ModuleId } from "./types";

type MultiKey = "projectId" | "company" | "role" | "module";
type SingleKey = "internalExternal" | "adminMember";

interface Store {
  filters: FilterState;
  toggle: (key: MultiKey, value: string) => void;
  setSingle: (key: SingleKey, value: FilterState[SingleKey]) => void;
  setSearch: (value: string) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  clearAll: () => void;
  activeCount: () => number;
}

export const useAccessFilters = create<Store>((set, get) => ({
  filters: { ...EMPTY_FILTERS },
  toggle: (key, value) =>
    set((s) => {
      const arr = s.filters[key] as string[];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { filters: { ...s.filters, [key]: next as ModuleId[] | string[] } };
    }),
  setSingle: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: s.filters[key] === value ? null : value } })),
  setSearch: (value) => set((s) => ({ filters: { ...s.filters, search: value } })),
  setDateRange: (from, to) => set((s) => ({ filters: { ...s.filters, dateFrom: from, dateTo: to } })),
  clearAll: () => set({ filters: { ...EMPTY_FILTERS } }),
  activeCount: () => {
    const f = get().filters;
    return (
      f.projectId.length + f.company.length + f.role.length + f.module.length +
      (f.internalExternal ? 1 : 0) + (f.adminMember ? 1 : 0) +
      (f.dateFrom || f.dateTo ? 1 : 0) + (f.search.trim() ? 1 : 0)
    );
  },
}));
