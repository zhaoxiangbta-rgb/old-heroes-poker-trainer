import { describe, expect, it } from "vitest";
import type { StrategyResult } from "../strategy/types";
import { buildPlainLanguageAnalysis } from "./plainLanguageAnalysis";
import type { ExactProjection, OpponentRangeSummary, PreActionInsightInput } from "./types";

const input: PreActionInsightInput = {
  schemaVersion: 1,
  handNo: 3,
  seed: 73,
  street: "turn",
  logIndex: 4,
  heroSeat: 1,
  heroHole: ["Ah", "Qh"],
  board: ["Qs", "7h", "2c", "4h"],
  pot: 30,
  currentBet: 8,
  minRaise: 8,
  legal: { canFold: true, canCheck: false, canCall: true, canRaise: true, callAmount: 8, minRaiseTo: 24, maxRaiseTo: 180 },
  pendingSeats: [1],
  tableProfileId: "friends",
  players: [
    { seat: 0, playerId: "villain", position: "CO", stack: 170, streetBet: 8, totalBet: 12, folded: false, allIn: false },
    { seat: 1, playerId: "hero", position: "BTN", stack: 180, streetBet: 0, totalBet: 4, folded: false, allIn: false },
  ],
  actions: [],
};

const exact: ExactProjection = {
  precision: "exact",
  currentHand: { category: 1, name: "一对" },
  atLeastCurrentByRiver: 0.91,
  handClasses: [{ category: 5, name: "同花", nextCard: 0.19, byRiver: 0.19 }],
  exclusiveNextTotal: 1,
  exclusiveRiverTotal: 1,
  absoluteNuts: 0.08,
  tiedNuts: 0.01,
  nearNuts: 0.12,
  outs: [{ card: "Qd", classification: "dirty", equityDelta: -0.03, riskReason: "full-house" }],
  elapsedMs: 22,
};

const ranges: OpponentRangeSummary[] = [{
  seat: 0,
  playerId: "villain",
  comboCount: 123,
  buckets: { strongValue: 0.18, madeHand: 0.34, strongDraw: 0.14, weakDraw: 0.12, air: 0.22 },
  changes: ["转牌下注 0.27 池"],
  confidence: 0.72,
  ranges: [],
}];

const strategy: StrategyResult = {
  actions: [
    { action: "call", frequency: 0.61, ev: 6.2, intent: "pot-control" },
    { action: "fold", frequency: 0.12, ev: 0, intent: "pot-control" },
    { action: "raise", toAmount: 24, frequency: 0.27, ev: 5.1, intent: "value" },
  ],
  baselineActions: [
    { action: "call", frequency: 0.55, ev: 6.2, intent: "pot-control" },
    { action: "fold", frequency: 0.18, ev: 0, intent: "pot-control" },
    { action: "raise", toAmount: 24, frequency: 0.27, ev: 5.1, intent: "value" },
  ],
  adjustment: { applied: true, tableProfileId: "friends", playerArchetype: "none", maxShift: 0.06, reasonCodes: ["table:friends"] },
  confidence: 0.72,
  source: "blueprint",
  nodeId: "pfs2:turn:srp:ip:noinit:facing-bet:blank:test",
  strategyVersion: "hu-postflop-abstract-v2",
  rangeFacts: {},
  explanationFacts: { inPosition: 1 },
};

describe("plain-language decision analysis", () => {
  it("keeps five ordered sections, both ranges, and no repeated data-wall language", () => {
    const analysis = buildPlainLanguageAnalysis({ input, exact, ranges, responses: [], strategy, sampleBudget: 384 });
    expect(analysis.sections.map((section) => section.kind)).toEqual([
      "situation", "ranges", "baseline", "adjustment", "watch",
    ]);
    const rangeText = analysis.sections.find((section) => section.kind === "ranges")!.text;
    expect(rangeText).toMatch(/你的.*范围.*对手.*%/);
    const allText = analysis.sections.map((section) => section.text).join(" ");
    expect(allText.match(/有效组合/g)).toBeNull();
    expect(allText.match(/所需胜率/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(analysis.opponentBuckets).toEqual(ranges[0].buckets);
    expect(buildPlainLanguageAnalysis({ input, exact, ranges, responses: [], strategy, sampleBudget: 384 }))
      .toEqual(analysis);
  });

  it("uses honest rounded wording when range confidence is low", () => {
    const lowRanges = [{ ...ranges[0], confidence: 0.22 }];
    const analysis = buildPlainLanguageAnalysis({ input, exact, ranges: lowRanges, responses: [], strategy: { ...strategy, confidence: 0.22 }, sampleBudget: 48 });
    const text = analysis.sections.map((section) => section.text).join(" ");
    expect(text).toContain("信息有限，以下范围仅作方向判断");
    expect(text).not.toMatch(/\d+\.\d+%/);
  });

  it("explains V3 value, blockers and future streets in plain Chinese without deleting ranges", () => {
    const v3 = {
      ...strategy,
      strategyVersion: "strategy-v3",
      source: "strategy-pack-v3+resolver" as const,
      explanationFacts: {
        ...strategy.explanationFacts,
        construction: "board-pair-trips",
        algorithm: "combo-elasticity-multistreet-v3",
      },
    };
    const analysis = buildPlainLanguageAnalysis({
      input,
      exact,
      ranges,
      responses: [{
        seat: 0,
        heroAction: { type: "raise", to: 24 },
        fold: 0.38,
        call: 0.52,
        raise: 0.1,
        continuingRange: { ...ranges[0], ranges: undefined } as never,
      }],
      strategy: v3,
      sampleBudget: 384,
    });
    const baselineText = analysis.sections.find((section) => section.kind === "baseline")!.text;
    const rangesText = analysis.sections.find((section) => section.kind === "ranges")!.text;
    expect(baselineText).toContain("更差牌继续");
    expect(baselineText).toContain("占用一张同点数牌");
    expect(baselineText).toContain("河牌计划");
    expect(rangesText).toMatch(/你的.*对手/);
    expect(analysis.sections.map((section) => section.kind)).toEqual([
      "situation", "ranges", "baseline", "adjustment", "watch",
    ]);
    expect(analysis.audit).toMatchObject({
      strategyVersion: "strategy-v3",
      nodeId: strategy.nodeId,
      source: "strategy-pack-v3+resolver",
    });
  });

  it("uses preflop position language and exposes V3 audit status", () => {
    const preflop = {
      ...input,
      street: "preflop" as const,
      board: [] as const,
      currentBet: 2,
      legal: { ...input.legal, callAmount: 0 },
      players: input.players.map((player) => player.playerId === "hero"
        ? { ...player, position: "BTN" as const }
        : player),
    };
    const v3 = {
      ...strategy,
      strategyVersion: "strategy-v3",
      source: "strategy-pack-v3" as const,
      explanationFacts: { inPosition: 1, actingPosition: "BTN", preflopSpot: "unopened" },
    };
    const analysis = buildPlainLanguageAnalysis({ input: preflop, ranges, responses: [], strategy: v3, sampleBudget: 384 });
    const situation = analysis.sections.find((section) => section.kind === "situation")!.text;

    expect(situation).toContain("庄位");
    expect(situation).toContain("可开池范围");
    expect(situation).not.toContain("不利位置");
    expect(analysis.audit).toMatchObject({ displayVersion: "V3", degraded: false });
  });

  it("distinguishes an exact V4 solver node from the general range resolver", () => {
    const solver = buildPlainLanguageAnalysis({
      input,
      exact,
      ranges,
      responses: [],
      strategy: {
        ...strategy,
        strategyVersion: "strategy-v4.0.0",
        source: "strategy-pack-v4+resolver",
        explanationFacts: { algorithm: "solver-dcfr-v4", v4Layer: "heads-up-solver-resolver" },
      },
      sampleBudget: 384,
    });
    const fallback = buildPlainLanguageAnalysis({
      input,
      exact,
      ranges,
      responses: [],
      strategy: {
        ...strategy,
        strategyVersion: "strategy-v4.0.0",
        explanationFacts: { v4Layer: "heads-up-solver-resolver" },
      },
      sampleBudget: 384,
    });

    expect(solver.audit.displayVersion).toBe("V4 · Solver 节点");
    expect(fallback.audit.displayVersion).toBe("V4 · 范围解析");
  });

  it("describes UTG as a tight early-position range instead of postflop first action", () => {
    const preflop = {
      ...input,
      street: "preflop" as const,
      board: [] as const,
      players: input.players.map((player) => player.playerId === "hero"
        ? { ...player, position: "UTG" as const }
        : player),
    };
    const analysis = buildPlainLanguageAnalysis({
      input: preflop,
      ranges,
      responses: [],
      strategy: {
        ...strategy,
        strategyVersion: "strategy-v3",
        source: "strategy-pack-v3",
        explanationFacts: { inPosition: 0, actingPosition: "UTG", preflopSpot: "unopened" },
      },
      sampleBudget: 384,
    });
    const situation = analysis.sections.find((section) => section.kind === "situation")!.text;
    expect(situation).toContain("前位");
    expect(situation).toContain("范围更紧");
    expect(situation).not.toContain("先行动会降低");
  });

  it("derives postflop button position from the live table instead of treating a missing fact as out of position", () => {
    const analysis = buildPlainLanguageAnalysis({
      input,
      exact,
      ranges,
      responses: [],
      strategy: { ...strategy, explanationFacts: {} },
      sampleBudget: 384,
    });
    const situation = analysis.sections.find((section) => section.kind === "situation")!.text;

    expect(situation).toContain("庄位");
    expect(situation).toContain("最后行动");
    expect(situation).toContain("位置有利");
    expect(situation).not.toContain("先行动");
    expect(situation).not.toContain("不利位置");
  });
});
