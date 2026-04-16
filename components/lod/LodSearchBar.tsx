"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, X } from "lucide-react";

interface LodSearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export function LodSearchBar({ onSearch, isLoading }: LodSearchBarProps) {
  const [value, setValue] = useState("");

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  }, [value, onSearch]);

  const clear = useCallback(() => {
    setValue("");
    onSearch("");
  }, [onSearch]);

  return (
    <div className="flex gap-2 items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Search families by name, category, or description..."
          className="pl-9 pr-8"
        />
        {value && (
          <button
            onClick={clear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Button onClick={submit} disabled={!value.trim() || isLoading} size="sm">
        {isLoading ? (
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Searching…
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            AI Search
          </span>
        )}
      </Button>
    </div>
  );
}
