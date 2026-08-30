import { describe, expect, it } from "vitest";
import type { Card } from "../engine/cards";
import { calculateActionResponses } from "./actionResponse";
import { inferOpponentRanges } from "./opponentRanges";
import { calculateExactProjection } from "./runoutProjection";
import type { PreActionInsightInput } from "./types";
import { createLocalStrategyEngine } from "../strategy/engine";
import { buildRangeLedger, snapshotRangeLedger } from "../strategy/rangeLedger";
import { replayFixture } from "../strategy/replayFixtures";
import { compileStrategyPacks } from "../strategy/v3/packCompiler";
import { decodeStrategyPack } from "../strategy/v3/packCodec";

function percentiles(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
  };
}

function fixture(playerCount: number, board: Card[]): PreActionInsightInput {
  const positions = ["BTN", "SB", "BB", "UTG", "HJ", "CO"] as const;
  return {
    schemaVersion: 1,
    handNo: 1,
    seed: 20260829,
    street: board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river",
    logIndex: 0,
    heroSeat: 0,
    heroHole: ["Ah", "Jh"],
    board,
    pot: 60,
    currentBet: 0,
    minRaise: 2,
    legal: { canFold: false, canCheck: true, canCall: false, canRaise: true, callAmount: 0, minRaiseTo: 2, maxRaiseTo: 180 },
    pendingSeats: Array.from({ length: playerCount }, (_, seat) => seat),
    tableProfileId: "friends",
    players: Array.from({ length: playerCount }, (_, seat) => ({
      seat,
      playerId: seat ? `friend-0${seat}` : "hero",
      position: positions[seat],
      stack: 180,
      streetBet: 0,
      totalBet: 20,
      folded: false,
      allIn: false,
    })),
    actions: [],
  };
}

describe.skipIf(process.env.PERFORMANCE_GATE !== "1")("pre-action insight performance gates", () => {
  it("keeps repeated desktop V4 live decisions below the 150 ms P95 gate", () => {
    const request = replayFixture("turn-overbet-set", 20260830);
    request.ranges = snapshotRangeLedger(buildRangeLedger(request.state));
    const engine = createLocalStrategyEngine();
    engine.decide(request);
    const timings = Array.from({ length: 9 }, () => {
      const startedAt = performance.now();
      const result = engine.decide(request);
      expect(result.strategyVersion).toBe("strategy-v4.0.0");
      expect(result.source).toContain("strategy-pack-v3");
      expect(Number(result.rangeFacts.evaluatedOpponentCombos)).toBeLessThanOrEqual(160);
      return performance.now() - startedAt;
    });
    const measured = percentiles(timings);
    console.info(`desktop V4 median=${measured.median.toFixed(2)}ms p95=${measured.p95.toFixed(2)}ms`);
    expect(measured.p95).toBeLessThanOrEqual(150);
  });

  it("keeps repeated mobile packed lookups below the 250 ms P95 gate after load", () => {
    const bytes = compileStrategyPacks().mobile;
    const loaded = decodeStrategyPack(bytes, {
      schemaVersion: 3,
      packKind: "mobile",
      appVersion: "1.5.0",
    });
    const timings = Array.from({ length: 9 }, (_, batch) => {
      const startedAt = performance.now();
      for (let index = 0; index < 100; index += 1) {
        const node = loaded.preflop.nodes[(batch * 100 + index) % loaded.preflop.nodes.length];
        const hand = node.hands[(batch * 17 + index) % node.hands.length];
        expect(hand.actions.reduce((sum, action) => sum + action.frequencyQ, 0)).toBe(65_535);
      }
      return performance.now() - startedAt;
    });
    const measured = percentiles(timings);
    console.info(`mobile V3 pack median=${measured.median.toFixed(2)}ms p95=${measured.p95.toFixed(2)}ms`);
    expect(measured.p95).toBeLessThanOrEqual(250);
  });

  it("keeps exact heads-up flop projection fast after warm-up and below the stall ceiling", () => {
    const input = fixture(2, ["Kh", "Qh", "4c"]);
    const ranges = inferOpponentRanges(input);
    const bySeat = Object.fromEntries(ranges.map((range) => [range.seat, range.ranges]));
    calculateExactProjection(input, bySeat);
    const timings = [
      calculateExactProjection(input, bySeat).elapsedMs,
      calculateExactProjection(input, bySeat).elapsedMs,
      calculateExactProjection(input, bySeat).elapsedMs,
    ].sort((first, second) => first - second);
    expect(timings[1]).toBeLessThan(150);
    expect(timings[2]).toBeLessThan(250);
  });

  it("keeps deterministic six-player responses below 800 ms", () => {
    const input = fixture(6, ["Kh", "7h", "4c", "2s"]);
    const startedAt = performance.now();
    const ranges = inferOpponentRanges(input);
    const result = calculateActionResponses(input, ranges, { seed: input.seed, sampleBudget: 384, deadlineMs: 800 });
    const elapsed = performance.now() - startedAt;
    expect(result.responses.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(800);
  });
});
