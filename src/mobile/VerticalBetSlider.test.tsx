// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VerticalBetSlider } from "./VerticalBetSlider";

describe("VerticalBetSlider", () => {
  afterEach(cleanup);

  it("maps native indices onto legal amounts and skips the raise gap", () => {
    const onChange = vi.fn();
    const choices = [10, 16, 17, 18, 19, 20];
    render(
      <VerticalBetSlider
        choices={choices}
        value={16}
        disabled={false}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole("slider", { name: "本街投入到" });
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "5");
    expect(slider).toHaveAttribute("step", "1");
    expect(slider).toHaveAttribute("aria-valuetext", "16");
    fireEvent.change(slider, { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith(17);
  });

  it("marks only the maximum value as all-in", () => {
    const { rerender } = render(
      <VerticalBetSlider
        choices={[14, 199, 200]}
        value={199}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("data-all-in", "false");
    rerender(
      <VerticalBetSlider
        choices={[14, 199, 200]}
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
        choices={[14, 68, 200]}
        value={68}
        disabled
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("slider")).toBeDisabled();
  });

  it("renders the selected amount and mechanical rail details", () => {
    render(
      <VerticalBetSlider
        choices={[6, 14, 15, 16]}
        value={14}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mobile-rail-amount")).toHaveTextContent("14");
    expect(screen.getByTestId("mobile-rail-ticks")).toBeInTheDocument();
    expect(screen.getByText("ALL IN")).toBeVisible();
  });
});
