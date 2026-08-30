import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { captureHeroDecision } from "./capture";

describe("deep review decision capture", () => {
  it("captures legal facts without unrevealed opponent holes", () => {
    const game = newGame(42);
    const opponent = game.players.find((player) => player.seat !== game.heroSeat)!;
    expect(opponent.revealed).toBe(false);

    const snapshot = captureHeroDecision(game);

    expect(snapshot.legal).toEqual(game.legal);
    expect(snapshot.heroHole).toEqual(game.players[game.heroSeat].hole);
    expect(snapshot.visiblePlayers.find((player) => player.seat === opponent.seat)?.hole)
      .toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain(opponent.hole.join(""));
  });

  it("includes only a revealed showdown opponent hole", () => {
    const game = newGame(42);
    const opponent = game.players.find((player) => player.seat !== game.heroSeat)!;
    opponent.revealed = true;

    const snapshot = captureHeroDecision(game);

    expect(snapshot.visiblePlayers.find((player) => player.seat === opponent.seat)?.hole)
      .toEqual(opponent.hole);
  });
});
