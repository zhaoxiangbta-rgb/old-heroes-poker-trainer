import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import {
  clampMobileBet,
  mobileBetBounds,
  mobileBetPresetTarget,
} from "./mobileBetSizing";

describe("mobile bet sizing", () => {
  it("covers every integer from the legal minimum through all-in", () => {
    const game = newGame(42);
    game.legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: true,
      callAmount: 6,
      minRaiseTo: 14,
      maxRaiseTo: 200,
    };

    expect(mobileBetBounds(game)).toEqual({ min: 14, max: 200 });
    expect(clampMobileBet(13.6, { min: 14, max: 200 })).toBe(14);
    expect(clampMobileBet(87.4, { min: 14, max: 200 })).toBe(87);
    expect(clampMobileBet(999, { min: 14, max: 200 })).toBe(200);
  });

  it("selects minimum and clamped pot fractions without submitting", () => {
    const game = newGame(42);
    const hero = game.players[game.heroSeat];
    hero.streetBet = 4;
    game.pot = 30;
    game.legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: true,
      callAmount: 6,
      minRaiseTo: 16,
      maxRaiseTo: 38,
    };

    expect(mobileBetPresetTarget(game, "minimum")).toBe(16);
    expect(mobileBetPresetTarget(game, "half-pot")).toBe(25);
    expect(mobileBetPresetTarget(game, "two-thirds-pot")).toBe(30);
    expect(mobileBetPresetTarget(game, "pot")).toBe(38);
  });

  it("returns no slider bounds when raising is closed", () => {
    const game = newGame(42);
    game.legal.canRaise = false;
    expect(mobileBetBounds(game)).toBeNull();
  });
});
