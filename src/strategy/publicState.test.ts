import { describe, expect, it } from "vitest";
import { applyHeroAction, newGame } from "../game/game";
import { buildPublicDecisionState } from "./publicState";

describe("public poker decision state", () => {
  it("never exposes unshown opponent hole cards", () => {
    const game = newGame(42);
    const publicState = buildPublicDecisionState(game, game.heroSeat);
    const serialized = JSON.stringify(publicState);

    for (const opponent of game.players.filter((player) => player.seat !== game.heroSeat)) {
      for (const card of opponent.hole) expect(serialized).not.toContain(card);
    }
    expect(publicState.heroHole).toEqual(game.players[game.heroSeat].hole);
    expect(publicState.players.every((player) => !("hole" in player))).toBe(true);
  });

  it("preserves chips moved, pot before, pot after, and street total separately", () => {
    const initial = newGame(42);
    const acted = applyHeroAction(initial, { type: "call" });
    const publicState = buildPublicDecisionState(acted, acted.pending[0]);
    const actual = acted.log.at(-1)!;

    expect(publicState.actions.at(-1)).toEqual({
      street: actual.street,
      actorSeat: actual.actorSeat,
      kind: actual.kind,
      amount: actual.amount,
      toAmount: actual.toAmount,
      potBefore: actual.potBefore,
      potAfter: actual.potAfter,
    });
    expect(actual.potAfter - actual.potBefore!).toBe(actual.amount);
  });

  it("rebuilds the same public state from the same seeded hand", () => {
    const first = newGame(77);
    const replay = newGame(77);
    expect(buildPublicDecisionState(replay, replay.heroSeat)).toEqual(
      buildPublicDecisionState(first, first.heroSeat),
    );
  });
});
