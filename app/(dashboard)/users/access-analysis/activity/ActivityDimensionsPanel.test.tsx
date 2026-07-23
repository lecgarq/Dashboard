// @vitest-environment jsdom
/**
 * ActivityDimensionsPanel.test.tsx — v2.7 Phase 40 (DIM-07) pins.
 *
 * The repopulated sidebar: 7 group-by options (author absent, owner decision
 * 4), 8 color-by options (author present), honest coverage + corpus lines,
 * strength slider fires the shell's coalesced callback. Plus the transform-
 * level pin that a group-by switch changes morph targets (select → layout is
 * pure data flow; the canvas is not involved).
 */
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ActivityDimensionsPanel, GROUP_BY_NONE } from "./ActivityDimensionsPanel";
import { ACTIVITY_DIMENSIONS } from "./activityDimensions";
import { buildGroupLayout } from "./activityGroupLayout";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const groupByOptions = ACTIVITY_DIMENSIONS.filter((d) => d.groupBy).map((d) => ({
  id: d.id,
  label: d.label,
}));
const colorByOptions = ACTIVITY_DIMENSIONS.map((d) => ({ id: d.id, label: d.label }));

const roleOptions = ["Unknown", "Arquitecto", "BIM Manager"];

function renderPanel(over: Partial<Parameters<typeof ActivityDimensionsPanel>[0]> = {}) {
  const onRolesChange = vi.fn();
  const props = {
    groupByOptions,
    colorByOptions,
    groupBy: GROUP_BY_NONE,
    colorBy: "module",
    strength: 0,
    onGroupByChange: vi.fn(),
    onColorByChange: vi.fn(),
    onStrengthChange: vi.fn(),
    authorQuery: "",
    onAuthorQueryChange: vi.fn(),
    authorSuggestions: ["Unknown author", "ana@hermosillo.com", "luis@hermosillo.com"],
    matchedAuthorCount: 0,
    searchPending: false,
    onRolesChange,
    filters: [
      {
        id: "role",
        title: "Filter by role",
        options: roleOptions,
        counts: new Map([
          ["Unknown", 10],
          ["Arquitecto", 200],
          ["BIM Manager", 90],
        ]),
        selected: new Set(roleOptions),
        onChange: onRolesChange,
      },
      {
        id: "verb",
        title: "Filter by activity type",
        options: ["created", "viewed"],
        counts: new Map([
          ["created", 5],
          ["viewed", 7],
        ]),
        selected: new Set(["created", "viewed"]),
        onChange: vi.fn(),
      },
    ],
    groupCoverageText: null as string | null,
    groupByLabel: null as string | null,
    colorCoverageText: "4,904,886/4,904,886",
    colorByLabel: "Module",
    residentCount: 4_904_886,
    renderedCount: 196_196,
    ...over,
  };
  render(<ActivityDimensionsPanel {...props} />);
  return props;
}

describe("ActivityDimensionsPanel", () => {
  it("offers 7 group-by dims (author absent) and 8 color-by dims (author present)", () => {
    renderPanel();
    const groupSelect = screen.getByTestId("activity-group-by-select") as HTMLSelectElement;
    const colorSelect = screen.getByTestId("activity-color-by-select") as HTMLSelectElement;
    const groupIds = Array.from(groupSelect.options).map((o) => o.value);
    const colorIds = Array.from(colorSelect.options).map((o) => o.value);
    expect(groupIds).toHaveLength(8); // "none" + 7 dims
    expect(groupIds[0]).toBe(GROUP_BY_NONE);
    expect(groupIds).not.toContain("author");
    expect(colorIds).toHaveLength(8);
    expect(colorIds).toContain("author");
  });

  it("shows the honest corpus line and per-dim coverage when a dim is active", () => {
    renderPanel({
      groupBy: "verb",
      groupByLabel: "Verb",
      groupCoverageText: "4,630,553/4,904,886",
    });
    expect(screen.getByText(/4,904,886 events · rendering ~196,196/)).toBeTruthy();
    expect(screen.getByTestId("activity-group-coverage").textContent).toContain(
      "Verb data · 4,630,553/4,904,886 events",
    );
    expect(screen.getByTestId("activity-color-coverage").textContent).toContain(
      "Module data · 4,904,886/4,904,886 events",
    );
  });

  it("hides the strength slider at group-by none, shows it for a dim, and fires onStrengthChange", () => {
    const first = renderPanel();
    expect(screen.queryByLabelText("Grouping strength slider")).toBeNull();
    expect(first.onStrengthChange).not.toHaveBeenCalled();
    cleanup();

    const props = renderPanel({ groupBy: "project", groupByLabel: "Project", strength: 40 });
    const slider = screen.getByLabelText("Grouping strength slider");
    fireEvent.keyDown(
      slider.querySelector('[role="slider"]') ?? slider,
      { key: "ArrowRight" },
    );
    expect(props.onStrengthChange).toHaveBeenCalledWith(41);
  });

  it("renders dict-failed dims as disabled options, never a blank sidebar", () => {
    renderPanel({
      groupByOptions: groupByOptions.map((o) =>
        o.id === "role" ? { ...o, disabled: true } : o,
      ),
    });
    const select = screen.getByTestId("activity-group-by-select") as HTMLSelectElement;
    const role = Array.from(select.options).find((o) => o.value === "role");
    expect(role?.disabled).toBe(true);
    expect(role?.text).toContain("unavailable");
  });

  it("toggles a role off through the role filter and supports All/None", () => {
    const props = renderPanel();
    const filter = screen.getByTestId("activity-role-filter");
    // Sorted by event count desc: Arquitecto (200), BIM Manager (90), Unknown (10).
    const rows = Array.from(filter.querySelectorAll('input[type="checkbox"]'));
    expect(rows).toHaveLength(3);

    fireEvent.click(screen.getByText("Arquitecto"));
    expect(props.onRolesChange).toHaveBeenCalledWith(new Set(["Unknown", "BIM Manager"]));

    // Scoped: every filter group renders its own All/None pair.
    fireEvent.click(within(filter).getByRole("button", { name: "None" }));
    expect(props.onRolesChange).toHaveBeenCalledWith(new Set());

    fireEvent.click(within(filter).getByRole("button", { name: "All" }));
    expect(props.onRolesChange).toHaveBeenCalledWith(
      new Set(["Unknown", "Arquitecto", "BIM Manager"]),
    );
  });

  it("suggests matched users on focus and commits an exact email on click", () => {
    const props = renderPanel({ authorQuery: "luis", matchedAuthorCount: 1 });
    const search = screen.getByLabelText("Search users") as HTMLInputElement;
    expect(screen.getByText("1 user matched")).toBeTruthy();

    // Suggestion dropdown is focus-gated (no native datalist).
    fireEvent.focus(search);
    const suggestions = screen.getByTestId("activity-author-suggestions");
    const options = Array.from(suggestions.querySelectorAll('[role="option"]'));
    // The needle "luis" filters out the non-matching "ana@" and sentinel row.
    // Each option now leads with a ProfileAvatar (initials in jsdom), so match
    // the email substring rather than exact textContent.
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("luis@hermosillo.com");

    fireEvent.click(options[0]);
    expect(props.onAuthorQueryChange).toHaveBeenCalledWith("luis@hermosillo.com");

    fireEvent.change(search, { target: { value: "ana@" } });
    expect(props.onAuthorQueryChange).toHaveBeenCalledWith("ana@");
  });
});

describe("group-by switch changes morph targets (transform-level)", () => {
  it("different dim id columns yield different layout targets over the same rest positions", () => {
    const n = 64;
    const rest = new Float32Array(n * 2).map((_, i) => ((i * 37) % 100) - 50);
    const dimA = Uint16Array.from({ length: n }, (_, i) => i % 3);
    const dimB = Uint16Array.from({ length: n }, (_, i) => i % 5);
    const a = buildGroupLayout(rest, dimA, 3);
    const b = buildGroupLayout(rest, dimB, 5);
    let differs = false;
    for (let i = 0; i < a.targets.length; i++) {
      if (Math.abs(a.targets[i] - b.targets[i]) > 1e-3) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });
});
