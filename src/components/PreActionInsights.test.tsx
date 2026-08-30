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
    currentHand: { category: 1, name: "一对" },
    atLeastCurrentByRiver: 1,
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
  it("prefers the compact V3 coach view over the old five-section template", () => {
    const coachState: PreActionInsightState = {
      ...ready,
      liveCoach: {
        schemaVersion: 1,
        strategy: { label: "V3", version: "strategy-v3", degraded: false },
        hero: {
          currentHand: "三条",
          upgrades: [
            { category: 6, name: "葫芦", nextCard: 0.13, byRiver: 0.29 },
            { category: 7, name: "四条", nextCard: 0.02, byRiver: 0.04 },
          ],
          upgradeSummary: "葫芦到河牌29%、四条到河牌4%",
        },
        opponents: [{
          seat: 1,
          playerId: "friend-01",
          primary: true,
          comboCount: 128,
          confidence: 0.7,
          actionLine: "翻牌跟注 0.50 池",
          buckets: [
            { key: "madeHand", label: "普通成牌", probability: 0.42 },
            { key: "strongValue", label: "强价值", probability: 0.22 },
          ],
        }],
        confidence: 0.7,
      },
      analysis: {
        schemaVersion: 2,
        sections: [
          { kind: "situation", title: "你现在处于什么局面", text: "旧内容" },
          { kind: "ranges", title: "双方大概有什么牌", text: "旧内容" },
          { kind: "baseline", title: "标准打法", text: "旧内容" },
          { kind: "adjustment", title: "面对这名玩家的调整", text: "旧内容" },
          { kind: "watch", title: "继续行动前要留意什么", text: "旧内容" },
        ],
        heroRange: { label: "99", percentile: 0.1 },
        opponentBuckets: ready.ranges![0].buckets,
        baseline: [], adjusted: [], confidence: 0.7,
        audit: { strategyVersion: "strategy-v3", sampleBudget: 384, seed: 42 },
      },
    };
    render(<PreActionInsights state={coachState} game={game()} />);

    expect(screen.getByText("V3 策略")).toBeInTheDocument();
    expect(screen.getByText("当前：三条")).toBeInTheDocument();
    expect(screen.getByText(/葫芦.*29%/)).toBeInTheDocument();
    expect(screen.getByText("主要施压者")).toBeInTheDocument();
    expect(screen.getByText("普通成牌")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.queryByText("你现在处于什么局面")).not.toBeInTheDocument();
  });

  it("renders one ordered five-section analysis without legacy duplicate chapters", () => {
    const analysisState: PreActionInsightState = {
      ...ready,
      analysis: {
        schemaVersion: 2,
        sections: [
          { kind: "situation", title: "你现在处于什么局面", text: "你有位置。" },
          { kind: "ranges", title: "双方大概有什么牌", text: "你的范围和对手范围。" },
          { kind: "baseline", title: "标准打法", text: "以跟注为主。" },
          { kind: "adjustment", title: "面对这名玩家的调整", text: "略微放宽。" },
          { kind: "watch", title: "继续行动前要留意什么", text: "留意危险牌。" },
        ],
        heroRange: { label: "QJs", percentile: 0.2 },
        opponentBuckets: ready.ranges![0].buckets,
        baseline: [], adjusted: [], confidence: 0.7,
        audit: { strategyVersion: "v2", sampleBudget: 384, seed: 42 },
      },
    };
    render(<PreActionInsights state={analysisState} game={game()} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
    expect(screen.getByText("双方大概有什么牌")).toBeInTheDocument();
    expect(screen.queryByText("后续牌型变化（精确）")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看对手范围" })).not.toBeInTheDocument();
  });

  it("shows exact hand paths, nuts split, and dirty outs", () => {
    render(<PreActionInsights state={ready} game={game()} />);
    expect(screen.getByText("后续牌型变化（精确）")).toBeInTheDocument();
    expect(screen.getByText("当前已成一对")).toBeInTheDocument();
    expect(screen.getByText(/25.0%/)).toBeInTheDocument();
    expect(screen.getByText(/独占坚果 2.0%/)).toBeInTheDocument();
    expect(screen.getByText(/脏补牌 1 张/)).toBeInTheDocument();
  });

  it("keeps exact facts visible while opponent ranges are loading", () => {
    render(<PreActionInsights state={{ ...ready, status: "calculating-ranges", ranges: undefined }} game={game()} />);
    expect(screen.getByText("后续牌型变化（精确）")).toBeInTheDocument();
    expect(screen.getByText("正在估计对手范围…")).toBeInTheDocument();
  });

  it("labels an already-made set as remaining or upgrading rather than becoming a set", () => {
    const setState: PreActionInsightState = {
      status: "ready",
      exact: {
        ...ready.exact!,
        currentHand: { category: 3, name: "三条" },
        atLeastCurrentByRiver: 1,
        handClasses: [
          { category: 3, name: "三条", nextCard: 0.851, byRiver: 0.666 },
          { category: 6, name: "葫芦", nextCard: 0.128, byRiver: 0.291 },
          { category: 7, name: "四条", nextCard: 0.021, byRiver: 0.043 },
        ],
      },
    };
    render(<PreActionInsights state={setState} game={game()} />);
    expect(screen.getByText("当前已成三条")).toBeInTheDocument();
    expect(screen.getByText("到河牌至少保持三条 100.0%")).toBeInTheDocument();
    expect(screen.getByText("仍为三条")).toBeInTheDocument();
    expect(screen.getByText("升级为葫芦")).toBeInTheDocument();
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
