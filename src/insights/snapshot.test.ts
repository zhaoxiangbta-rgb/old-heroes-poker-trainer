import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { buildPreActionInsightInput, preActionInsightHash } from "./snapshot";

describe("public pre-action insight snapshot", () => {
  it("excludes every unrevealed opponent hole card", () => {
    const game = newGame(31);
    const hidden = game.players
      .filter((player) => player.seat !== game.heroSeat)
      .flatMap((player) => player.hole);

    const input = buildPreActionInsightInput(game);
    const serialized = JSON.stringify(input);

    hidden.forEach((card) => expect(serialized).not.toContain(card));
    expect(input.heroHole).toEqual(game.players[game.heroSeat].hole);
    expect(input.players.every((player) => !("hole" in player))).toBe(true);
  });

  it("hashes the same public state identically and changes after a public action index", () => {
    const game = newGame(32);
    const first = buildPreActionInsightInput(game);
    const changed = structuredClone(first);
    changed.logIndex += 1;

    expect(preActionInsightHash(structuredClone(first))).toBe(preActionInsightHash(first));
    expect(preActionInsightHash(changed)).not.toBe(preActionInsightHash(first));
  });

  it("copies mutable game fields instead of retaining live references", () => {
    const game = newGame(33);
    const input = buildPreActionInsightInput(game);
    const originalStack = input.players[0].stack;

    game.players[0].stack = 0;
    game.legal.callAmount += 7;
    game.log.push({
      street: game.street,
      actorSeat: 0,
      actor: game.players[0].name,
      kind: "check",
      action: "过牌",
      amount: 0,
      toAmount: game.players[0].streetBet,
      potBefore: game.pot,
      potAfter: game.pot,
    });

    expect(input.players[0].stack).toBe(originalStack);
    expect(input.legal.callAmount).not.toBe(game.legal.callAmount);
    expect(input.actions).toHaveLength(0);
  });
});
