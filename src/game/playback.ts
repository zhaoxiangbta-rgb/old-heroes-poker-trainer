import {
  advanceIfRoundComplete,
  applyHeroAction,
  applyNextBotAction,
  isHeroTurn,
  type ActionKind,
  type GameAction,
  type GameLog,
  type GameState,
} from "./game";

export type PlaybackPhase =
  | "hero-turn"
  | "submitting"
  | "animating-chips"
  | "bot-thinking"
  | "settling-pot"
  | "dealing-hole"
  | "dealing"
  | "showdown"
  | "hand-complete";
export type VisualEffectKind =
  | "receipt"
  | "thinking"
  | "chips"
  | "fold"
  | "action-label"
  | "collect"
  | "deal"
  | "reveal"
  | "all-in";

export type PlaybackFrame = {
  id: number;
  phase: PlaybackPhase;
  state: GameState;
  actorSeat?: number;
  action?: GameLog;
  actionKind?: ActionKind;
  effect: VisualEffectKind;
  overlapMs: number;
  durationMs: number;
  dealCard?: { seat: number; cardIndex: 0 | 1 };
  visibleBoardCount?: number;
};

export function isNoActionPlayback(phase: PlaybackPhase) {
  return phase === "settling-pot" || phase === "dealing-hole" || phase === "dealing" || phase === "showdown";
}

function mixed(seed: number, actionId: number, salt: number) {
  let value = (seed ^ Math.imul(actionId + 1, 0x45d9f3b) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

export function durationFor(
  seed: number,
  actionId: number,
  phase: PlaybackPhase,
  reducedMotion: boolean,
) {
  if (phase === "hero-turn" || phase === "hand-complete") return 0;
  if (reducedMotion) return phase === "submitting" ? 20 : 40;
  if (phase === "submitting") return 20;
  if (phase === "bot-thinking")
    return 70 + (mixed(seed, actionId, 17) % 41);
  if (phase === "animating-chips")
    return 70 + (mixed(seed, actionId, 29) % 31);
  if (phase === "settling-pot") return 70;
  if (phase === "dealing-hole") return 70;
  if (phase === "dealing") return 90;
  if (phase === "showdown") return 100;
  return 20;
}

export function thinkingDuration(
  seed: number,
  frameId: number,
  kind: ActionKind,
  reducedMotion: boolean,
) {
  if (reducedMotion) return 40;
  const [minimum, maximum] =
    kind === "check" || kind === "fold"
      ? [45, 70]
      : kind === "call"
        ? [55, 85]
        : [70, 110];
  return minimum + (mixed(seed, frameId, 41) % (maximum - minimum + 1));
}

function effectFor(action: GameLog): VisualEffectKind {
  if (action.kind === "fold") return "fold";
  if (action.kind === "check") return "action-label";
  return "chips";
}

function livePlayerCount(state: GameState) {
  return state.players.filter((player) => !player.folded).length;
}

function actionablePlayerCount(state: GameState) {
  return state.players.filter((player) => !player.folded && !player.allIn).length;
}

function shouldRunoutShowdown(state: GameState) {
  return (
    state.phase === "playing" &&
    !state.pending.length &&
    state.street !== "river" &&
    livePlayerCount(state) > 1 &&
    actionablePlayerCount(state) <= 1
  );
}

function dealRunoutStreet(state: GameState) {
  const next = structuredClone(state);
  next.players.forEach((player) => {
    player.streetBet = 0;
  });
  next.currentBet = 0;
  next.minRaise = 2;
  next.raiseToReopen = next.players.map(() => 0);
  next.pending = [];
  next.toAct = -1;
  next.legal = {
    canFold: false,
    canCheck: false,
    canCall: false,
    canRaise: false,
    callAmount: 0,
    minRaiseTo: 0,
    maxRaiseTo: 0,
  };
  if (next.street === "preflop") {
    next.street = "flop";
    next.burn.push(next.deck.shift()!);
    next.board.push(...next.deck.splice(0, 3));
  } else {
    next.street = next.street === "flop" ? "turn" : "river";
    next.burn.push(next.deck.shift()!);
    next.board.push(next.deck.shift()!);
  }
  return next;
}

function runoutSnapshots(state: GameState) {
  const snapshots: GameState[] = [];
  let current = state;
  while (current.street !== "river") {
    current = dealRunoutStreet(current);
    snapshots.push(current);
  }
  return snapshots;
}

function revealSnapshot(state: GameState) {
  const next = structuredClone(state);
  next.players.forEach((player) => {
    if (!player.folded) player.revealed = true;
  });
  next.result = undefined;
  return next;
}

export function planInitialDeal(
  state: GameState,
  sequenceId: number,
  reducedMotion = false,
): PlaybackFrame[] {
  const playerCount = state.players.length;
  const firstToDeal = playerCount === 2
    ? state.button
    : (state.button + 1) % playerCount;
  const seatOrder = Array.from(
    { length: playerCount },
    (_, index) => (firstToDeal + index) % playerCount,
  );
  const frames: PlaybackFrame[] = [];
  let frameId = sequenceId * 1000;
  for (const cardIndex of [0, 1] as const) {
    for (const seat of seatOrder) {
      frames.push({
        id: frameId++,
        phase: "dealing-hole",
        state,
        actorSeat: seat,
        effect: "deal",
        overlapMs: 0,
        durationMs: reducedMotion ? 40 : 70,
        dealCard: { seat, cardIndex },
        visibleBoardCount: 0,
      });
    }
  }
  frames.push({
    id: frameId,
    phase: isHeroTurn(state) ? "hero-turn" : "hand-complete",
    state,
    actorSeat: isHeroTurn(state) ? state.heroSeat : undefined,
    effect: "action-label",
    overlapMs: 0,
    durationMs: 0,
    visibleBoardCount: state.board.length,
  });
  return frames;
}

export function planAfterHero(
  state: GameState,
  action: GameAction,
  actionId: number,
  reducedMotion = false,
): PlaybackFrame[] {
  const frames: PlaybackFrame[] = [];
  let sequence = 0;
  const add = (
    phase: PlaybackPhase,
    snapshot: GameState,
    effect: VisualEffectKind,
    actorSeat?: number,
    log?: GameLog,
    durationOverride?: number,
    metadata?: Pick<PlaybackFrame, "visibleBoardCount">,
  ) => {
    const id = actionId * 1000 + sequence++;
    frames.push({
      id,
      phase,
      state: snapshot,
      actorSeat,
      action: log,
      actionKind: log?.kind,
      effect,
      overlapMs: effect === "chips" && !reducedMotion ? 25 : 0,
      durationMs:
        durationOverride ?? durationFor(state.seed, id, phase, reducedMotion),
      ...metadata,
    });
  };
  const addBoardDeal = (beforeBoardCount: number, snapshot: GameState) => {
    for (
      let visibleBoardCount = beforeBoardCount + 1;
      visibleBoardCount <= snapshot.board.length;
      visibleBoardCount += 1
    ) {
      add(
        "dealing",
        snapshot,
        "deal",
        undefined,
        undefined,
        reducedMotion ? 40 : snapshot.street === "flop" ? 70 : 90,
        { visibleBoardCount },
      );
    }
  };

  add("submitting", state, "receipt", state.heroSeat);
  let current = applyHeroAction(state, action);
  const heroLog = current.log.at(-1)!;
  add(
    "animating-chips",
    current,
    effectFor(heroLog),
    state.heroSeat,
    heroLog,
  );
  if (heroLog.kind === "all-in")
    add(
      "animating-chips",
      current,
      "all-in",
      state.heroSeat,
      heroLog,
      reducedMotion ? 40 : 180,
    );

  let guard = 0;
  while (current.phase === "playing" && guard++ < 120) {
    if (!current.pending.length) {
      add("settling-pot", current, "collect");
      if (shouldRunoutShowdown(current)) {
        const runout = runoutSnapshots(current);
        let previousBoardCount = current.board.length;
        for (const snapshot of runout) {
          addBoardDeal(previousBoardCount, snapshot);
          previousBoardCount = snapshot.board.length;
        }
        const river = runout.at(-1)!;
        add("showdown", revealSnapshot(river), "reveal");
        current = advanceIfRoundComplete(river);
        add("settling-pot", current, "collect");
        continue;
      }
      const beforeAdvance = current;
      current = advanceIfRoundComplete(current);
      if (current.phase === "review" && current.result?.reason === "showdown") {
        add("showdown", revealSnapshot(beforeAdvance), "reveal");
        add("settling-pot", current, "collect");
      }
      else addBoardDeal(beforeAdvance.board.length, current);
      continue;
    }
    if (isHeroTurn(current)) {
      add("hero-turn", current, "action-label", current.heroSeat);
      return frames;
    }
    const actorSeat = current.pending[0];
    const beforeAction = current;
    current = applyNextBotAction(current);
    const botLog = current.log.at(-1)!;
    const thinkingId = actionId * 1000 + sequence;
    add(
      "bot-thinking",
      beforeAction,
      "thinking",
      actorSeat,
      undefined,
      thinkingDuration(state.seed, thinkingId, botLog.kind, reducedMotion),
    );
    add(
      "animating-chips",
      current,
      effectFor(botLog),
      actorSeat,
      botLog,
    );
    if (botLog.kind === "all-in")
      add(
        "animating-chips",
        current,
        "all-in",
        actorSeat,
        botLog,
        reducedMotion ? 40 : 180,
      );
  }

  add("hand-complete", current, "action-label");
  return frames;
}
