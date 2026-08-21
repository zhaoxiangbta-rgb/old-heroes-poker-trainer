import { describe, expect, it } from "vitest";
import { newGame, normalizeGameState, type Street } from "./game";
import {
  durationFor,
  planAfterHero,
  planInitialDeal,
  thinkingDuration,
} from "./playback";

function allInShowdownState(street: Street) {
  const state = newGame(42, 1, undefined, [
    { name: "你", stack: 200, buyIn: 200, rebuys: 0 },
    { name: "青禾", stack: 200, buyIn: 200, rebuys: 0 },
  ]);
  const hero = state.players[state.heroSeat];
  const villain = state.players.find((player) => player.seat !== state.heroSeat)!;

  while (state.street !== street) {
    if (state.street === "preflop") {
      state.street = "flop";
      state.burn.push(state.deck.shift()!);
      state.board.push(...state.deck.splice(0, 3));
      continue;
    }
    state.street = state.street === "flop" ? "turn" : "river";
    state.burn.push(state.deck.shift()!);
    state.board.push(state.deck.shift()!);
  }

  hero.folded = false;
  hero.revealed = true;
  hero.allIn = false;
  hero.stack = 40;
  hero.streetBet = 10;
  hero.totalBet = 10;

  villain.folded = false;
  villain.revealed = false;
  villain.allIn = true;
  villain.stack = 0;
  villain.streetBet = 50;
  villain.totalBet = 50;

  state.players.forEach((player) => {
    if (player.seat !== hero.seat && player.seat !== villain.seat) {
      player.folded = true;
      player.revealed = false;
      player.allIn = false;
      player.stack = 200;
      player.streetBet = 0;
      player.totalBet = 0;
    }
  });

  state.phase = "playing";
  state.pot = 60;
  state.currentBet = 50;
  state.minRaise = 2;
  state.pending = [hero.seat];
  state.toAct = hero.seat;
  state.log = [];
  state.result = undefined;
  state.raiseToReopen = state.players.map(() => 0);
  state.policyDecisions = [];

  return normalizeGameState(state);
}

function botClosesAllInState() {
  const state = newGame(40, 1, undefined, [
    { name: "你", stack: 200, buyIn: 200, rebuys: 0 },
    { name: "青禾", stack: 200, buyIn: 200, rebuys: 0 },
  ]);
  const hero = state.players[state.heroSeat];
  const villain = state.players.find((player) => player.seat !== state.heroSeat)!;
  expect(villain.hole).toEqual(["Qs", "Qd"]);
  hero.stack = 49;
  hero.streetBet = 1;
  hero.totalBet = 1;
  hero.allIn = false;
  villain.stack = 48;
  villain.streetBet = 2;
  villain.totalBet = 2;
  villain.allIn = false;
  state.pot = 3;
  state.currentBet = 2;
  state.minRaise = 2;
  state.pending = [hero.seat];
  state.toAct = hero.seat;
  state.log = [];
  state.result = undefined;
  state.raiseToReopen = state.players.map(() => 0);
  state.policyDecisions = [];
  return normalizeGameState(state);
}

describe("poker action playback planning", () => {
  it("deals two real seat-order rounds before the first action", () => {
    const state = newGame(42);
    const firstToDeal = (state.button + 1) % state.players.length;
    const seatOrder = Array.from(
      { length: state.players.length },
      (_, index) => (firstToDeal + index) % state.players.length,
    );
    const frames = planInitialDeal(state, 1, false);
    const dealt = frames.filter((frame) => frame.phase === "dealing-hole");

    expect(dealt).toHaveLength(state.players.length * 2);
    expect(dealt.map((frame) => frame.dealCard?.seat)).toEqual([
      ...seatOrder,
      ...seatOrder,
    ]);
    expect(dealt.map((frame) => frame.dealCard?.cardIndex)).toEqual([
      ...state.players.map(() => 0),
      ...state.players.map(() => 1),
    ]);
    expect(dealt.every((frame) => frame.durationMs === 70)).toBe(true);
    expect(frames.at(-1)?.phase).toBe("hero-turn");
  });

  it("shortens initial dealing without changing its order for reduced motion", () => {
    const state = newGame(42);
    const normal = planInitialDeal(state, 1, false);
    const reduced = planInitialDeal(state, 1, true);

    expect(reduced.map((frame) => frame.dealCard)).toEqual(
      normal.map((frame) => frame.dealCard),
    );
    expect(Math.max(...reduced.map((frame) => frame.durationMs))).toBeLessThan(100);
  });

  it("keeps six-seat initial dealing fast and consistent across motion settings", () => {
    const state = newGame(42);
    const elapsed = (reducedMotion: boolean) =>
      planInitialDeal(state, 1, reducedMotion).reduce(
        (total, frame) => total + frame.durationMs - frame.overlapMs,
        0,
      );

    expect(elapsed(false)).toBeLessThanOrEqual(1_000);
    expect(elapsed(false) - elapsed(true)).toBeLessThanOrEqual(400);
  });

  it("keeps routine automatic action frames below perceptible blocking latency", () => {
    const frames = planAfterHero(newGame(42), { type: "call" }, 2, false);
    const routine = frames.filter(
      (frame) =>
        frame.phase !== "hero-turn" &&
        frame.phase !== "hand-complete" &&
        frame.effect !== "all-in",
    );

    expect(Math.max(...routine.map((frame) => frame.durationMs))).toBeLessThanOrEqual(120);
  });

  it("reveals the flop one visible board card at a time", () => {
    const frames = planAfterHero(newGame(1), { type: "call" }, 10, false);
    const flop = frames.filter(
      (frame) => frame.phase === "dealing" && frame.state.street === "flop",
    );

    expect(flop.map((frame) => frame.visibleBoardCount)).toEqual([1, 2, 3]);
    expect(flop.every((frame) => frame.state.board.length === 3)).toBe(true);
  });

  it.each([
    ["preflop", ["flop", "flop", "flop", "turn", "river"], [3, 3, 3, 4, 5], [1, 2, 3, 4, 5]],
    ["flop", ["turn", "river"], [4, 5], [4, 5]],
    ["turn", ["river"], [5], [5]],
  ] as const)(
    "plays each missing board card after an all-in on the %s",
    (street, streets, boardCounts, visibleBoardCounts) => {
      const frames = planAfterHero(allInShowdownState(street), { type: "call" }, 10, false);
      const runout = frames.filter((frame) => frame.phase === "dealing");

      expect(runout.map((frame) => frame.state.street)).toEqual(streets);
      expect(runout.map((frame) => frame.state.board.length)).toEqual(boardCounts);
      expect(runout.map((frame) => frame.visibleBoardCount)).toEqual(visibleBoardCounts);
      expect(runout.every((frame) => frame.state.phase === "playing")).toBe(true);
    },
  );

  it.each([
    ["preflop", 11],
    ["river", 12],
  ] as const)(
    "shows a reveal-only frame before settlement on the %s",
    (street, actionId) => {
      const state = allInShowdownState(street);
      const villainSeat = state.players.find(
        (player) => player.seat !== state.heroSeat,
      )!.seat;
      const frames = planAfterHero(state, { type: "call" }, actionId, false);
      const revealIndex = frames.findIndex((frame) => frame.phase === "showdown");
      const firstCollectIndex = frames.findIndex(
        (frame) => frame.phase === "settling-pot",
      );

      expect(revealIndex).toBeGreaterThanOrEqual(0);
      expect(firstCollectIndex).toBeGreaterThanOrEqual(0);
      for (const frame of frames.slice(firstCollectIndex, revealIndex)) {
        expect(frame.state.players[villainSeat].revealed).toBe(false);
        expect(frame.state.result).toBeUndefined();
        expect(frame.state.pot).toBe(100);
      }

      const reveal = frames[revealIndex];
      expect(reveal.effect).toBe("reveal");
      expect(reveal.state.players[villainSeat].revealed).toBe(true);
      expect(reveal.state.result).toBeUndefined();
      expect(reveal.state.pot).toBe(100);

      const settled = frames[revealIndex + 1];
      expect(settled.phase).toBe("settling-pot");
      expect(settled.effect).toBe("collect");
      expect(settled.state.players[villainSeat].revealed).toBe(true);
      expect(settled.state.result?.reason).toBe("showdown");
      expect(settled.state.pot).toBe(0);
    },
  );

  it("never batches two opponent actions into one visible action frame", () => {
    const initial = newGame(42);
    const frames = planAfterHero(initial, { type: "call" }, 1, false);
    const actions = frames.filter(
      (frame) =>
        frame.phase === "animating-chips" &&
        frame.action?.actor !== "你",
    );
    expect(actions.length).toBeGreaterThan(1);
    for (let index = 1; index < actions.length; index++) {
      expect(
        actions[index].state.log.length - actions[index - 1].state.log.length,
      ).toBe(1);
    }
  });

  it("runs out immediately when the final bot action calls all-in", () => {
    const state = botClosesAllInState();
    const villainSeat = state.players.find(
      (player) => player.seat !== state.heroSeat,
    )!.seat;
    const frames = planAfterHero(state, { type: "raise", to: 50 }, 78, false);
    const botActionIndex = frames.findIndex(
      (frame) => frame.actorSeat === villainSeat && frame.action?.kind === "all-in",
    );

    expect(botActionIndex).toBeGreaterThanOrEqual(0);
    expect(frames.slice(botActionIndex + 1).map((frame) => frame.phase)).toEqual([
      "animating-chips",
      "settling-pot",
      "dealing",
      "dealing",
      "dealing",
      "dealing",
      "dealing",
      "showdown",
      "settling-pot",
      "hand-complete",
    ]);
    expect(
      frames.slice(botActionIndex + 1).some((frame) => frame.phase === "hero-turn"),
    ).toBe(false);
  });

  it("announces each opponent turn before showing that action", () => {
    const frames = planAfterHero(newGame(42), { type: "call" }, 2, false);
    for (const [index, frame] of frames.entries()) {
      if (frame.phase !== "bot-thinking") continue;
      const next = frames[index + 1];
      expect(next.phase).toBe("animating-chips");
      expect(next.actorSeat).toBe(frame.actorSeat);
      expect(next.state.log.length).toBe(frame.state.log.length + 1);
    }
  });

  it("uses deterministic standard timings", () => {
    expect(durationFor(42, 3, "submitting", false)).toBe(20);
    expect(durationFor(42, 3, "bot-thinking", false)).toBeGreaterThanOrEqual(70);
    expect(durationFor(42, 3, "bot-thinking", false)).toBeLessThanOrEqual(110);
    expect(durationFor(42, 3, "bot-thinking", false)).toBe(
      durationFor(42, 3, "bot-thinking", false),
    );
    expect(durationFor(42, 3, "animating-chips", false)).toBeGreaterThanOrEqual(70);
    expect(durationFor(42, 3, "animating-chips", false)).toBeLessThanOrEqual(100);
    expect(durationFor(42, 3, "settling-pot", false)).toBe(70);
    expect(durationFor(42, 3, "dealing", false)).toBe(90);
  });

  it.each([
    ["check", 45, 70],
    ["fold", 45, 70],
    ["call", 55, 85],
    ["bet", 70, 110],
    ["raise", 70, 110],
  ] as const)(
    "paces %s thinking between %d and %d ms",
    (kind, minimum, maximum) => {
      const value = thinkingDuration(42, 9, kind, false);
      expect(value).toBeGreaterThanOrEqual(minimum);
      expect(value).toBeLessThanOrEqual(maximum);
    },
  );

  it("emits a single all-in presentation only for a real all-in", () => {
    const state = newGame(42);
    const frames = planAfterHero(
      state,
      { type: "raise", to: state.legal.maxRaiseTo },
      8,
      false,
    );
    expect(
      frames.filter(
        (frame) =>
          frame.effect === "all-in" && frame.actorSeat === state.heroSeat,
      ),
    ).toHaveLength(1);
    expect(frames.find((frame) => frame.effect === "all-in")?.durationMs).toBe(180);
    expect(
      planAfterHero(newGame(42), { type: "call" }, 9, false).filter(
        (frame) => frame.effect === "all-in",
      ),
    ).toHaveLength(0);
  });

  it("collects bets before dealing the next street", () => {
    const effects = planAfterHero(newGame(1), { type: "call" }, 3, false).map(
      (frame) => frame.effect,
    );
    const collect = effects.indexOf("collect");
    const deal = effects.indexOf("deal");
    expect(collect).toBeGreaterThanOrEqual(0);
    expect(deal).toBeGreaterThan(collect);
  });

  it("keeps event order while shortening reduced motion", () => {
    const normal = planAfterHero(newGame(42), { type: "call" }, 7, false);
    const reduced = planAfterHero(newGame(42), { type: "call" }, 7, true);
    expect(reduced.map((frame) => frame.phase)).toEqual(
      normal.map((frame) => frame.phase),
    );
    expect(Math.max(...reduced.map((frame) => frame.durationMs))).toBeLessThan(
      100,
    );
  });
});
