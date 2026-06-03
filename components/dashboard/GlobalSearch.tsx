"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, X, Building2, ListTodo, Zap, FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
import { useDebounce } from "@/hooks/use-debounce";

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const router = useRouter();

  const { data, isLoading } = trpc.search.query.useQuery(
    { term: debouncedQuery },
    {
      enabled: debouncedQuery.length >= 2,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    }
  );

  const hasNoResults = useMemo(() => {
    if (!data) return false;
    return Object.values(data).every((arr: unknown) => Array.isArray(arr) && arr.length === 0);
  }, [data]);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [toggle]);

  const onSelect = (type: string, id: string) => {
    setIsOpen(false);
    setQuery("");
    if (type === 'family') router.push(`/families?id=${id}`);
    if (type === 'task') router.push(`/tasks?id=${id}`);
    if (type === 'clash') router.push(`/clash-detection?id=${id}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn" 
        onClick={() => setIsOpen(false)}
      />

      {/* Search Modal */}
      <div className="relative w-full max-w-2xl bg-popover border border-border backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden animate-slideUp">
        <div className="flex items-center px-4 py-4 border-b border-border/50">
          {isLoading ? (
            <Loader2 size={20} className="text-primary animate-spin ml-2" />
          ) : (
            <Search size={20} className="text-muted-foreground ml-2" />
          )}
          <input
            autoFocus
            aria-label="Search"
            className="flex-1 bg-transparent border-none outline-none px-4 text-base text-foreground placeholder:text-muted-foreground/50"
            placeholder="Search families, tasks, clash... (Ctrl+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close search"
            className="p-1.5 hover:bg-white/5 rounded-lg text-muted-foreground transition-smooth"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar">
          {!debouncedQuery || debouncedQuery.length < 2 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm text-foreground font-medium">Quick Find</p>
              <p className="text-xs text-muted-foreground">Type at least 2 characters to search across all modules</p>
            </div>
          ) : hasNoResults ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="text-sm">No results found for "{query}"</p>
            </div>
          ) : (
            <div className="space-y-4 p-2">
              {data?.families && data.families.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2 text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mb-2">Families</p>
                  {data.families.map((item) => (
                    <button 
                      key={item.id}
                      onClick={() => onSelect('family', item.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary/10 transition-smooth group text-left"
                    >
                      <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-smooth">
                        <Building2 size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{item.category}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {data?.tasks && data.tasks.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2 text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mb-2">My Tasks</p>
                  {data.tasks.map((item) => (
                    <button 
                      key={item.id}
                      onClick={() => onSelect('task', item.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-chart-1/10 transition-smooth group text-left"
                    >
                      <div className="p-2 rounded-lg bg-chart-1/10 text-chart-1 group-hover:bg-chart-1 group-hover:text-white transition-smooth">
                        <ListTodo size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">Status: {item.status}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {data?.clashTasks && data.clashTasks.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2 text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mb-2">Clash Detection</p>
                  {data.clashTasks.map((item) => (
                    <button 
                      key={item.id}
                      onClick={() => onSelect('clash', item.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-chart-2/10 transition-smooth group text-left"
                    >
                      <div className="p-2 rounded-lg bg-chart-2/10 text-chart-2 group-hover:bg-chart-2 group-hover:text-white transition-smooth">
                        <Zap size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">Status: {item.status}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-white/5 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 grayscale opacity-50">
              <kbd className="px-1.5 py-0.5 rounded border border-white/20 bg-white/5 text-[10px] font-mono">↑↓</kbd>
              <span className="text-[10px] text-muted-foreground uppercase font-medium">Navigate</span>
            </div>
            <div className="flex items-center gap-1.5 grayscale opacity-50">
              <kbd className="px-1.5 py-0.5 rounded border border-white/20 bg-white/5 text-[10px] font-mono">Enter</kbd>
              <span className="text-[10px] text-muted-foreground uppercase font-medium">Select</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/30 font-medium tracking-tighter uppercase">BIM OS Global Search</p>
        </div>
      </div>
    </div>
  );
}
