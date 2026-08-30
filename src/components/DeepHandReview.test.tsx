// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newGame } from "../game/game";
import type { DeepHandReview } from "../review/types";
import { DeepHandReviewView } from "./DeepHandReview";

afterEach(cleanup);

function review(): DeepHandReview {
  return {
    version: 1,
    status: "completed",
    handNo: 1,
    seed: 42,
    stateHash: "abc",
    strategyVersion: "test",
    calculatorVersion: "deep-review-v1",
    completedAt: "2026-08-28T00:00:00.000Z",
    summary: {
      grade: "需复盘",
      totalNormalizedEvLoss: 0.05,
      bestDecisionId: "1:0",
      worstDecisionId: "1:0",
      strongestPoint: "跟注赔率判断正确",
      priorityCorrection: "减少低质量跟注",
      confidence: 0.96,
      precision: "exact",
    },
    decisions: [{
      id: "1:0",
      logIndex: 0,
      street: "flop",
      position: "BTN",
      pot: 20,
      spr: 6,
      activePlayers: 2,
      playersBehind: 0,
      actual: { type: "call" },
      recommended: { type: "raise", to: 30 },
      candidates: [
        { action: { type: "call" }, ev: 2, frequency: 0.3, intent: "pot-control" },
        { action: { type: "raise", to: 30 }, ev: 4, frequency: 0.7, intent: "value" },
      ],
      normalizedEvLoss: 0.05,
      equity: 0.58,
      requiredEquity: 0.25,
      cleanOuts: 6,
      dirtyOuts: 2,
      ranges: {
        villain: { comboCount: 88, topPairOrBetter: 0.4, draws: 0.2, air: 0.4, change: "有效组合收窄 12.0" },
      },
      precision: "exact",
      samples: 1200,
      coverage: 1,
      confidence: 1,
      tags: ["overcalling"],
      correctThinking: ["赔率判断正确"],
      corrections: ["跟注损失 5%"],
      coreRule: "核心规则：比较继续投入后的 EV。",
    }],
  };
}

function coachReview(): DeepHandReview {
  const legacy = review();
  if (legacy.version !== 1) throw new Error("测试需要 v1 复盘");
  return {
    ...legacy,
    version: 3,
    decisions: legacy.decisions.map((decision) => ({
      ...decision,
      samples: 20_000,
      coach: {
        madeHandLabel: "顶对中等踢脚",
        heroRangePercentile: 0.68,
        equityVsFullRange: 0.367,
        equityVsContinueRange: null,
        opponentBuckets: [
          { kind: "strong-made", probability: 0.18 },
          { kind: "top-pair", probability: 0.37 },
          { kind: "strong-draw", probability: 0.28 },
          { kind: "air", probability: 0.17 },
        ],
        opponentResponses: [
          { action: "fold", probability: 0.32 },
          { action: "call", probability: 0.58 },
          { action: "raise", probability: 0.1 },
        ],
        atLeastOnePlayerBehindContinues: 0.22,
        runoutSummary: [{ label: "升级为两对或三条", probability: 0.11, mutuallyExclusive: false }],
        recommendationReasons: ["当前牌力为顶对", "预计权益高于所需胜率", "身后继续风险约 22%"],
        changeConditions: ["对手改为大额下注时提高弃牌频率"],
        confidence: 0.7,
        narrative: "你目前是顶对中等踢脚。对手范围包含强牌、一对、听牌和弱牌。推荐跟注控池。",
      },
      analysis: {
        schemaVersion: 2,
        sections: [
          { kind: "situation", title: "你现在处于什么局面", text: "当前是顶对。" },
          { kind: "ranges", title: "双方大概有什么牌", text: "你的范围靠前，对手有强牌和听牌。" },
          { kind: "baseline", title: "标准打法", text: "标准建议跟注。" },
          { kind: "adjustment", title: "面对这名玩家的调整", text: "不额外调整。" },
          { kind: "watch", title: "继续行动前要留意什么", text: "先看下注尺度。" },
        ],
        heroRange: { label: "AQo", percentile: 0.2 },
        opponentBuckets: { strongValue: 0.18, madeHand: 0.37, strongDraw: 0.28, weakDraw: 0, air: 0.17 },
        baseline: [], adjusted: [], confidence: 0.7,
        audit: { strategyVersion: "v2", sampleBudget: 20000, seed: 42 },
      },
      opponentRanges: [],
    })),
  };
}

function wholeHandReview(): DeepHandReview {
  const result = coachReview();
  if (result.version !== 3) throw new Error("测试需要 v3 复盘");
  return {
    ...result,
    wholeHand: {
      conclusion: "整手主要问题在河牌，其他街道不必重复展开。",
      streets: [{
        street: "river", board: ["2c", "7d", "Jh", "Qs", "3h"],
        actionLine: ["对手 加注到130"],
        comment: "你当前是J高同花。对手的强价值范围明显增加。",
        actual: "跟注", recommended: "弃牌",
      }],
      turningPoint: "河牌是本手关键转折：你选择跟注，模型更推荐弃牌。",
      finalRanges: [{
        playerId: "villain", latestAction: "河牌加注 1.30 池", confidence: 0.76,
        buckets: [{ label: "强价值", probability: 0.62 }, { label: "空气或诈唬", probability: 0.12 }],
      }],
      bestChoice: "河牌最佳选择是弃牌。继续需要27.3%胜率。",
      nextRule: "下次先看对手的行动强度和你需要的胜率。",
    },
  };
}

describe("DeepHandReviewView", () => {
  it("renders a single connected whole-hand review without the repeated five-section template", () => {
    const game = newGame(42);
    game.phase = "review";
    render(<DeepHandReviewView game={game} review={wholeHandReview()} onRecalculate={vi.fn()} onNextHand={vi.fn()} />);

    for (const name of ["整手结论", "逐街点评", "关键转折", "最终范围", "最佳选择", "下次先看"])
      expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText(/^V4 整手复盘/)).toBeInTheDocument();
    expect(screen.getByText(/强价值 62%/)).toBeInTheDocument();
    expect(screen.getByText(/继续需要27.3%胜率/)).toBeInTheDocument();
    expect(screen.queryByText("你现在处于什么局面")).not.toBeInTheDocument();
    expect(screen.queryByText("行动时间线")).not.toBeInTheDocument();
  });

  it("does not render the verbose legacy review as if it were current", () => {
    const game = newGame(42);
    game.phase = "review";
    render(<DeepHandReviewView game={game} review={review()} onRecalculate={vi.fn()} onNextHand={vi.fn()} />);
    expect(screen.getByText("旧版复盘结果")).toBeInTheDocument();
    expect(screen.queryByText("行动时间线")).not.toBeInTheDocument();
    expect(screen.queryByText("范围变化")).not.toBeInTheDocument();
  });

  it("treats a V3 record without the connected whole-hand narrative as outdated", () => {
    const game = newGame(42);
    game.phase = "review";
    render(<DeepHandReviewView game={game} review={coachReview()} onRecalculate={vi.fn()} onNextHand={vi.fn()} />);
    expect(screen.getByText("旧版复盘结果")).toBeInTheDocument();
    expect(screen.queryByText("你现在处于什么局面")).not.toBeInTheDocument();
  });

  it("keeps the current recalculation action for an outdated V3 record", () => {
    const game = newGame(42);
    game.phase = "review";
    const adjusted = coachReview();
    if (adjusted.version !== 3) throw new Error("测试需要 v3 复盘");
    adjusted.decisions[0].analysis.adjustment = {
      applied: true,
      tableProfileId: "friends",
      playerArchetype: "loose-aggressive",
      maxShift: 0.06,
      reasonCodes: ["player:loose-aggressive"],
    };
    render(<DeepHandReviewView game={game} review={adjusted} onRecalculate={vi.fn()} onNextHand={vi.fn()} />);
    expect(screen.getByRole("button", { name: "使用 V4 重新精算" })).toBeInTheDocument();
  });

  it("labels a legacy result and keeps the recalculation action", () => {
    const game = newGame(42);
    game.phase = "review";
    render(<DeepHandReviewView game={game} review={review()} onRecalculate={vi.fn()} onNextHand={vi.fn()} />);
    expect(screen.getByText(/旧版复盘/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用 V4 重新精算" })).toBeInTheDocument();
  });

  it("uses a guarded AI review as primary prose and keeps local evidence collapsible", () => {
    const game = newGame(42); game.phase = "review";
    const local = wholeHandReview();
    local.decisions[0].street = "river";
    render(<DeepHandReviewView game={game} review={local} aiStatus="completed" aiReview={{ version: 1, factsVersion: 1, stateHash: local.stateHash, model: "Qwen3.5-9B-Q8", elapsedMs: 700, summary: "河牌的对手行动已把范围压到强价值。", streets: [{ street: "river", analysis: "你需要27.3%胜率，但本地权益不足，应弃牌。" }], turningPoint: "河牌面对加注到130。", keyLesson: "被动局的河牌大加注优先尊重价值。" }} onRecalculate={vi.fn()} onNextHand={vi.fn()} />);
    expect(screen.getByText("AI 整手复盘 · 本地事实审核通过")).toBeVisible();
    expect(screen.getByText(/27.3%胜率/)).toBeVisible();
    expect(screen.getByText("你当时的牌：")).toBeVisible();
    expect(screen.getByText("对手范围估计：")).toBeVisible();
    expect(screen.getByText("查看本地 Solver 数字与范围依据")).toBeVisible();
    expect(screen.queryByText("最终范围")).not.toBeInTheDocument();
  });

  it("shows an actionable reason when AI prose is unavailable", () => {
    const game = newGame(42); game.phase = "review";
    render(<DeepHandReviewView game={game} review={wholeHandReview()} aiStatus="not-started" aiError="开发预览页不调用本地模型；请打开 macOS 应用查看 AI 复盘。" onRecalculate={vi.fn()} onNextHand={vi.fn()} />);
    expect(screen.getByText("AI 整手复盘未生成")).toBeVisible();
    expect(screen.getByText(/macOS 应用/)).toBeVisible();
  });
});
