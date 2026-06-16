// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProfileAvatar } from "./ProfileAvatar";

describe("ProfileAvatar", () => {
  // Note: radix Avatar does not "load" images in jsdom, so the fallback initials
  // always render here. The real <img> is verified visually at rebuild time.
  it("renders initials fallback from the name", () => {
    render(<ProfileAvatar name="Ada Lovelace" email="ada@x.com" photoUrl={null} />);
    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("falls back to email-derived initials when no name", () => {
    render(<ProfileAvatar name={null} email="john.doe@x.com" photoUrl={null} />);
    expect(screen.getByText("JD")).toBeTruthy();
  });
});
