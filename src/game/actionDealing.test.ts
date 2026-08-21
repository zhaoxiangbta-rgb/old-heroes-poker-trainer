import { describe, expect, it } from "vitest";
import { createDeck } from "../engine/cards";
import { newGame, type GameState } from "./game";
import {
  isActionCandidate,
  newActionGame,
  nextActionHand,
  selectActionCandidate,
} from "./actionDealing";

function allCards(state: GameState) {
  return [
    ...state.players.flatMap((player) => player.hole),
    ...state.board,
    ...state.burn,
    ...state.deck,
  ];
}

describe("action-enhanced dealing", () => {
  it("selects the first qualifying seed from a bounded twelve-seed window", () => {
    const baseSeed = 1;
    const expected = Array.from({ length: 12 }, (_, offset) =>
      newGame(baseSeed + offset),
    ).find(isActionCandidate) ?? newGame(baseSeed + 11);

    const selected = newActionGame(baseSeed);

    expect(selected.seed).toBe(expected.seed);
    expect(selected).toEqual(newActionGame(baseSeed));
  });

  it("qualifies from dealt holes and positions without reading the future deck", () => {
    const state = newGame(42);
    const changedFuture = structuredClone(state);
    changedFuture.deck.reverse();

    expect(isActionCandidate(changedFuture)).toBe(isActionCandidate(state));
  });

  it("falls back to the twelfth legal candidate when none qualify", () => {
    const weakHoles = [
      ["2c", "7d"],
      ["2d", "7c"],
      ["3c", "8d"],
      ["3d", "8c"],
      ["4c", "9d"],
      ["4d", "9c"],
    ] as const;
    const create = (seed: number) => {
      const state = newGame(seed);
      state.players.forEach((player, index) => {
        player.hole = [...weakHoles[index]];
      });
      return state;
    };

    const selected = selectActionCandidate(700, create);

    expect(selected.seed).toBe(711);
    expect(isActionCandidate(selected)).toBe(false);
  });

  it("keeps every generated deck legal and unique", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const cards = allCards(newActionGame(seed));
      expect(cards).toHaveLength(52);
      expect(new Set(cards)).toEqual(new Set(createDeck()));
    }
  });

  it("preserves the session ledger while forcing an ordinary next hand", () => {
    const state = newGame(42);
    state.trainingTarget = { mode: "automatic", tag: "multiway-top-pair" };
    state.players[0].stack = 0;
    state.players[0].buyIn = 200;
    state.players[0].rebuys = 0;

    const next = nextActionHand(state, { tableProfileId: "friends" });
    const rebought = next.players.find((player) => player.name === state.players[0].name)!;

    expect(next.handNo).toBe(state.handNo + 1);
    expect(next.seed).toBeGreaterThanOrEqual(state.seed + 1);
    expect(next.seed).toBeLessThanOrEqual(state.seed + 12);
    expect(next.trainingTarget).toEqual({ mode: "none" });
    expect(next.tableProfileId).toBe("friends");
    expect(rebought).toMatchObject({ stack: 200, buyIn: 400, rebuys: 1 });
  });
});
