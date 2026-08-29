import { createDeck, type Card } from "../engine/cards";
import { bestHand, compareHands } from "../engine/evaluator";
import { buildPots, settlePots, type Pot } from "../engine/pots";
import type { TableProfileId } from "../policy/tableProfiles";
import type { PolicyAction, PolicyCandidate, PolicyDecision } from "../policy/types";
import { createLocalStrategyEngine, selectStrategyAction } from "../strategy/engine";
import { buildPublicDecisionState } from "../strategy/publicState";
import { buildRangeLedger, snapshotRangeLedger } from "../strategy/rangeLedger";
import type { StrategyAction, StrategyResult } from "../strategy/types";
import type {
  AssessmentStatus,
  DecisionAssessment,
  TrainingTarget,
} from "../training/types";
import type {
  DeepDecisionInput,
  DeepHandReview,
  DeepReviewStatus,
} from "../review/types";
import {
  DEFAULT_PLAYER_PROFILES,
  effectivePlayerProfile,
  normalizePlayerProfiles,
  type HandPlayerProfile,
  type PlayerProfile,
} from "../policy/playerProfiles";
export type Street = "preflop" | "flop" | "turn" | "river";
export type GameAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; to: number };
export type Position = "BTN" | "SB" | "BB" | "UTG" | "HJ" | "CO";
export type ActionKind =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "all-in";
export const FRIEND_NAMES = [
  "阿岚",
  "北辰",
  "墨川",
  "青禾",
  "老周",
  "小满",
] as const;
const POSITION_NAMES: Record<Position, string> = {
  UTG: "枪口位",
  HJ: "劫位",
  CO: "关煞位",
  BTN: "庄位",
  SB: "小盲",
  BB: "大盲",
};
export function positionLabel(position: Position) {
  return { name: POSITION_NAMES[position], abbreviation: position };
}
export type Player = {
  seat: number;
  playerId: string;
  position: Position;
  name: string;
  profile?: HandPlayerProfile;
  stack: number;
  buyIn: number;
  rebuys: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  revealed: boolean;
  streetBet: number;
  totalBet: number;
};
export type FriendBankroll = {
  playerId: string;
  stack: number;
  buyIn: number;
  rebuys: number;
};
export type HeroBankroll = Omit<FriendBankroll, "playerId">;
export type GameLog = {
  street: Street;
  actorSeat: number;
  actor: string;
  kind: ActionKind;
  action: string;
  amount: number;
  toAmount: number;
  potBefore?: number;
  potAfter: number;
};
export type Legal = {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  callAmount: number;
  minRaiseTo: number;
  maxRaiseTo: number;
};
export type Result = {
  reason: "fold" | "showdown";
  winners: number[];
  summary: string;
  showdown?: { seat: number; handName: string; bestCards: Card[]; tiebreak: number[] }[];
  pots?: { label: string; amount: number; eligible: number[]; winners: number[] }[];
};
export type PolicyDecisionRecord = {
  seat: number;
  street: Street;
  logIndex: number;
  decision: PolicyDecision;
};
export type StrategyDecisionRecord = {
  seat: number;
  street: Street;
  logIndex: number;
  selectedAction: StrategyAction["action"];
  sampled: number;
  result: StrategyResult;
};
export type GameState = {
  version: 9;
  strategyVersion: string;
  seed: number;
  rng: number;
  handNo: number;
  button: number;
  smallBlind: number;
  bigBlind: number;
  heroSeat: number;
  players: Player[];
  playerProfiles: PlayerProfile[];
  friendBankrolls: FriendBankroll[];
  deck: Card[];
  board: Card[];
  burn: Card[];
  pot: number;
  street: Street;
  currentBet: number;
  minRaise: number;
  pending: number[];
  toAct: number;
  legal: Legal;
  phase: "playing" | "review";
  log: GameLog[];
  result?: Result;
  raiseToReopen: number[];
  policyDecisions: PolicyDecisionRecord[];
  strategyDecisions: StrategyDecisionRecord[];
  tableProfileId: TableProfileId;
  trainingTarget: TrainingTarget;
  assessments: DecisionAssessment[];
  assessmentStatus: AssessmentStatus;
  reviewDecisionInputs: DeepDecisionInput[];
  deepReviewStatus: DeepReviewStatus;
  deepReview?: DeepHandReview;
  deepReviewError?: string;
};
export type NewGameOptions = {
  tableProfileId?: TableProfileId;
  trainingTarget?: TrainingTarget;
  playerProfiles?: ReadonlyArray<Readonly<PlayerProfile>>;
  friendBankrolls?: FriendBankroll[];
  heroBankroll?: HeroBankroll;
};
const STREET_CN: Record<Street, string> = {
  preflop: "翻前",
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
};
function positionFor(seat: number, button: number, playerCount: number): Position {
  if (playerCount === 2) return seat === button ? "BTN" : "BB";
  return (["BTN", "SB", "BB", "UTG", "HJ", "CO"] as Position[])[
    (seat - button + 6) % 6
  ];
}
function shuffled(seed: number) {
  let x = seed >>> 0;
  const r = () => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 4294967296;
    },
    d = createDeck();
  for (let i = d.length - 1; i; i--) {
    const j = Math.floor(r() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return { deck: d, rng: x };
}
function live(s: GameState) {
  return s.players.filter((p) => !p.folded);
}
function actionable(s: GameState) {
  return s.players.filter((p) => !p.folded && !p.allIn);
}
function orderFrom(s: GameState, start: number) {
  return Array.from(
    { length: s.players.length },
    (_, i) => (start + i) % s.players.length,
  ).filter((i) => !s.players[i].folded && !s.players[i].allIn);
}
function legalFor(s: GameState, seat: number): Legal {
  const p = s.players[seat],
    callAmount = Math.min(p.stack, Math.max(0, s.currentBet - p.streetBet)),
    maxRaiseTo = p.streetBet + p.stack,
    minRaiseTo = Math.min(maxRaiseTo, s.currentBet + s.minRaise),
    canRaise =
      s.currentBet >= (s.raiseToReopen?.[seat] ?? 0) &&
      maxRaiseTo > s.currentBet;
  return {
    canFold: callAmount > 0 || seat === s.heroSeat,
    canCheck: callAmount === 0,
    canCall: callAmount > 0,
    canRaise,
    callAmount,
    minRaiseTo,
    maxRaiseTo,
  };
}
function sync(s: GameState) {
  s.toAct = s.pending[0] ?? -1;
  s.legal =
    s.toAct >= 0
      ? legalFor(s, s.toAct)
      : {
          canFold: false,
          canCheck: false,
          canCall: false,
          canRaise: false,
          callAmount: 0,
          minRaiseTo: 0,
          maxRaiseTo: 0,
        };
  return s;
}
function pay(s: GameState, p: Player, amount: number) {
  const paid = Math.min(p.stack, amount);
  p.stack -= paid;
  p.streetBet += paid;
  p.totalBet += paid;
  s.pot += paid;
  p.allIn = p.stack === 0;
  return paid;
}
function finishUncontested(s: GameState) {
  const winner = live(s)[0];
  winner.stack += s.pot;
  const amount = s.pot;
  s.pot = 0;
  s.phase = "review";
  s.pending = [];
  s.result = {
    reason: "fold",
    winners: [winner.seat],
    summary: `${winner.name} 无摊牌赢得 ${amount} 筹码`,
  };
  s.players.forEach((p) => (p.revealed = false));
  return sync(s);
}
function sameSeats(first: number[], second: number[]) {
  return first.length === second.length && first.every((seat, index) => seat === second[index]);
}
function displayPots(pots: Pot[], winnerGroups: number[][]): NonNullable<Result["pots"]> {
  const merged: { amount: number; eligible: number[]; winners: number[] }[] = [];
  pots.forEach((pot, index) => {
    const winners = winnerGroups[index];
    const previous = merged.at(-1);
    if (
      previous &&
      previous.eligible.length > 1 &&
      pot.eligible.length > 1 &&
      sameSeats(previous.eligible, pot.eligible) &&
      sameSeats(previous.winners, winners)
    ) {
      previous.amount += pot.amount;
      return;
    }
    merged.push({ amount: pot.amount, eligible: pot.eligible, winners });
  });
  let contestedIndex = 0;
  return merged.map((pot) => ({
    ...pot,
    label:
      pot.eligible.length === 1
        ? "未被跟注筹码"
        : contestedIndex++ === 0
          ? "主池"
          : `边池 ${contestedIndex - 1}`,
  }));
}
function showdown(s: GameState) {
  while (s.board.length < 5) {
    if (s.board.length === 0) {
      s.burn.push(s.deck.shift()!);
      s.board.push(...s.deck.splice(0, 3));
    } else {
      s.burn.push(s.deck.shift()!);
      s.board.push(s.deck.shift()!);
    }
  }
  const contenders = live(s);
  const ranks = new Map(
    contenders.map((player) => [
      player.seat,
      bestHand([...player.hole, ...s.board]),
    ]),
  );
  const pots = buildPots(
    s.players.map((player) => player.totalBet),
    new Set(
      s.players
        .filter((player) => player.folded)
        .map((player) => player.seat),
    ),
  );
  const winnerGroups = pots.map((pot) => {
    let winners: number[] = [];
    for (const seat of pot.eligible) {
      if (
        !winners.length ||
        compareHands(ranks.get(seat)!, ranks.get(winners[0])!) > 0
      )
        winners = [seat];
      else if (compareHands(ranks.get(seat)!, ranks.get(winners[0])!) === 0)
        winners.push(seat);
    }
    return winners;
  });
  const payouts = settlePots(pots, winnerGroups, s.button, s.players.length);
  if (payouts.reduce((sum, amount) => sum + amount, 0) !== s.pot)
    throw new Error("边池结算与底池总额不一致");
  payouts.forEach((amount, seat) => (s.players[seat].stack += amount));
  const contestedIndexes = pots
    .map((pot, index) => (pot.eligible.length > 1 ? index : -1))
    .filter((index) => index >= 0);
  const contestedPayouts = settlePots(
    contestedIndexes.map((index) => pots[index]),
    contestedIndexes.map((index) => winnerGroups[index]),
    s.button,
    s.players.length,
  );
  const refunds = Array(s.players.length).fill(0) as number[];
  pots.forEach((pot) => {
    if (pot.eligible.length === 1) refunds[pot.eligible[0]] += pot.amount;
  });
  const winners = [
    ...new Set(contestedIndexes.flatMap((index) => winnerGroups[index])),
  ].map(
    (seat) => s.players[seat],
  );
  s.pot = 0;
  s.phase = "review";
  s.pending = [];
  contenders.forEach((p) => (p.revealed = true));
  s.result = {
    reason: "showdown",
    winners: winners.map((p) => p.seat),
    summary: [
      ...winners.map(
        (player) =>
          `${player.name}赢得 ${contestedPayouts[player.seat]} 筹码`,
      ),
      ...s.players
        .filter((player) => refunds[player.seat] > 0)
        .map(
          (player) =>
            `${player.name}收回未被跟注筹码 ${refunds[player.seat]}`,
        ),
    ].join("；"),
    showdown: contenders.map((player) => {
      const rank = ranks.get(player.seat)!;
      return { seat: player.seat, handName: rank.name, bestCards: rank.cards, tiebreak: rank.tiebreak };
    }),
    pots: displayPots(pots, winnerGroups),
  };
  return sync(s);
}
function advanceStreet(s: GameState): GameState {
  if (live(s).length === 1) return finishUncontested(s);
  if (actionable(s).length <= 1) return showdown(s);
  if (s.street === "river") return showdown(s);
  s.players.forEach((p) => (p.streetBet = 0));
  s.currentBet = 0;
  s.minRaise = 2;
  s.raiseToReopen = s.players.map(() => 0);
  if (s.street === "preflop") {
    s.street = "flop";
    s.burn.push(s.deck.shift()!);
    s.board.push(...s.deck.splice(0, 3));
  } else {
    s.street = s.street === "flop" ? "turn" : "river";
    s.burn.push(s.deck.shift()!);
    s.board.push(s.deck.shift()!);
  }
  s.pending = orderFrom(s, (s.button + 1) % s.players.length);
  return sync(s);
}
function commit(s: GameState, seat: number, a: GameAction) {
  const p = s.players[seat],
    l = legalFor(s, seat);
  const potBefore = s.pot;
  s.pending = s.pending.filter((x) => x !== seat);
  s.raiseToReopen ??= s.players.map(() => 0);
  if (a.type === "fold") {
    if (!l.canFold) throw new Error("当前不能弃牌");
    p.folded = true;
    s.raiseToReopen[seat] = Number.MAX_SAFE_INTEGER;
    p.revealed = false;
    s.log.push({
      street: s.street,
      actorSeat: seat,
      actor: p.name,
      kind: "fold",
      action: "弃牌",
      amount: 0,
      toAmount: p.streetBet,
      potBefore,
      potAfter: s.pot,
    });
  } else if (a.type === "check") {
    if (!l.canCheck) throw new Error("当前不能过牌");
    s.raiseToReopen[seat] = 0;
    s.log.push({
      street: s.street,
      actorSeat: seat,
      actor: p.name,
      kind: "check",
      action: "过牌",
      amount: 0,
      toAmount: p.streetBet,
      potBefore,
      potAfter: s.pot,
    });
  } else if (a.type === "call") {
    if (!l.canCall) throw new Error("当前没有可跟注金额");
    const paid = pay(s, p, l.callAmount);
    s.raiseToReopen[seat] = s.currentBet + s.minRaise;
    const kind: ActionKind = p.allIn ? "all-in" : "call";
    s.log.push({
      street: s.street,
      actorSeat: seat,
      actor: p.name,
      kind,
      action: kind === "all-in" ? "全下" : "跟注",
      amount: paid,
      toAmount: p.streetBet,
      potBefore,
      potAfter: s.pot,
    });
  } else {
    if (!l.canRaise) throw new Error("短全下未重新开放加注");
    if (a.to > l.maxRaiseTo || a.to < l.minRaiseTo || a.to <= s.currentBet)
      throw new Error(`合法加注范围 ${l.minRaiseTo}–${l.maxRaiseTo}`);
    const old = s.currentBet;
    const fullRaise = a.to >= old + s.minRaise;
    const paid = pay(s, p, a.to - p.streetBet);
    if (fullRaise) {
      s.minRaise = a.to - old;
      s.pending = orderFrom(s, (seat + 1) % s.players.length).filter(
        (x) => x !== seat,
      );
    }
    s.currentBet = p.streetBet;
    s.raiseToReopen[seat] = s.currentBet + s.minRaise;
    if (!fullRaise) {
      s.pending = orderFrom(s, (seat + 1) % s.players.length).filter(
        (index) =>
          index !== seat && s.players[index].streetBet < s.currentBet,
      );
    }
    const kind: ActionKind = p.allIn
      ? "all-in"
      : old === 0
        ? "bet"
        : "raise";
    s.log.push({
      street: s.street,
      actorSeat: seat,
      actor: p.name,
      kind,
      action:
        kind === "all-in" ? "全下" : kind === "bet" ? "下注到" : "加注到",
      amount: paid,
      toAmount: p.streetBet,
      potBefore,
      potAfter: s.pot,
    });
  }
  if (live(s).length === 1) return finishUncontested(s);
  return sync(s);
}
function isLegalPolicyAction(action: GameAction, legal: Legal) {
  if (action.type === "fold") return legal.canFold;
  if (action.type === "check") return legal.canCheck;
  if (action.type === "call") return legal.canCall;
  return (
    legal.canRaise &&
    action.to >= legal.minRaiseTo &&
    action.to <= legal.maxRaiseTo
  );
}
function gameActionFromStrategy(action: StrategyAction): GameAction {
  if (action.action === "fold" || action.action === "check" || action.action === "call")
    return { type: action.action };
  return { type: "raise", to: action.toAmount ?? 0 };
}
function policyActionFromStrategy(action: StrategyAction): PolicyAction {
  return gameActionFromStrategy(action);
}
function numberFact(result: StrategyResult, key: string) {
  const value = result.explanationFacts[key] ?? result.rangeFacts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function legacyDecisionRecord(
  result: StrategyResult,
  selected: StrategyAction,
  sampled: number,
): PolicyDecision {
  const candidates: PolicyCandidate[] = result.actions.map((action) => ({
    action: policyActionFromStrategy(action),
    label: action.action,
    ev: action.ev,
    probability: action.frequency,
    intent: action.intent,
  }));
  return {
    action: policyActionFromStrategy(selected),
    candidates,
    facts: {
      strength: numberFact(result, "strength"),
      equity: numberFact(result, "equity"),
      requiredEquity: numberFact(result, "requiredEquity"),
      spr: numberFact(result, "spr"),
      rangeCombos: numberFact(result, "rangeCombos"),
      sampled,
      elapsedMs: 0,
      ...(result.explanationFacts.fallback
        ? { fallback: String(result.explanationFacts.fallback) }
        : {}),
    },
  };
}
function commitBot(s: GameState, seat: number) {
  const publicState = buildPublicDecisionState(s, seat);
  const ranges = snapshotRangeLedger(buildRangeLedger(publicState));
  const result = createLocalStrategyEngine().decide({
    state: publicState,
    ranges,
    deadlineMs: 250,
    playerProfile: s.players[seat].profile,
  });
  if (result.source !== "safe-fallback") s.strategyVersion = result.strategyVersion;
  const selection = selectStrategyAction(
    result,
    publicState.seed,
    publicState.decisionIndex,
  );
  const legal = legalFor(s, seat);
  const fallback: GameAction = legal.canCheck
    ? { type: "check" }
    : legal.canCall
      ? { type: "call" }
      : { type: "fold" };
  const strategyAction = selection.action;
  const requestedAction = gameActionFromStrategy(strategyAction);
  const action = isLegalPolicyAction(requestedAction, legal)
    ? requestedAction
    : fallback;
  const recordedDecision = legacyDecisionRecord(result, strategyAction, selection.sampled);
  if (!isLegalPolicyAction(requestedAction, legal)) {
    recordedDecision.action = action;
    recordedDecision.facts.fallback = "策略输出未通过规则引擎合法性校验";
  }
  s.strategyDecisions.push({
    seat,
    street: s.street,
    logIndex: s.log.length,
    selectedAction: strategyAction.action,
    sampled: selection.sampled,
    result,
  });
  s.policyDecisions.push({
    seat,
    street: s.street,
    logIndex: s.log.length,
    decision: recordedDecision,
  });
  return commit(s, seat, action);
}
function runBots(s: GameState): GameState {
  let guard = 0;
  while (s.phase === "playing" && guard++ < 120) {
    if (!s.pending.length) {
      s = advanceStreet(s);
      continue;
    }
    if (s.pending[0] === s.heroSeat) break;
    s = commitBot(s, s.pending[0]);
  }
  return sync(s);
}

type RosterEntry = Pick<Player, "name" | "stack" | "buyIn" | "rebuys"> & {
  playerId?: string;
};

function cleanBankroll(record: FriendBankroll | undefined, playerId: string) {
  const valid = (value: unknown, fallback: number) =>
    Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
  return {
    playerId,
    stack: valid(record?.stack, 200),
    buyIn: valid(record?.buyIn, 200),
    rebuys: valid(record?.rebuys, 0),
  };
}

function sessionBankrolls(
  profiles: PlayerProfile[],
  input: FriendBankroll[] | undefined,
  roster: RosterEntry[] | undefined = undefined,
) {
  const records = new Map((input ?? []).map((record) => [record.playerId, record]));
  for (const entry of roster ?? []) {
    const profile = profiles.find(
      (candidate) =>
        candidate.playerId === entry.playerId || candidate.displayName === entry.name,
    );
    if (profile)
      records.set(profile.playerId, {
        playerId: profile.playerId,
        stack: entry.stack,
        buyIn: entry.buyIn,
        rebuys: entry.rebuys,
      });
  }
  return profiles.map((profile) =>
    cleanBankroll(records.get(profile.playerId), profile.playerId),
  );
}

function selectedProfiles(profiles: PlayerProfile[], seed: number, count: number) {
  const omitted =
    (Math.imul(seed ^ (seed >>> 13), 0x27d4eb2d) >>> 0) % profiles.length;
  const available = profiles.filter((_, index) => index !== omitted);
  const offset = (seed >>> 7) % available.length;
  return Array.from(
    { length: Math.min(count, available.length) },
    (_, index) => available[(index + offset) % available.length],
  );
}

export function newGame(
  seed: number,
  handNo = 1,
  stacks?: number[],
  roster?: RosterEntry[],
  options: NewGameOptions = {},
): GameState {
  const managedFriends =
      !roster ||
      options.playerProfiles !== undefined ||
      options.friendBankrolls !== undefined ||
      options.heroBankroll !== undefined,
    playerCount = managedFriends
      ? stacks?.length === 2
        ? 2
        : 6
      : roster?.length ?? (stacks?.length === 2 ? 2 : 6),
    shuffledDeck = shuffled(seed),
    button = seed % playerCount,
    sb = playerCount === 2 ? button : (button + 1) % playerCount,
    bb = (button + (playerCount === 2 ? 1 : 2)) % playerCount,
    positionRoll =
      (Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0) % playerCount,
    hero = (button + positionRoll) % playerCount;
  const playerProfiles = normalizePlayerProfiles(options.playerProfiles),
    friendBankrolls = sessionBankrolls(
      playerProfiles,
      options.friendBankrolls,
      roster,
    ),
    seatedProfiles = selectedProfiles(playerProfiles, seed, playerCount - 1);
  let friendIndex = 0;
  const heroRecord = roster?.find((player) => player.name === "你");
  const opponentRecords = roster?.filter((player) => player.name !== "你") ?? [];
  let opponentIndex = 0;
  const players = Array.from(
    { length: playerCount }, (_, seat): Player => {
      const isHero = seat === hero;
      const rosterRecord = roster
        ? isHero
          ? heroRecord
          : opponentRecords[opponentIndex++]
        : undefined;
      const selected = isHero
        ? undefined
        : managedFriends
          ? seatedProfiles[friendIndex++]
          : playerProfiles.find(
              (profile) =>
                profile.playerId === rosterRecord?.playerId ||
                profile.displayName === rosterRecord?.name,
            ) ?? seatedProfiles[friendIndex++];
      const bankroll = selected
        ? friendBankrolls.find((record) => record.playerId === selected.playerId)
        : undefined;
      const heroBankroll = options.heroBankroll ?? heroRecord;
      const playerId = isHero
        ? "hero"
        : rosterRecord?.playerId ?? selected?.playerId ?? `legacy-seat-${seat}`;
      const name = isHero
        ? "你"
        : managedFriends
          ? selected!.displayName
          : rosterRecord?.name ?? selected!.displayName;
      return {
        seat,
        playerId,
        position: positionFor(seat, button, playerCount),
        name,
        profile:
          isHero || !selected
            ? undefined
            : effectivePlayerProfile(
                { ...selected, playerId, displayName: name },
                options.tableProfileId ?? "balanced",
                seed,
              ),
        stack:
          stacks?.[seat] ??
          (isHero ? heroBankroll?.stack : rosterRecord?.stack ?? bankroll?.stack) ??
          200,
        buyIn: (isHero ? heroBankroll?.buyIn : rosterRecord?.buyIn ?? bankroll?.buyIn) ?? 200,
        rebuys: (isHero ? heroBankroll?.rebuys : rosterRecord?.rebuys ?? bankroll?.rebuys) ?? 0,
        hole: [],
        folded: false,
        allIn: false,
        revealed: seat === hero,
        streetBet: 0,
        totalBet: 0,
      };
    },
  );
  const s: GameState = {
    version: 9,
    strategyVersion: "preflop-abstract-v1",
    seed,
    rng: shuffledDeck.rng,
    handNo,
    button,
    smallBlind: sb,
    bigBlind: bb,
    heroSeat: hero,
    players,
    playerProfiles,
    friendBankrolls,
    deck: shuffledDeck.deck,
    board: [],
    burn: [],
    pot: 0,
    street: "preflop",
    currentBet: 2,
    minRaise: 2,
    pending: [],
    toAct: hero,
    legal: {} as Legal,
    phase: "playing",
    log: [],
    raiseToReopen: Array(playerCount).fill(0),
    policyDecisions: [],
    strategyDecisions: [],
    tableProfileId: options.tableProfileId ?? "balanced",
    trainingTarget: options.trainingTarget ?? { mode: "none" },
    assessments: [],
    assessmentStatus: "ready",
    reviewDecisionInputs: [],
    deepReviewStatus: "not-started",
  };
  const firstToDeal = playerCount === 2 ? button : (button + 1) % playerCount;
  for (let n = 0; n < 2; n++)
    for (let i = 0; i < playerCount; i++)
      players[(firstToDeal + i) % playerCount].hole.push(s.deck.shift()!);
  pay(s, players[sb], 1);
  pay(s, players[bb], 2);
  s.pending = orderFrom(s, (bb + 1) % playerCount);
  return runBots(sync(s));
}
export function act(state: GameState, action: GameAction): GameState {
  let s = applyHeroAction(state, action);
  if (s.phase === "playing") s = runBots(s);
  return sync(s);
}
export function normalizeGameState(state: GameState): GameState {
  const raw = structuredClone(state) as unknown as Record<string, unknown>;
  if (raw.version === 6) {
    raw.version = 9;
    raw.strategyVersion = "legacy-v6";
    raw.strategyDecisions = [];
  }
  if (raw.version === 7 || raw.version === 8) raw.version = 9;
  if (raw.version !== 9) throw new Error("牌局数据版本不兼容");
  const s = raw as GameState & {
    raiseToReopen?: number[];
    policyDecisions?: PolicyDecisionRecord[];
    strategyDecisions?: StrategyDecisionRecord[];
    tableProfileId?: TableProfileId;
    trainingTarget?: TrainingTarget;
    assessments?: DecisionAssessment[];
    assessmentStatus?: AssessmentStatus;
    playerProfiles?: PlayerProfile[];
    friendBankrolls?: FriendBankroll[];
    reviewDecisionInputs?: DeepDecisionInput[];
    deepReviewStatus?: DeepReviewStatus;
    deepReview?: DeepHandReview;
    deepReviewError?: string;
  };
  if (!(["balanced", "friends", "loose-wild"] as string[]).includes(s.tableProfileId ?? ""))
    s.tableProfileId = "balanced";
  s.playerProfiles = normalizePlayerProfiles(s.playerProfiles);
  s.players.forEach((player) => {
    player.buyIn ??= 200;
    player.rebuys ??= 0;
    player.playerId ??=
      player.seat === s.heroSeat || player.name === "你"
        ? "hero"
        : s.playerProfiles.find((profile) => profile.displayName === player.name)
            ?.playerId ?? `legacy-seat-${player.seat}`;
    if (player.playerId === "hero") player.profile = undefined;
    else if (!player.profile) {
      const saved = s.playerProfiles.find(
        (profile) => profile.playerId === player.playerId,
      );
      player.profile = effectivePlayerProfile(
        saved ?? {
          ...DEFAULT_PLAYER_PROFILES[1],
          playerId: player.playerId,
          displayName: player.name,
        },
        s.tableProfileId,
        s.seed,
      );
    }
  });
  const legacyBankrolls = s.players
    .filter((player) => player.playerId !== "hero")
    .map((player) => ({
      playerId: player.playerId,
      stack: player.stack,
      buyIn: player.buyIn,
      rebuys: player.rebuys,
    }));
  s.friendBankrolls = sessionBankrolls(
    s.playerProfiles,
    Array.isArray(s.friendBankrolls) ? s.friendBankrolls : legacyBankrolls,
  );
  if (!Array.isArray(s.raiseToReopen) || s.raiseToReopen.length !== s.players.length) {
    s.raiseToReopen = s.players.map((player) => {
      if (player.folded || player.allIn) return Number.MAX_SAFE_INTEGER;
      const last = [...s.log]
        .reverse()
        .find((entry) => entry.street === s.street && entry.actorSeat === player.seat);
      if (!last || last.kind === "check") return 0;
      return last.toAmount + s.minRaise;
    });
  }
  if (!Array.isArray(s.policyDecisions)) s.policyDecisions = [];
  if (!Array.isArray(s.strategyDecisions)) s.strategyDecisions = [];
  if (typeof s.strategyVersion !== "string" || !s.strategyVersion)
    s.strategyVersion = "legacy-adapter-v1";
  s.trainingTarget ??= { mode: "none" };
  if (!Array.isArray(s.assessments)) s.assessments = [];
  s.assessments = s.assessments.map((assessment) => ({
    ...assessment,
    scored: typeof assessment.scored === "boolean"
      ? assessment.scored
      : s.strategyVersion !== "legacy-v6",
  }));
  s.assessmentStatus ??= "ready";
  if (!Array.isArray(s.reviewDecisionInputs)) s.reviewDecisionInputs = [];
  s.deepReviewStatus ??= "not-started";
  if (s.deepReview && (!s.deepReview.stateHash || s.deepReview.status !== "completed"))
    s.deepReview = undefined;
  if (s.deepReviewStatus !== "failed") s.deepReviewError = undefined;
  return sync(s as GameState);
}
export function isHeroTurn(state: GameState) {
  return (
    state.phase === "playing" &&
    state.toAct === state.heroSeat &&
    state.pending[0] === state.heroSeat
  );
}
export function applyHeroAction(state: GameState, action: GameAction): GameState {
  if (state.phase !== "playing") throw new Error("本手已经结束");
  if (!isHeroTurn(state)) throw new Error("尚未轮到你");
  return sync(commit(structuredClone(state), state.heroSeat, action));
}
export function applyNextBotAction(state: GameState): GameState {
  if (
    state.phase !== "playing" ||
    !state.pending.length ||
    state.pending[0] === state.heroSeat
  )
    throw new Error("当前没有可执行的对手动作");
  const s = structuredClone(state);
  return sync(commitBot(s, s.pending[0]));
}
export function advanceIfRoundComplete(state: GameState): GameState {
  if (state.phase !== "playing" || state.pending.length)
    throw new Error("本轮下注尚未结束");
  return advanceStreet(structuredClone(state));
}
export function actionForTarget(state: GameState, target: number): GameAction {
  if (state.phase !== "playing") throw new Error("本手已经结束");
  if (!Number.isInteger(target) || target < 0) throw new Error("请输入整数筹码");
  const player = state.players[state.heroSeat];
  const callTo = player.streetBet + state.legal.callAmount;
  if (state.legal.canCall && target === callTo) return { type: "call" };
  if (state.legal.canCheck && target === player.streetBet) return { type: "check" };
  if (!state.legal.canRaise) throw new Error("短全下未重新开放加注");
  const minimum = state.legal.canCall ? callTo : state.legal.minRaiseTo;
  if (target < minimum) throw new Error(`本街总投入至少为 ${minimum}`);
  if (target < state.legal.minRaiseTo || target > state.legal.maxRaiseTo)
    throw new Error(
      `合法下注范围 ${state.legal.minRaiseTo}–${state.legal.maxRaiseTo}`,
    );
  return { type: "raise", to: target };
}
export function currentPrompt(state: GameState) {
  const actor = state.toAct >= 0 ? state.players[state.toAct] : undefined;
  return {
    actor: actor?.name ?? "本手结束",
    position: actor?.position,
    toCall: state.phase === "playing" ? state.legal.callAmount : 0,
    currentBet: state.currentBet,
    latestAction: state.log.at(-1),
  };
}
export function nextHandAtSeed(
  state: GameState,
  nextSeed: number,
  options: NewGameOptions = {},
) {
  const normalized = normalizeGameState(state);
  const playerProfiles = normalizePlayerProfiles(
    options.playerProfiles ?? normalized.playerProfiles,
  );
  const bankrolls = bankrollsForNextHand(normalized, playerProfiles);
  return newGame(nextSeed, normalized.handNo + 1, undefined, undefined, {
    tableProfileId: options.tableProfileId ?? normalized.tableProfileId,
    trainingTarget: options.trainingTarget ?? { mode: "none" },
    playerProfiles,
    ...bankrolls,
  });
}
export function bankrollsForNextHand(
  state: GameState,
  profiles: ReadonlyArray<Readonly<PlayerProfile>> = state.playerProfiles,
) {
  const normalized = normalizeGameState(state);
  const playerProfiles = normalizePlayerProfiles(profiles);
  const friendBankrolls = new Map(
    sessionBankrolls(playerProfiles, normalized.friendBankrolls).map((record) => [
      record.playerId,
      record,
    ]),
  );
  normalized.players
    .filter((player) => player.playerId !== "hero")
    .forEach((player) => {
      const rebuy = player.stack === 0;
      friendBankrolls.set(player.playerId, {
        playerId: player.playerId,
        stack: rebuy ? 200 : player.stack,
        buyIn: player.buyIn + (rebuy ? 200 : 0),
        rebuys: player.rebuys + (rebuy ? 1 : 0),
      });
    });
  const hero = normalized.players[normalized.heroSeat];
  const heroRebuy = hero.stack === 0;
  return {
    friendBankrolls: [...friendBankrolls.values()],
    heroBankroll: {
      stack: heroRebuy ? 200 : hero.stack,
      buyIn: hero.buyIn + (heroRebuy ? 200 : 0),
      rebuys: hero.rebuys + (heroRebuy ? 1 : 0),
    },
  };
}
export function nextHand(state: GameState, options: NewGameOptions = {}) {
  return nextHandAtSeed(state, state.seed + 1, options);
}
export function streetName(street: Street) {
  return STREET_CN[street];
}
