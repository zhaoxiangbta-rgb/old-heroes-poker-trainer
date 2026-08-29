import { describe, expect, it } from "vitest";
import { calculateActionResponses } from "./actionResponse";
import { inferOpponentRanges } from "./opponentRanges";
import type { PreActionInsightInput } from "./types";

const input: PreActionInsightInput = {
  schemaVersion: 1,
  handNo: 4,
  seed: 101,
  street: "turn",
  logIndex: 3,
  heroSeat: 0,
  heroHole: ["Ah", "Jh"],
  board: ["Kh", "7h", "4c", "2s"],
  pot: 60,
  currentBet: 0,
  minRaise: 2,
  legal: { canFold: false, canCheck: true, canCall: false, canRaise: true, callAmount: 0, minRaiseTo: 2, maxRaiseTo: 180 },
  pendingSeats: [0, 1, 2],
  tableProfileId: "friends",
  players: [
    { seat: 0, playerId: "hero", position: "BTN", stack: 180, streetBet: 0, totalBet: 20, folded: false, allIn: false },
    { seat: 1, playerId: "friend-01", position: "SB", stack: 160, streetBet: 0, totalBet: 40, folded: false, allIn: false },
    { seat: 2, playerId: "friend-02", position: "BB", stack: 160, streetBet: 0, totalBet: 40, folded: false, allIn: false },
  ],
  actions: [],
};

describe("sampled opponent action responses", () => {
  it("returns legal normalized responses for each supported size", () => {
    const result = calculateActionResponses(input, inferOpponentRanges(input), {
      seed: 101,
      sampleBudget: 320,
      deadlineMs: 800,
    });
    expect(result.precision).toBe("sampled");
    expect(result.samples).toBeGreaterThan(0);
    expect(new Set(result.responses.map((response) => response.heroAction.type === "raise" ? response.heroAction.to : response.heroAction.type)).size)
      .toBeGreaterThanOrEqual(4);
    for (const response of result.responses) {
      expect(response.fold + response.call + response.raise).toBeCloseTo(1, 10);
      expect(response.fold).toBeGreaterThanOrEqual(0);
      expect(response.call).toBeGreaterThanOrEqual(0);
      expect(response.raise).toBeGreaterThanOrEqual(0);
    }
  });

  it("folds more often to all-in than to a half-pot bet", () => {
    const result = calculateActionResponses(input, inferOpponentRanges(input), {
      seed: 101,
      sampleBudget: 320,
      deadlineMs: 800,
    });
    const seat = 1;
    const raises = result.responses.filter((response) => response.seat === seat && response.heroAction.type === "raise");
    const half = raises.reduce((best, response) => response.heroAction.type === "raise" && response.heroAction.to < (best.heroAction.type === "raise" ? best.heroAction.to : Infinity) ? response : best);
    const allIn = raises.reduce((best, response) => response.heroAction.type === "raise" && response.heroAction.to > (best.heroAction.type === "raise" ? best.heroAction.to : -Infinity) ? response : best);
    expect(allIn.fold).toBeGreaterThan(half.fold);
  });

  it("is deterministic for the same snapshot and seed", () => {
    const ranges = inferOpponentRanges(input);
    const config = { seed: 202, sampleBudget: 96, deadlineMs: 800 };
    expect(calculateActionResponses(input, ranges, config)).toEqual(calculateActionResponses(input, ranges, config));
  });
});
