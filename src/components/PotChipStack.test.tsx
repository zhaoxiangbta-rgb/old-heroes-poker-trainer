// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PotChipStack } from "./PotChipStack";
import { potChipColumns } from "./potChipColumns";

describe("PotChipStack", () => {
  afterEach(cleanup);

  it.each([
    [3, [1, 2, 1]],
    [24, [2, 3, 3, 2]],
    [77, [3, 4, 5, 4, 3]],
    [180, [4, 5, 6, 6, 5, 4]],
  ])("maps pot %i to stable vertical columns", (pot, expected) => {
    expect(potChipColumns(pot)).toEqual(expected);
  });

  it("renders one real image for every chip in every column", () => {
    render(<PotChipStack pot={77} phase="hero-turn" />);
    expect(screen.getAllByText("底池 77")).toHaveLength(1);
    expect(document.querySelectorAll(".pot-chip-column")).toHaveLength(5);
    const chips = document.querySelectorAll<HTMLImageElement>(".pot-chip-column img");
    expect(chips).toHaveLength(19);
    chips.forEach((chip) => expect(chip.src).toContain("/assets/poker-visuals/chips/wager-"));
    const tallestColumnTop = document.querySelectorAll<HTMLElement>(".pot-chip-column")[2].querySelectorAll<HTMLImageElement>("img")[4];
    expect(tallestColumnTop.style.getPropertyValue("--chip-bottom")).toBe("32px");
  });

  it("keeps the settling state on the bounded visual stack", () => {
    render(<PotChipStack pot={180} phase="settling-pot" />);
    expect(document.querySelectorAll(".pot-chip-column")).toHaveLength(6);
    expect(document.querySelectorAll(".pot-chip-column img")).toHaveLength(30);
    expect(document.querySelector(".pot-chip-stack")).toHaveClass("settling");
  });
});
