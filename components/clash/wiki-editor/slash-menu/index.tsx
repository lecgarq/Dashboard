"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Editor } from "@tiptap/react";

import { cn } from "@/lib/core/utils";

export interface SlashMenuItem {
  title: string;
  description?: string;
  searchAliases?: string[];
  icon?: React.ReactNode;
  group?: string;
  onSelect: (context: { editor: Editor }) => void;
}

export interface SlashDropdownMenuProps {
  editor: Editor;
  items?: SlashMenuItem[];
}

interface SlashMenuState {
  query: string;
  range: {
    from: number;
    to: number;
  };
  position: {
    top: number;
    left: number;
  };
}

const MENU_WIDTH = 320;
const MENU_OFFSET = 8;
const VIEWPORT_MARGIN = 12;
const SLASH_TRIGGER = /(?:^|\s)\/([^\s/]*)$/;

function clampMenuPosition(left: number, top: number) {
  if (typeof window === "undefined") {
    return { left, top };
  }

  return {
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)
    ),
    top: Math.max(
      VIEWPORT_MARGIN,
      Math.min(top, window.innerHeight - 240 - VIEWPORT_MARGIN)
    ),
  };
}

function getSlashMenuState(editor: Editor): SlashMenuState | null {
  try {
    if (!editor.isEditable || !editor.isFocused) {
      return null;
    }

    const { selection } = editor.state;
    if (!selection.empty) {
      return null;
    }

    const { $from, from } = selection;
    const parent = $from.parent;

    if (!parent.isTextblock) {
      return null;
    }

    const textBefore = parent.textBetween(0, $from.parentOffset, "\0", "\0");
    const match = textBefore.match(SLASH_TRIGGER);
    if (!match) {
      return null;
    }

    const slashQuery = match[1] ?? "";
    const slashFrom = from - slashQuery.length - 1;
    const coords = editor.view.coordsAtPos(from);
    const position = clampMenuPosition(coords.left, coords.bottom + MENU_OFFSET);

    return {
      query: slashQuery,
      range: {
        from: slashFrom,
        to: from,
      },
      position,
    };
  } catch {
    return null;
  }
}

function scoreItem(item: SlashMenuItem, query: string) {
  if (!query) {
    return 0;
  }

  const normalized = query.toLowerCase();
  const title = item.title.toLowerCase();
  const description = item.description?.toLowerCase() ?? "";
  const group = item.group?.toLowerCase() ?? "";
  const aliases = item.searchAliases?.map((alias) => alias.toLowerCase()) ?? [];
  const haystack = [title, description, group, ...aliases].join(" ");

  if (title.startsWith(normalized)) {
    return 0;
  }

  if (aliases.some((alias) => alias.startsWith(normalized))) {
    return 1;
  }

  if (group.startsWith(normalized)) {
    return 2;
  }

  if (haystack.includes(normalized)) {
    return 3;
  }

  return Number.POSITIVE_INFINITY;
}

export function SlashDropdownMenu({
  editor,
  items = [],
}: SlashDropdownMenuProps) {
  const [menuState, setMenuState] = useState<SlashMenuState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const refreshMenu = useCallback(() => {
    setMenuState(getSlashMenuState(editor));
  }, [editor]);

  useEffect(() => {
    refreshMenu();

    const handleBlur = () => {
      setMenuState(null);
    };

    editor.on("transaction", refreshMenu);
    editor.on("focus", refreshMenu);
    editor.on("blur", handleBlur);

    return () => {
      editor.off("transaction", refreshMenu);
      editor.off("focus", refreshMenu);
      editor.off("blur", handleBlur);
    };
  }, [editor, refreshMenu]);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handleViewportChange = () => {
      refreshMenu();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [menuState, refreshMenu]);

  const filteredItems = useMemo(() => {
    if (!menuState) {
      return [];
    }

    return items
      .map((item, index) => ({
        item,
        index,
        score: scoreItem(item, menuState.query.trim()),
      }))
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map((candidate) => candidate.item);
  }, [items, menuState]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [menuState?.query]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex((current) =>
      Math.max(0, Math.min(current, filteredItems.length - 1))
    );
  }, [filteredItems.length]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const closeMenu = useCallback(() => {
    setMenuState(null);
  }, []);

  const executeItem = useCallback(
    (item: SlashMenuItem) => {
      if (!menuState) {
        return;
      }

      editor.chain().focus().deleteRange(menuState.range).run();
      item.onSelect({ editor });
      setMenuState(null);
      setSelectedIndex(0);
    },
    [editor, menuState]
  );

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) =>
          filteredItems.length === 0 ? 0 : (current + 1) % filteredItems.length
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) =>
          filteredItems.length === 0
            ? 0
            : (current - 1 + filteredItems.length) % filteredItems.length
        );
        return;
      }

      if (event.key === "Enter") {
        if (filteredItems[selectedIndex]) {
          event.preventDefault();
          executeItem(filteredItems[selectedIndex]);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        menuRef.current?.contains(target) ||
        editor.view.dom.contains(target)
      ) {
        return;
      }

      closeMenu();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [closeMenu, editor.view.dom, executeItem, filteredItems, menuState, selectedIndex]);

  if (!menuState) {
    return null;
  }

  let linearIndex = -1;
  let previousGroup: string | undefined;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-80 overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur"
      style={{
        left: `${menuState.position.left}px`,
        top: `${menuState.position.top}px`,
      }}
    >
      <div className="border-b border-border/60 px-3 py-2">
        <p className="text-xs font-medium text-foreground">Insert block</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {menuState.query
            ? `Results for "${menuState.query}"`
            : "Type to search blocks and embeds"}
        </p>
      </div>

      <div className="max-h-80 overflow-y-auto p-1.5">
        {filteredItems.length === 0 ? (
          <div className="rounded-lg px-3 py-8 text-center text-sm text-muted-foreground">
            No matching blocks
          </div>
        ) : (
          filteredItems.map((item) => {
            linearIndex += 1;
            const currentIndex = linearIndex;
            const showGroupHeader = previousGroup !== item.group;
            previousGroup = item.group;

            return (
              <React.Fragment key={`${item.group}-${item.title}`}>
                {showGroupHeader ? (
                  <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {item.group ?? "Commands"}
                  </div>
                ) : null}

                <button
                  ref={(node) => {
                    itemRefs.current[currentIndex] = node;
                  }}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selectedIndex === currentIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/70"
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    executeItem(item);
                  }}
                  onMouseEnter={() => setSelectedIndex(currentIndex)}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                    {item.icon ?? "+"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {item.title}
                    </span>
                    {item.description ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}

export default SlashDropdownMenu;
