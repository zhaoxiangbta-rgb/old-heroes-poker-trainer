import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { mobileBetChoices } from "./mobilePrimaryAction";
import { mobileBetRailNodes, snapBetRailIndex } from "./mobileBetRail";

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
    expect(nodes.map((node) => node.label)).toEqual(["最低", "½", "⅔", "1×", "ALL IN"]);
    expect(nodes[0].index).toBe(0);
    expect(nodes.at(-1)?.index).toBe(choices.length - 1);
    expect(nodes.every((node) => choices[node.index] === node.amount)).toBe(true);
    expect(nodes.map((node) => node.index)).toEqual([...nodes.map((node) => node.index)].sort((a, b) => a - b));
  });

  it("removes duplicate legal landmarks for short stacks", () => {
    const game = facingBetGame();
    game.legal.maxRaiseTo = 12;
    const choices = mobileBetChoices(game);
    const nodes = mobileBetRailNodes(game, choices);
    expect(new Set(nodes.map((node) => node.index)).size).toBe(nodes.length);
  });

  it("snaps only inside the configured index threshold", () => {
    const nodes = [{ id: "half" as const, label: "½", amount: 20, index: 18 }];
    expect(snapBetRailIndex(20, nodes, 2)).toBe(18);
    expect(snapBetRailIndex(21, nodes, 2)).toBe(21);
  });
});
