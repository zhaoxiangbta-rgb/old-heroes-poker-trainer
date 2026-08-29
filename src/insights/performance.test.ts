import { describe, expect, it } from "vitest";
import type { Card } from "../engine/cards";
import { calculateActionResponses } from "./actionResponse";
import { inferOpponentRanges } from "./opponentRanges";
import { calculateExactProjection } from "./runoutProjection";
import type { PreActionInsightInput } from "./types";

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
  it("keeps exact heads-up flop projection below the desktop hard ceiling twice", () => {
    const input = fixture(2, ["Kh", "Qh", "4c"]);
    const ranges = inferOpponentRanges(input);
    const bySeat = Object.fromEntries(ranges.map((range) => [range.seat, range.ranges]));
    const timings = [
      calculateExactProjection(input, bySeat).elapsedMs,
      calculateExactProjection(input, bySeat).elapsedMs,
    ];
    expect(Math.max(...timings)).toBeLessThan(150);
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
