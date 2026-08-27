// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HorizontalBetSlider } from "./HorizontalBetSlider";
import type { BetRailNode } from "./mobileBetRail";

const nodes: BetRailNode[] = [
  { id: "min", label: "最低", amount: 4, index: 0 },
  { id: "half", label: "半池", amount: 5, index: 1 },
  { id: "two-thirds", label: "2/3池", amount: 6, index: 2 },
  { id: "pot", label: "底池", amount: 7, index: 3 },
  { id: "all-in", label: "ALL IN", amount: 8, index: 4 },
];

describe("HorizontalBetSlider", () => {
  afterEach(cleanup);

  it("renders horizontal semantics and sizing nodes", () => {
    render(<HorizontalBetSlider choices={[4, 5, 6, 7, 8]} value={6} nodes={nodes} disabled={false} onChange={vi.fn()} />);
    const slider = screen.getByRole("slider", { name: "本街投入到" });
    expect(slider).toHaveAttribute("aria-orientation", "horizontal");
    expect(slider).toHaveAttribute("aria-valuetext", "6");
    expect(screen.getByTestId("mobile-rail-amount")).toHaveTextContent("6");
    const markers = screen.getAllByTestId("bet-rail-node");
    expect(markers).toHaveLength(5);
    expect(markers.map((marker) => marker.style.getPropertyValue("--node-left"))).toEqual(["0%", "16.666666666666664%", "33.33333333333333%", "50%", "100%"]);
  });

  it("allows legal intermediate values and snaps on release", () => {
    const onChange = vi.fn();
    render(<HorizontalBetSlider choices={[4, 5, 6, 7, 8]} value={4} nodes={nodes} disabled={false} onChange={onChange} />);
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "500" } });
    expect(onChange).toHaveBeenLastCalledWith(7);
    fireEvent.pointerUp(slider, { target: { value: "500" } });
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it("marks all-in and respects locking", () => {
    render(<HorizontalBetSlider choices={[4, 5, 6, 7, 8]} value={8} nodes={nodes} disabled onChange={vi.fn()} />);
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.getByRole("slider")).toHaveAttribute("data-all-in", "true");
  });
});
