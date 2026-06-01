"use client";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";

export interface Option { value: string; label: string }

export function MultiSelectCombobox({
  label, placeholder, options, selected, onToggle,
}: {
  label: string; placeholder: string; options: Option[]; selected: string[]; onToggle: (value: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;
  return (
    <Popover.Root>
      <Popover.Trigger className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-600">
        {label}{selected.length ? <span className="ml-1 rounded bg-zinc-800 px-1.5 text-xs">{selected.length}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} className="z-50 w-64 rounded-xl border border-zinc-800 bg-zinc-950 p-2 shadow-xl">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
            className="mb-2 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none" />
          <div className="max-h-64 overflow-auto">
            {filtered.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-900">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
            {filtered.length === 0 ? <div className="px-2 py-1 text-sm text-zinc-500">No matches</div> : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
