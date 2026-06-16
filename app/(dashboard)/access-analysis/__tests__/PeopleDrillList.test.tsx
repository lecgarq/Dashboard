// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { PeopleDrillList } from "../components/PeopleDrillList";

const people = [
  { email: "ana@x.com", name: "Ana", count: 70 },
  { email: "al@x.com", name: "Al", count: 30 },
];

describe("PeopleDrillList", () => {
  it("renders the header, ranked rows, and the unit noun", () => {
    const { getByTestId } = render(
      <PeopleDrillList testId="role-drilldown" title="Hermosillo" color="#6366f1" people={people} total={100} unitNoun="members" onClose={() => {}} />,
    );
    const panel = getByTestId("role-drilldown");
    expect(panel.textContent).toContain("Hermosillo");
    expect(panel.textContent).toContain("2 people");
    expect(panel.textContent).toContain("100 members");
    expect(panel.textContent).toContain("Ana");
    expect(panel.textContent).toContain("Al");
    expect(panel.textContent).toContain("70");
  });

  it("fires onUserClick with the person's email when a row is clicked", () => {
    const onUserClick = vi.fn();
    const { getByTestId } = render(
      <PeopleDrillList testId="role-drilldown" title="Hermosillo" color="#6366f1" people={people} total={100} unitNoun="members" onUserClick={onUserClick} onClose={() => {}} />,
    );
    fireEvent.click(within(getByTestId("role-drilldown")).getByRole("button", { name: /Ana/ }));
    expect(onUserClick).toHaveBeenCalledWith("ana@x.com");
  });

  it("does not make rows clickable when onUserClick is absent", () => {
    const { getByTestId } = render(
      <PeopleDrillList testId="role-drilldown" title="Hermosillo" color="#6366f1" people={people} total={100} unitNoun="members" onClose={() => {}} />,
    );
    const row = within(getByTestId("role-drilldown")).getByRole("button", { name: /Ana/ }) as HTMLButtonElement;
    expect(row.disabled).toBe(true);
  });

  it("fires onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <PeopleDrillList testId="role-drilldown" title="Hermosillo" color="#6366f1" people={people} total={100} unitNoun="members" onClose={onClose} />,
    );
    fireEvent.click(getByLabelText(/close breakdown/i));
    expect(onClose).toHaveBeenCalled();
  });

  it("uses singular 'person' for a single contributor", () => {
    const { getByTestId } = render(
      <PeopleDrillList testId="x" title="Solo" color="#000" people={[people[0]]} total={70} unitNoun="activities" onClose={() => {}} />,
    );
    expect(getByTestId("x").textContent).toContain("1 person");
  });
});
