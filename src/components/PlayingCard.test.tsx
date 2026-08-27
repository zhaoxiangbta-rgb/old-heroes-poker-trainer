// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlayingCard } from "./PlayingCard";

describe("PlayingCard", () => {
  afterEach(cleanup);

  it("separates a large rank and suit for accessible styling", () => {
    render(<PlayingCard card="Ah" />);
    expect(screen.getByText("A")).toHaveClass("card-rank");
    expect(screen.getByText("♥")).toHaveClass("suit-symbol", "suit-red");
    expect(screen.getByText("♥")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByLabelText("Ah")).toHaveAttribute("data-card-kind", "face-up");
    expect(screen.getByLabelText("Ah")).toHaveClass("card-ivory");
    expect(document.querySelector(".card-corner")).toContainElement(screen.getByText("A"));
    expect(document.querySelector(".card-corner")).toContainElement(screen.getByText("♥"));
  });

  it("marks the shared textured back without exposing a card value", () => {
    render(<PlayingCard back />);
    expect(document.querySelector(".card.back")).toHaveAttribute("data-card-kind", "back");
  });
});
