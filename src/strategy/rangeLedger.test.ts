import { describe, expect, it } from "vitest";
import { applyHeroAction, newGame } from "../game/game";
import { rangeFingerprint } from "../policy/rangeModel";
import { buildPublicDecisionState } from "./publicState";
import {
  applyPublicAction,
  buildRangeLedger,
  createRangeLedger,
  snapshotRangeLedger,
} from "./rangeLedger";

describe("per-seat range ledger", () => {
  it("creates a full positive combo distribution for every opponent seat", () => {
    const game = newGame(42);
    const state = buildPublicDecisionState(game, game.heroSeat);
    const ledger = createRangeLedger(state);
    const opponentSeats = state.players
      .filter((player) => player.seat !== state.actingSeat)
      .map((player) => player.seat);

    expect(Object.keys(ledger.bySeat).map(Number).sort((a, b) => a - b)).toEqual(
      opponentSeats.sort((a, b) => a - b),
    );
    for (const seat of opponentSeats) {
      const range = ledger.bySeat[seat];
      expect(range).toHaveLength(1225);
      expect(range.every((combo) => combo.weight > 0)).toBe(true);
      expect(range.reduce((sum, combo) => sum + combo.weight, 0)).toBeCloseTo(1, 10);
    }
  });

  it("updates only the acting opponent range", () => {
    const afterHero = applyHeroAction(newGame(42), { type: "call" });
    const state = buildPublicDecisionState(afterHero, afterHero.pending[0]);
    const before = createRangeLedger(state);
    const action = state.actions.at(-1)!;
    const after = applyPublicAction(before, state, action);

    expect(rangeFingerprint(after.bySeat[action.actorSeat])).not.toBe(
      rangeFingerprint(before.bySeat[action.actorSeat]),
    );
    const untouched = state.players.find(
      (player) => player.seat !== action.actorSeat && player.seat !== state.actingSeat,
    )!;
    expect(rangeFingerprint(after.bySeat[untouched.seat])).toBe(
      rangeFingerprint(before.bySeat[untouched.seat]),
    );
  });

  it("excludes only legally known cards and never hidden opponent cards", () => {
    const game = newGame(84);
    const state = buildPublicDecisionState(game, game.heroSeat);
    const ledger = createRangeLedger(state);
    const known = new Set([...state.heroHole, ...state.board]);
    const hidden = game.players.find((player) => player.seat !== game.heroSeat)!.hole[0];

    expect(Object.values(ledger.bySeat).every((range) =>
      range.every((combo) => combo.cards.every((card) => !known.has(card))),
    )).toBe(true);
    expect(Object.values(ledger.bySeat).some((range) =>
      range.some((combo) => combo.cards.includes(hidden)),
    )).toBe(true);
  });

  it("replays an identical serializable snapshot", () => {
    const first = buildPublicDecisionState(newGame(77), newGame(77).heroSeat);
    const replayGame = newGame(77);
    const replay = buildPublicDecisionState(replayGame, replayGame.heroSeat);
    expect(snapshotRangeLedger(createRangeLedger(replay))).toEqual(
      snapshotRangeLedger(createRangeLedger(first)),
    );
  });

  it("rebuilds the ledger through every visible action in order", () => {
    const afterHero = applyHeroAction(newGame(121), { type: "call" });
    const state = buildPublicDecisionState(afterHero, afterHero.pending[0]);
    const initial = createRangeLedger(state);
    const rebuilt = buildRangeLedger(state);
    const actorSeat = state.actions.at(-1)!.actorSeat;

    expect(rebuilt.lastActionIndex).toBe(state.actions.length - 1);
    expect(rangeFingerprint(rebuilt.bySeat[actorSeat])).not.toBe(
      rangeFingerprint(initial.bySeat[actorSeat]),
    );
  });
});
