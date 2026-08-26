// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VerticalBetSlider } from "./VerticalBetSlider";

describe("VerticalBetSlider", () => {
  afterEach(cleanup);

  it("exposes every legal integer and only reports value changes", () => {
    const onChange = vi.fn();
    render(
      <VerticalBetSlider
        min={14}
        max={200}
        value={68}
        disabled={false}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole("slider", { name: "本街投入到" });
    expect(slider).toHaveAttribute("min", "14");
    expect(slider).toHaveAttribute("max", "200");
    expect(slider).toHaveAttribute("step", "1");
    fireEvent.change(slider, { target: { value: "199" } });
    expect(onChange).toHaveBeenCalledWith(199);
  });

  it("marks only the maximum value as all-in", () => {
    const { rerender } = render(
      <VerticalBetSlider
        min={14}
        max={200}
        value={199}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("data-all-in", "false");
    rerender(
      <VerticalBetSlider
        min={14}
        max={200}
        value={200}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("data-all-in", "true");
  });

  it("disables the native range control while an action is locked", () => {
    render(
      <VerticalBetSlider
        min={14}
        max={200}
        value={68}
        disabled
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("slider")).toBeDisabled();
  });
});
