// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RiskCards } from "../components/RiskCards";

describe("RiskCards", () => {
  it("renders the four risk metrics and fires the right filter on click", () => {
    const onExternal = vi.fn();
    const { getByText } = render(
      <RiskCards
        risk={{ externalMembers: 4252, externalAdmins: 63, projectAdmins: 4626, pending: 65 }}
        onExternal={onExternal} onExternalAdmins={vi.fn()} onAdmins={vi.fn()} onPending={vi.fn()}
      />,
    );
    expect(getByText("4,252")).toBeTruthy();
    expect(getByText("63")).toBeTruthy();
    fireEvent.click(getByText(/External members/i));
    expect(onExternal).toHaveBeenCalled();
  });
});
