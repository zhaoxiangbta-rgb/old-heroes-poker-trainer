// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import type { PreActionInsightState } from "../insights/types";
import { PreActionInsights } from "./PreActionInsights";

afterEach(cleanup);

function game() {
  const state = newGame(42);
  state.street = "flop";
  state.board = ["2c", "7d", "Jh"];
  return state;
}

const ready: PreActionInsightState = {
  status: "ready",
  exact: {
    precision: "exact",
    handClasses: [
      { category: 1, name: "一对", nextCard: 0.13, byRiver: 0.25 },
      { category: 5, name: "同花", nextCard: 0, byRiver: 0.04 },
    ],
    exclusiveNextTotal: 1,
    exclusiveRiverTotal: 1,
    absoluteNuts: 0.02,
    tiedNuts: 0.01,
    nearNuts: 0.05,
    outs: [{ card: "Ah", classification: "dirty", equityDelta: -0.04, riskReason: "higher-flush" }],
    elapsedMs: 40,
  },
  ranges: [{
    seat: 1,
    playerId: "friend-01",
    comboCount: 128,
    buckets: { strongValue: 0.22, madeHand: 0.28, strongDraw: 0.12, weakDraw: 0.16, air: 0.22 },
    changes: ["翻牌跟注 0.50 池"],
    confidence: 0.7,
    ranges: [],
  }],
  responses: [
    { seat: 1, heroAction: { type: "raise", to: 30 }, fold: 0.32, call: 0.58, raise: 0.1, continuingRange: { seat: 1, playerId: "friend-01", comboCount: 128, buckets: { strongValue: 0.22, madeHand: 0.28, strongDraw: 0.12, weakDraw: 0.16, air: 0.22 }, changes: [], confidence: 0.7 } },
  ],
  confidence: 0.7,
};

describe("PreActionInsights", () => {
  it("shows exact hand paths, nuts split, and dirty outs", () => {
    render(<PreActionInsights state={ready} game={game()} />);
    expect(screen.getByText("成牌路径（精确）")).toBeInTheDocument();
    expect(screen.getByText(/25.0%/)).toBeInTheDocument();
    expect(screen.getByText(/独占坚果 2.0%/)).toBeInTheDocument();
    expect(screen.getByText(/脏补牌 1 张/)).toBeInTheDocument();
  });

  it("keeps exact facts visible while opponent ranges are loading", () => {
    render(<PreActionInsights state={{ ...ready, status: "calculating-ranges", ranges: undefined }} game={game()} />);
    expect(screen.getByText("成牌路径（精确）")).toBeInTheDocument();
    expect(screen.getByText("正在估计对手范围…")).toBeInTheDocument();
  });

  it("expands every opponent and labels estimates", () => {
    render(<PreActionInsights state={ready} game={game()} />);
    fireEvent.click(screen.getByRole("button", { name: "查看对手范围" }));
    expect(screen.getByText(/范围估计/)).toBeInTheDocument();
    expect(screen.getByText(/弃牌 32%/)).toBeInTheDocument();
  });

  it("does not mention nuts before the flop", () => {
    const preflop = game();
    preflop.street = "preflop";
    preflop.board = [];
    render(<PreActionInsights state={{ status: "calculating-ranges" }} game={preflop} />);
    expect(screen.queryByText(/坚果/)).not.toBeInTheDocument();
  });
});
