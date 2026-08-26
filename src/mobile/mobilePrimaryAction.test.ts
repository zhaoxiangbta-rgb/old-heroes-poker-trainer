import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { mobileBetChoices, mobilePrimaryAction } from "./mobilePrimaryAction";

describe("mobile primary action", () => {
  it("maps the rail bottom to call and skips the illegal raise gap", () => {
    const game = newGame(42);
    const hero = game.players[game.heroSeat];
    hero.streetBet = 4;
    game.legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: true,
      callAmount: 6,
      minRaiseTo: 16,
      maxRaiseTo: 40,
    };

    const choices = mobileBetChoices(game);
    expect(choices.slice(0, 3)).toEqual([10, 16, 17]);
    expect(choices).not.toContain(11);
    expect(mobilePrimaryAction(game, choices[0])).toEqual({
      action: { type: "call" },
      label: "跟注 6",
      mode: "call",
    });
    expect(mobilePrimaryAction(game, choices[1])).toEqual({
      action: { type: "raise", to: 16 },
      label: "加注到 16",
      mode: "raise",
    });
  });

  it("labels an unopened wager and the maximum as all-in", () => {
    const game = newGame(84);
    game.players[game.heroSeat].streetBet = 0;
    game.legal = {
      canFold: false,
      canCheck: true,
      canCall: false,
      canRaise: true,
      callAmount: 0,
      minRaiseTo: 4,
      maxRaiseTo: 200,
    };

    expect(mobileBetChoices(game).slice(0, 2)).toEqual([4, 5]);
    expect(mobilePrimaryAction(game, 4)).toEqual({
      action: { type: "raise", to: 4 },
      label: "下注 4",
      mode: "bet",
    });
    expect(mobilePrimaryAction(game, 200)).toEqual({
      action: { type: "raise", to: 200 },
      label: "ALL IN",
      mode: "all-in",
    });
  });

  it("offers only call when a short all-in has closed raising", () => {
    const game = newGame(126);
    game.players[game.heroSeat].streetBet = 2;
    game.legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: false,
      callAmount: 3,
      minRaiseTo: 10,
      maxRaiseTo: 200,
    };

    expect(mobileBetChoices(game)).toEqual([5]);
    expect(mobilePrimaryAction(game, 5).action).toEqual({ type: "call" });
  });
});
