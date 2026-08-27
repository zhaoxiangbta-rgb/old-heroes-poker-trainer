import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { mobileBetChoices } from "./mobilePrimaryAction";
import {
  choiceIndexAtRailFraction,
  mobileBetRailNodes,
  railFractionForChoiceIndex,
  snapBetRailIndex,
} from "./mobileBetRail";

function facingBetGame() {
  const game = newGame(42);
  game.players[game.heroSeat].streetBet = 0;
  game.currentBet = 4;
  game.pot = 24;
  game.legal = { canFold: true, canCheck: false, canCall: true, canRaise: true, callAmount: 4, minRaiseTo: 10, maxRaiseTo: 60 };
  return game;
}

describe("mobile bet rail", () => {
  it("maps five sizing landmarks onto legal ascending choices", () => {
    const game = facingBetGame();
    const choices = mobileBetChoices(game);
    const nodes = mobileBetRailNodes(game, choices);
    expect(nodes.map((node) => node.label)).toEqual(["最低", "半池", "2/3池", "底池", "ALL IN"]);
    expect(nodes[0].index).toBe(0);
    expect(nodes.at(-1)?.index).toBe(choices.length - 1);
    expect(nodes.every((node) => choices[node.index] === node.amount)).toBe(true);
    expect(nodes.map((node) => node.index)).toEqual([...nodes.map((node) => node.index)].sort((a, b) => a - b));
  });

  it("keeps all five visual landmarks when short-stack targets coincide", () => {
    const game = facingBetGame();
    game.legal.maxRaiseTo = 12;
    const choices = mobileBetChoices(game);
    const nodes = mobileBetRailNodes(game, choices);
    expect(nodes).toHaveLength(5);
    expect(new Set(nodes.map((node) => node.index)).size).toBeLessThan(nodes.length);
  });

  it("snaps only inside the configured index threshold", () => {
    const nodes = [{ id: "half" as const, label: "½", amount: 20, index: 18 }];
    expect(snapBetRailIndex(20, nodes, 2)).toBe(18);
    expect(snapBetRailIndex(21, nodes, 2)).toBe(21);
  });

  it("puts one-pot at the center and divides the left semantic sizes evenly", () => {
    const game = facingBetGame();
    game.pot = 3;
    game.legal = { canFold: true, canCheck: false, canCall: true, canRaise: true, callAmount: 2, minRaiseTo: 4, maxRaiseTo: 286 };
    const choices = mobileBetChoices(game);
    const nodes = mobileBetRailNodes(game, choices);

    expect([0, 1 / 6, 1 / 3, 1 / 2, 1].map((fraction) =>
      choices[choiceIndexAtRailFraction(fraction, nodes)],
    )).toEqual(nodes.map((node) => node.amount));
    expect(nodes.find((node) => node.id === "half")!.amount)
      .toBeLessThanOrEqual(nodes.find((node) => node.id === "pot")!.amount);
  });

  it("round-trips intermediate legal amounts on a deep-stack nonlinear rail", () => {
    const game = facingBetGame();
    game.pot = 3;
    game.legal.maxRaiseTo = 286;
    const choices = mobileBetChoices(game);
    const nodes = mobileBetRailNodes(game, choices);
    for (const index of [0, 1, 2, 3, 10, 50, 120, choices.length - 1]) {
      expect(choiceIndexAtRailFraction(railFractionForChoiceIndex(index, nodes), nodes)).toBe(index);
    }
  });
});
