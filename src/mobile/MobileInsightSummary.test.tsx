// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import type { PreActionInsightState } from "../insights/types";
import { MobileInsightSummary } from "./MobileInsightSummary";

afterEach(cleanup);

const state: PreActionInsightState = {
  status: "ready",
  exact: {
    precision: "exact",
    handClasses: [{ category: 5, name: "同花", nextCard: 0.19, byRiver: 0.35 }],
    exclusiveNextTotal: 1,
    exclusiveRiverTotal: 1,
    absoluteNuts: 0.08,
    tiedNuts: 0.01,
    nearNuts: 0.04,
    outs: [],
    elapsedMs: 30,
  },
  ranges: [],
  responses: [],
  confidence: 0.68,
};

describe("MobileInsightSummary", () => {
  it("opens a modal detail sheet and closes it with Escape", () => {
    const game = newGame(42);
    game.street = "flop";
    game.board = ["2c", "7d", "Jh"];
    render(<MobileInsightSummary state={state} game={game} />);
    fireEvent.click(screen.getByRole("button", { name: /打开下注前分析/ }));
    expect(screen.getByRole("dialog", { name: "下注前分析详情" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders no action handler and blocks pointer-through with a backdrop", () => {
    render(<MobileInsightSummary state={state} game={newGame(43)} />);
    fireEvent.click(screen.getByRole("button", { name: /打开下注前分析/ }));
    const backdrop = screen.getByTestId("mobile-insight-backdrop");
    expect(backdrop).toHaveClass("mobile-insight-sheet-backdrop");
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a compact exact summary without a ready result", () => {
    render(<MobileInsightSummary state={{ status: "calculating-exact" }} game={newGame(44)} />);
    expect(screen.getByText("分析中…")).toBeVisible();
  });
});
