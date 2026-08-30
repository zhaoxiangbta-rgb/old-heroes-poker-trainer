import { describe, expect, it } from "vitest";
import { DEFAULT_PLAYER_PROFILES } from "../policy/playerProfiles";
import {
  FRIEND_NAMES,
  act,
  actionForTarget,
  advanceIfRoundComplete,
  applyHeroAction,
  applyNextBotAction,
  currentPrompt,
  newGame,
  nextHand,
  normalizeGameState,
  positionLabel,
  type GameState,
} from "./game";

function playChecksToEnd(initial: GameState) {
  let s = initial,
    guard = 0;
  while (s.phase === "playing" && guard++ < 60) {
    const legal = s.legal;
    s = act(
      s,
      legal.canCheck
        ? { type: "check" }
        : legal.canCall
          ? { type: "call" }
          : { type: "fold" },
    );
  }
  return s;
}

const STRATEGY_STRESS_CHUNKS = [6, 2].flatMap((playerCount) =>
  Array.from(
    { length: Math.ceil(__STRATEGY_STRESS_HANDS__ / 1_000) },
    (_, index) => ({
      playerCount,
      firstSeed: index * 1_000 + 1,
      lastSeed: Math.min((index + 1) * 1_000, __STRATEGY_STRESS_HANDS__),
    }),
  ),
);
describe("playable hand loop", () => {
  it("allows the hero to fold instead of checking when action is unopened", () => {
    const state = newGame(42);
    state.currentBet = state.players[state.heroSeat].streetBet;
    state.legal = {
      ...state.legal,
      canFold: true,
      canCheck: true,
      canCall: false,
      callAmount: 0,
    };
    expect(applyHeroAction(state, { type: "fold" }).players[state.heroSeat].folded).toBe(true);
  });
  it("posts blinds, labels all six positions, deals unique cards and waits for hero", () => {
    const s = newGame(42);
    expect(s.players).toHaveLength(6);
    expect(new Set(s.players.map((p) => p.position))).toEqual(
      new Set(["BTN", "SB", "BB", "UTG", "HJ", "CO"]),
    );
    expect(s.pot).toBeGreaterThanOrEqual(3);
    expect(s.street).toBe("preflop");
    expect(s.players[s.heroSeat].hole).toHaveLength(2);
    expect(new Set(s.players.flatMap((p) => p.hole))).toHaveLength(12);
    expect(s.toAct).toBe(s.heroSeat);
  });
  it("randomizes hero position across seeded hands", () => {
    const positions = new Set(
      Array.from({ length: 180 }, (_, i) => {
        const state = newGame(i + 1);
        return state.players[state.heroSeat].position;
      }),
    );
    expect(positions.size).toBe(6);
  }, 30_000);
  it("uses five deterministic friends and Chinese position labels", () => {
    const first = newGame(42);
    const replay = newGame(42);
    const friends = first.players
      .filter((player) => player.seat !== first.heroSeat)
      .map((player) => player.name);
    expect(friends).toHaveLength(5);
    expect(new Set(friends).size).toBe(5);
    expect(FRIEND_NAMES).toEqual(expect.arrayContaining(friends));
    expect(replay.players.map((player) => player.name)).toEqual(
      first.players.map((player) => player.name),
    );
    expect(positionLabel("UTG")).toEqual({
      name: "枪口位",
      abbreviation: "UTG",
    });
  });
  it("applies a hero action, resolves bots and advances streets", () => {
    let s = newGame(7);
    s = act(s, { type: "call" });
    expect(s.log.some((x) => x.actor !== "你")).toBe(true);
    expect(["preflop", "flop", "turn", "river"]).toContain(s.street);
    expect(s.pot).toBeGreaterThanOrEqual(3);
  });
  it("applies exactly one hero action without resolving opponents", () => {
    const before = newGame(42);
    const after = applyHeroAction(before, { type: "call" });
    expect(after.log).toHaveLength(before.log.length + 1);
    expect(after.log.at(-1)?.actor).toBe("你");
    expect(after.toAct).not.toBe(after.heroSeat);
    expect(before.log).toHaveLength(after.log.length - 1);
    expect(after.log.at(-1)).toMatchObject({
      actorSeat: before.heroSeat,
      kind: "call",
      toAmount: before.currentBet,
    });
  });
  it("applies exactly one opponent action per atomic call", () => {
    const heroDone = applyHeroAction(newGame(42), { type: "call" });
    const botDone = applyNextBotAction(heroDone);
    expect(botDone.log).toHaveLength(heroDone.log.length + 1);
    expect(botDone.log.at(-1)?.actor).not.toBe("你");
    expect(heroDone.log).toHaveLength(newGame(42).log.length + 1);
  });
  it("records one auditable local-policy decision for each opponent action", () => {
    const heroDone = applyHeroAction(newGame(42), { type: "call" });
    const before = heroDone.policyDecisions.length;
    const botDone = applyNextBotAction(heroDone);
    const record = botDone.policyDecisions.at(-1)!;
    expect(botDone.policyDecisions).toHaveLength(before + 1);
    expect(record).toMatchObject({
      seat: heroDone.pending[0],
      street: heroDone.street,
      logIndex: heroDone.log.length,
    });
    expect(record.decision.candidates.length).toBeGreaterThan(0);
    expect(record.decision.facts).toEqual(
      expect.objectContaining({ spr: expect.any(Number), sampled: expect.any(Number) }),
    );
    expect(JSON.stringify(record)).not.toMatch(/hole|opponentHole/i);
  });
  it("records the exact unified strategy result used by each opponent action", () => {
    const heroDone = applyHeroAction(newGame(42), { type: "call" });
    const before = heroDone.strategyDecisions.length;
    const botDone = applyNextBotAction(heroDone);
    const record = botDone.strategyDecisions.at(-1)!;
    expect(botDone.strategyDecisions).toHaveLength(before + 1);
    expect(record).toMatchObject({
      seat: heroDone.pending[0],
      street: heroDone.street,
      logIndex: heroDone.log.length,
      result: {
        strategyVersion: "strategy-v4.0.0",
        source: "strategy-pack-v3",
      },
    });
    expect(record.result.actions).toContainEqual(
      expect.objectContaining({ action: record.selectedAction }),
    );
    expect(JSON.stringify(record)).not.toMatch(/opponentHole/i);
  });
  it("replays local-policy choices and decision facts exactly from the same seed", () => {
    const first = act(newGame(77), { type: "call" });
    const replay = act(newGame(77), { type: "call" });
    expect(replay.policyDecisions).toEqual(first.policyDecisions);
    expect(replay.log).toEqual(first.log);
  });
  it("pins the table profile, player profiles and training target into a version-eight hand", () => {
    const state = newGame(42, 1, undefined, undefined, {
      tableProfileId: "friends",
      trainingTarget: { mode: "manual", tag: "multiway-top-pair" },
    });
    expect(state).toMatchObject({
      version: 9,
      strategyVersion: "strategy-v4.0.0",
      tableProfileId: "friends",
      trainingTarget: { mode: "manual", tag: "multiway-top-pair" },
      assessments: [],
      assessmentStatus: "ready",
    });
    const opponents = state.players.filter((player) => player.playerId !== "hero");
    expect(new Set(opponents.map((player) => player.playerId)).size).toBe(5);
    expect(opponents.every((player) => player.profile?.effective)).toBe(true);
    expect(state.friendBankrolls).toHaveLength(6);
  });
  it("applies a changed table profile only to the next hand", () => {
    const current = newGame(99, 1, undefined, undefined, {
      tableProfileId: "friends",
    });
    const next = nextHand(current, { tableProfileId: "loose-wild" });
    expect(current.tableProfileId).toBe("friends");
    expect(next.tableProfileId).toBe("loose-wild");
    expect(next.handNo).toBe(current.handNo + 1);
  });
  it("folding lets opponents finish but preserves every folded hole card", () => {
    const s = act(newGame(11), { type: "fold" });
    expect(s.phase).toBe("review");
    expect(s.players[s.heroSeat].folded).toBe(true);
    expect(s.players.filter((p) => p.folded).every((p) => !p.revealed)).toBe(
      true,
    );
  });
  it("can play a whole hand to a deterministic settlement and start the next one", () => {
    const done = playChecksToEnd(newGame(99));
    expect(done.phase).toBe("review");
    expect(done.result).toBeDefined();
    expect(done.players.reduce((n, p) => n + p.stack, 0) + done.pot).toBe(1200);
    const n = nextHand(done);
    expect(n.handNo).toBe(2);
    expect(n.phase).toBe("playing");
  });
  it("keeps all six bankrolls attached to stable identities when the next hand rotates friends", () => {
    const done = newGame(99);
    done.phase = "review";
    done.players.forEach((player, seat) => {
      player.stack = 125 + seat * 37;
      player.buyIn = 200;
      player.rebuys = 0;
    });
    const omitted = done.friendBankrolls.find(
      (record) => !done.players.some((player) => player.playerId === record.playerId),
    )!;

    const next = nextHand(done, { playerProfiles: [...DEFAULT_PLAYER_PROFILES] });

    expect(next.friendBankrolls.find((record) => record.playerId === omitted.playerId)).toEqual(
      omitted,
    );
    for (const player of done.players.filter((player) => player.playerId !== "hero")) {
      expect(next.friendBankrolls.find((record) => record.playerId === player.playerId)).toEqual(
        expect.objectContaining({ stack: player.stack }),
      );
    }
  });
  it("records an automatic 200 chip rebuy before the next hand", () => {
    const done = newGame(101);
    done.phase = "review";
    const busted = done.players.find((player) => player.name !== "你")!;
    busted.stack = 0;
    busted.buyIn = 200;
    busted.rebuys = 0;

    const next = nextHand(done);
    const rebought = next.friendBankrolls.find(
      (record) => record.playerId === busted.playerId,
    )!;

    expect(rebought.stack).toBe(200);
    expect(rebought.buyIn).toBe(400);
    expect(rebought.rebuys).toBe(1);
  });
  it("rejects an illegal custom raise", () => {
    const s = newGame(5);
    expect(() => act(s, { type: "raise", to: s.legal.minRaiseTo - 1 })).toThrow(
      /合法/,
    );
  });
  it("maps a numeric street total to call or raise without ambiguous buttons", () => {
    const s = newGame(42);
    const callTo = s.players[s.heroSeat].streetBet + s.legal.callAmount;
    expect(actionForTarget(s, callTo)).toEqual({ type: "call" });
    expect(actionForTarget(s, s.legal.minRaiseTo)).toEqual({
      type: "raise",
      to: s.legal.minRaiseTo,
    });
    expect(() => actionForTarget(s, callTo - 1)).toThrow(/至少/);
  });
  it("exposes the current speaker, amount to call and latest opponent action", () => {
    const s = newGame(42);
    const prompt = currentPrompt(s);
    expect(prompt.actor).toBe("你");
    expect(prompt.position).toBe(s.players[s.heroSeat].position);
    expect(prompt.toCall).toBe(s.legal.callAmount);
    expect(prompt.currentBet).toBe(s.currentBet);
    expect(prompt.latestAction).toEqual(s.log.at(-1));
  });

  it("settles every all-in side pot against only its eligible players", () => {
    const state = newGame(42);
    state.street = "river";
    state.board = ["2c", "3d", "7h", "9s", "Jc"];
    state.players.forEach((player, seat) => {
      player.folded = seat > 2;
      player.allIn = seat <= 2;
      player.stack = 0;
      player.streetBet = 0;
      player.totalBet = [50, 100, 200, 0, 0, 0][seat];
    });
    state.players[0].hole = ["Ah", "As"];
    state.players[1].hole = ["Kh", "Ks"];
    state.players[2].hole = ["Qh", "Qs"];
    state.pot = 350;
    state.pending = [];

    const settled = advanceIfRoundComplete(state);

    expect(settled.players.slice(0, 3).map((player) => player.stack)).toEqual([
      150, 100, 100,
    ]);
    expect(settled.result?.showdown).toEqual([
      {
        seat: 0,
        handName: "一对",
        bestCards: ["Ah", "As", "7h", "9s", "Jc"],
        tiebreak: [14, 11, 9, 7],
      },
      {
        seat: 1,
        handName: "一对",
        bestCards: ["Kh", "Ks", "7h", "9s", "Jc"],
        tiebreak: [13, 11, 9, 7],
      },
      {
        seat: 2,
        handName: "一对",
        bestCards: ["Qh", "Qs", "7h", "9s", "Jc"],
        tiebreak: [12, 11, 9, 7],
      },
    ]);
    expect(settled.result?.pots).toEqual([
      { label: "主池", amount: 150, eligible: [0, 1, 2], winners: [0] },
      { label: "边池 1", amount: 100, eligible: [1, 2], winners: [1] },
      { label: "未被跟注筹码", amount: 100, eligible: [2], winners: [2] },
    ]);
  });

  it("does not call an unmatched all-in refund a shared showdown win", () => {
    const state = newGame(42);
    state.street = "river";
    state.board = ["8c", "Qs", "2d", "8s", "Ts"];
    state.players.forEach((player, seat) => {
      player.folded = seat > 1;
      player.allIn = seat <= 1;
      player.stack = 0;
      player.streetBet = 0;
      player.totalBet = [234, 325, 4, 2, 2, 2][seat];
    });
    state.players[0].name = "青禾";
    state.players[0].hole = ["Jd", "9h"];
    state.players[1].name = "你";
    state.players[1].hole = ["Kd", "Ac"];
    state.pot = 569;
    state.pending = [];

    const settled = advanceIfRoundComplete(state);

    expect(settled.players.slice(0, 2).map((player) => player.stack)).toEqual([
      478, 91,
    ]);
    expect(settled.result?.winners).toEqual([0]);
    expect(settled.result?.summary).toBe(
      "青禾赢得 478 筹码；你收回未被跟注筹码 91",
    );
    expect(settled.result?.showdown).toEqual([
      {
        seat: 0,
        handName: "顺子",
        bestCards: ["Jd", "9h", "8c", "Qs", "Ts"],
        tiebreak: [12],
      },
      {
        seat: 1,
        handName: "一对",
        bestCards: ["Kd", "Ac", "8c", "Qs", "8s"],
        tiebreak: [8, 14, 13, 12],
      },
    ]);
    expect(settled.result?.pots).toEqual([
      { label: "主池", amount: 478, eligible: [0, 1], winners: [0] },
      { label: "未被跟注筹码", amount: 91, eligible: [1], winners: [1] },
    ]);
  });

  it("awards split-pot odd chips clockwise from the button", () => {
    const state = newGame(6);
    state.button = 0;
    state.street = "river";
    state.board = ["Th", "Jh", "Qh", "Kh", "Ah"];
    state.players.forEach((player, seat) => {
      player.folded = ![0, 2, 4].includes(seat);
      player.allIn = true;
      player.stack = 0;
      player.streetBet = 0;
      player.totalBet = seat < 5 ? 1 : 0;
      player.hole = ([
        ["2c", "3c"], ["4c", "5c"], ["6c", "7c"],
        ["8c", "9c"], ["2d", "3s"], ["4d", "5s"],
      ] as const)[seat].slice();
    });
    state.pot = 5;
    state.pending = [];

    const settled = advanceIfRoundComplete(state);

    expect(settled.players.map((player) => player.stack)).toEqual([
      1, 0, 2, 0, 2, 0,
    ]);
    expect(settled.result?.winners).toEqual([0, 2, 4]);
    expect(settled.result?.pots).toEqual([
      {
        label: "主池",
        amount: 5,
        eligible: [0, 2, 4],
        winners: [0, 2, 4],
      },
    ]);
  });

  it("finishes short-stack seeded hands without generating an illegal raise", () => {
    let state = newGame(1, 1, [3, 5, 9, 20, 50, 200]);
    for (let guard = 0; state.phase === "playing" && guard < 80; guard++) {
      state = act(
        state,
        state.legal.canCheck
          ? { type: "check" }
          : state.legal.canCall
            ? { type: "call" }
            : { type: "fold" },
      );
    }
    expect(state.phase).toBe("review");
    expect(state.players.reduce((sum, player) => sum + player.stack, 0)).toBe(
      287,
    );
  });

  it.each(STRATEGY_STRESS_CHUNKS)(
    "simulates $playerCount-player strategy seeds $firstSeed-$lastSeed legally",
    ({ playerCount, firstSeed, lastSeed }) => {
      const failures: string[] = [];
      let policyDecisions = 0;
      for (let seed = firstSeed; seed <= lastSeed; seed++) {
          // Two-chip stacks force every continuing player all-in preflop, so
          // the audit covers complete settlement without expensive repeated
          // postflop range enumeration.
          const initialStacks = Array(playerCount).fill(2);
          let state = newGame(seed, 1, initialStacks);
          if (state.phase === "playing")
            state = act(
              state,
              state.legal.canCall
                ? { type: "call" }
                : state.legal.canFold
                  ? { type: "fold" }
                  : { type: "check" },
            );
          const total =
            state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot;
          if (state.phase !== "review")
            failures.push(`未结束: seed ${seed}, players ${playerCount}`);
          if (total !== playerCount * 2)
            failures.push(`筹码不守恒: seed ${seed}, players ${playerCount}`);
          if (state.policyDecisions.some((record) => record.decision.facts.fallback))
            failures.push(`策略降级: seed ${seed}, players ${playerCount}`);
          policyDecisions += state.policyDecisions.length;
      }
      expect(failures).toEqual([]);
      expect(policyDecisions).toBeGreaterThanOrEqual(
        Math.floor((lastSeed - firstSeed + 1) / 2),
      );
    },
    60_000,
  );

  it("uses heads-up blind and action order when two stacks are supplied", () => {
    const state = newGame(8, 1, [200, 200]);
    expect(state.players).toHaveLength(2);
    expect(state.smallBlind).toBe(state.button);
    expect(state.bigBlind).toBe((state.button + 1) % 2);
    expect(state.log[0]?.actorSeat ?? state.toAct).toBe(state.button);
  });

  it("does not expose a raise after a short all-in failed to reopen action", () => {
    const state = newGame(42);
    state.raiseToReopen[state.heroSeat] = state.currentBet + state.minRaise;
    state.legal.canRaise = false;
    expect(() => actionForTarget(state, state.currentBet + state.minRaise)).toThrow(
      /重新开放/,
    );
  });
  it("rejects saved hands from an incompatible data generation", () => {
    const incompatible = { ...newGame(42), version: 5 } as unknown as GameState;
    expect(() => normalizeGameState(incompatible)).toThrow("牌局数据版本不兼容");
  });
});
