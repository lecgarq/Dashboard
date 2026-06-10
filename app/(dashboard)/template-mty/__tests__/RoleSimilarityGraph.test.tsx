// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleSimilarityGraph } from "../components/RoleSimilarityGraph";

describe("RoleSimilarityGraph", () => {
  it("renders the empty state when there are no roles", () => {
    render(<RoleSimilarityGraph graph={{ nodes: [], edges: [] }} />);
    expect(screen.getByText(/no roles to compare/i)).toBeTruthy();
  });
});
