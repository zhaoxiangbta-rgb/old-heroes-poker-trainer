import { describe, expect, it } from "vitest";
import type { PublicDecisionState, PublicPlayer } from "./types";
import { multiwayPotExposure } from "./multiwayPots";

function player(overrides: Partial<PublicPlayer> & Pick<PublicPlayer, "seat">): PublicPlayer {
  return {
    playerId: `seat-${overrides.seat}`,
    position: "UTG",
    stack: 100,
    streetBet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    ...overrides,
  };
}

function state(players: PublicPlayer[]): PublicDecisionState {
  return {
    schemaVersion: 1,
    seed: 7,
    decisionIndex: 3,
    actingSeat: 0,
    buttonSeat: 3,
    smallBlindSeat: 0,
    bigBlindSeat: 1,
    blindLevel: { small: 1, big: 2 },
    street: "turn",
    heroHole: ["Ah", "Kh"],
    board: ["Qh", "7c", "2s", "9d"],
    pot: players.reduce((sum, item) => sum + item.totalBet, 0),
    currentBet: 100,
    minRaise: 50,
    legal: {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: true,
      callAmount: 80,
      minRaiseTo: 150,
      maxRaiseTo: 200,
    },
    pendingSeats: [0],
    players,
    actions: [],
    tableProfileId: "balanced",
  };
}

const players = () => [
  player({ seat: 0, position: "SB", stack: 180, streetBet: 20, totalBet: 20 }),
  player({ seat: 1, position: "BB", stack: 0, streetBet: 50, totalBet: 50, allIn: true }),
  player({ seat: 2, position: "CO", stack: 100, streetBet: 100, totalBet: 100 }),
  player({ seat: 3, position: "BTN", stack: 100, streetBet: 100, totalBet: 100, folded: true }),
];

describe("multiway main and side pot exposure", () => {
  it("keeps a short all-in in the main pot only", () => {
    const exposure = multiwayPotExposure(state(players()), 100);

    expect(exposure.pots).toEqual([
      expect.objectContaining({ amount: 200, eligibleSeats: [0, 1, 2], heroCanWinAmount: 200 }),
      expect.objectContaining({ amount: 150, eligibleSeats: [0, 2], heroCanWinAmount: 150 }),
    ]);
    expect(exposure.pots[1].eligibleSeats).not.toContain(1);
  });

  it("keeps folded chips in the pot but removes the folded seat from eligibility", () => {
    const exposure = multiwayPotExposure(state(players()), 100);

    expect(exposure.totalCommitted).toBe(350);
    expect(exposure.pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(350);
    expect(exposure.pots.every((pot) => !pot.eligibleSeats.includes(3))).toBe(true);
  });

  it("treats an unmatched raise tail as refundable rather than at-risk EV", () => {
    const exposure = multiwayPotExposure(state(players()), 150);

    expect(exposure.incrementalCost).toBe(130);
    expect(exposure.refundableAmount).toBe(50);
    expect(exposure.maxLoss).toBe(80);
    expect(exposure.pots.at(-1)).toEqual(expect.objectContaining({
      amount: 50,
      eligibleSeats: [0],
      heroCanWinAmount: 50,
      automaticallyWon: true,
    }));
  });

  it("reports only pots the hero is eligible to win", () => {
    const foldedHero = players();
    foldedHero[0] = { ...foldedHero[0], folded: true };
    const exposure = multiwayPotExposure(state(foldedHero), 20);

    expect(exposure.heroWinnableAmount).toBe(0);
    expect(exposure.pots.every((pot) => pot.heroCanWinAmount === 0)).toBe(true);
  });
});
