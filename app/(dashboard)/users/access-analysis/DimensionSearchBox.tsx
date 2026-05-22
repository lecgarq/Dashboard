"use client";

export interface DimensionSearchBoxProps {
  query: string;
  onChange: (q: string) => void;
}

export function DimensionSearchBox({ query, onChange }: DimensionSearchBoxProps): React.JSX.Element {
  return (
    <input
      type="search"
      value={query}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Find a dimension…"
      aria-label="Find a dimension"
      data-testid="dimension-search"
      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none"
    />
  );
}
