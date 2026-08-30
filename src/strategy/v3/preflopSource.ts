import type { Position } from "../../game/game";
import { ALL_PREFLOP_HANDS } from "../preflopHands";
import type { PreflopStackBucket, PreflopSpot } from "../types";
import type { StrategyProvenance } from "./packTypes";

export type PreflopSizeClass =
  | "open-2.0"
  | "open-2.5"
  | "open-3.0"
  | "isolate"
  | "three-bet-ip"
  | "three-bet-oop"
  | "four-bet"
  | "jam";

export type PreflopSourceAction = {
  kind: "fold" | "check" | "call" | "raise" | "all-in";
  sizeClass?: PreflopSizeClass;
  frequency: number;
  evBb: number;
};

export type PreflopSourceGroup = {
  hands: string[];
  source: StrategyProvenance;
  actions: PreflopSourceAction[];
};

export type PreflopSourceNode = {
  id: string;
  spot: PreflopSpot;
  position: Position;
  stack: PreflopStackBucket;
  groups: PreflopSourceGroup[];
  defaultSource: StrategyProvenance;
  defaultActions: PreflopSourceAction[];
};

export type PreflopSourceV3 = {
  version: 3;
  sourceVersion: string;
  provenance: StrategyProvenance;
  nodes: PreflopSourceNode[];
};

const POSITIONS: Position[] = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const STACKS: PreflopStackBucket[] = [25, 40, 60, 100, 150, 200];
const ALL = new Set<string>(ALL_PREFLOP_HANDS);

function hands(notation: string) {
  const result = notation.split(",").map((hand) => hand.trim()).filter(Boolean);
  for (const hand of result) if (!ALL.has(hand)) throw new Error(`未知翻前手牌：${hand}`);
  return [...new Set(result)];
}

function subtract(base: readonly string[], ...removed: readonly string[][]) {
  const excluded = new Set(removed.flat());
  return base.filter((hand) => !excluded.has(hand));
}

function actions(
  kind: PreflopSourceAction["kind"],
  frequency: number,
  evBb: number,
  sizeClass?: PreflopSizeClass,
): PreflopSourceAction[] {
  const result: PreflopSourceAction[] = [{ kind, sizeClass, frequency, evBb }];
  if (frequency < 1) result.push({ kind: "fold", frequency: 1 - frequency, evBb: 0 });
  return result;
}

function splitActions(
  aggressive: number,
  passive: number,
  aggressiveKind: "raise" | "all-in",
  sizeClass: PreflopSizeClass,
): PreflopSourceAction[] {
  const fold = Math.max(0, 1 - aggressive - passive);
  return [
    ...(aggressive > 0 ? [{ kind: aggressiveKind, sizeClass, frequency: aggressive, evBb: 0.12 }] as PreflopSourceAction[] : []),
    ...(passive > 0 ? [{ kind: "call", frequency: passive, evBb: 0.05 }] as PreflopSourceAction[] : []),
    ...(fold > 0 ? [{ kind: "fold", frequency: fold, evBb: 0 }] as PreflopSourceAction[] : []),
  ];
}

const OPEN: Record<Position, string[]> = {
  UTG: hands("AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,76s,AKo,AQo,AJo,ATo,KQo"),
  HJ: hands("AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,QJs,QTs,Q9s,JTs,J9s,T9s,T8s,98s,87s,76s,65s,AKo,AQo,AJo,ATo,KQo,KJo,QJo"),
  CO: hands("AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,QJs,QTs,Q9s,Q8s,JTs,J9s,J8s,T9s,T8s,98s,97s,87s,86s,76s,75s,65s,64s,54s,AKo,AQo,AJo,ATo,A9o,KQo,KJo,KTo,QJo,QTo,JTo"),
  BTN: hands("AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,QJs,QTs,Q9s,Q8s,Q7s,JTs,J9s,J8s,J7s,T9s,T8s,T7s,98s,97s,96s,87s,86s,76s,75s,65s,64s,54s,AKo,AQo,AJo,ATo,A9o,A8o,KQo,KJo,KTo,K9o,QJo,QTo,Q9o,JTo,J9o,T9o"),
  SB: hands("AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,QJs,QTs,Q9s,Q8s,JTs,J9s,J8s,T9s,T8s,98s,97s,87s,86s,76s,65s,54s,AKo,AQo,AJo,ATo,A9o,KQo,KJo,KTo,QJo,QTo,JTo"),
  BB: [],
};

const MIXED_OPEN: Record<Position, string[]> = {
  UTG: hands("A2s,76s,22"),
  HJ: hands("A2s,65s,QJo"),
  CO: hands("A8o,KTo,QTo,64s"),
  BTN: hands("A8o,K9o,Q9o,J9o,T9o,K5s,Q7s,J7s,96s"),
  SB: hands("A9o,KTo,QTo,JTo,K7s,Q8s,J8s,97s"),
  BB: [],
};

// When action folds to the blinds, the small blind is not a generic unopened
// seat: it has already invested half a blind and is guaranteed to play out of
// position. Keep a conservative complete range instead of forcing every
// non-open hand into a raise-or-fold abstraction.
const SB_COMPLETES = subtract(hands(
  "A8o,A7o,A6o,A5o,A4o,A3o,A2o," +
  "K6s,K5s,K4s,K3s,K2s,K9o,K8o,K7o," +
  "Q7s,Q6s,Q5s,Q4s,Q3s,Q2s,Q9o,Q8o," +
  "J7s,J6s,J5s,J4s,J3s,J2s,J9o," +
  "T7s,T6s,T5s,T4s,T3s,T2s,T9o," +
  "96s,95s,94s,93s,92s,98o," +
  "85s,84s,83s,82s,87o," +
  "75s,74s,73s,72s,64s,63s,62s,53s,52s,43s,42s,32s",
), OPEN.SB);

const PREMIUM = hands("AA,KK,QQ,AKs,AKo");
const STRONG_CONTINUE = hands("JJ,TT,99,AQs,AJs,ATs,AQo,AJo,KQs,KJs,QJs");
const WHEEL_BLUFFS = hands("A5s,A4s,A3s,A2s");
const PAIR_CALLS = hands("88,77,66,55,44,33,22");
const SUITED_CALLS = hands("KTs,K9s,QTs,Q9s,JTs,J9s,T9s,98s,87s,76s,65s");
const BB_EXTRA_CALLS = hands("A9s,A8s,A7s,A6s,K8s,K7s,Q8s,J8s,T8s,97s,86s,75s,64s,54s,ATo,A9o,KQo,KJo,KTo,QJo,QTo,JTo");

function group(handsList: readonly string[], actionsList: PreflopSourceAction[]): PreflopSourceGroup {
  return {
    hands: [...handsList],
    source: "expert-baseline-v3",
    actions: actionsList,
  };
}

function unopened(position: Position, stack: PreflopStackBucket): PreflopSourceNode {
  const mixed = MIXED_OPEN[position];
  const pure = subtract(OPEN[position], mixed);
  return {
    id: `unopened:${position}:${stack}`,
    spot: "unopened",
    position,
    stack,
    groups: position === "BB" ? [] : [
      group(pure, actions("raise", 1, 0.15, stack <= 40 ? "open-2.0" : "open-2.5")),
      group(mixed, actions("raise", position === "HJ" ? 0.6 : 0.5, 0.06, stack <= 40 ? "open-2.0" : "open-2.5")),
      ...(position === "SB"
        ? [group(SB_COMPLETES, actions("call", stack <= 40 ? 0.62 : 0.8, 0.05))]
        : []),
    ],
    defaultSource: "expert-baseline-v3",
    defaultActions: position === "BB"
      ? [{ kind: "check", frequency: 1, evBb: 0 }]
      : [{ kind: "fold", frequency: 1, evBb: 0 }],
  };
}

function isolate(position: Position, stack: PreflopStackBucket): PreflopSourceNode {
  const open = OPEN[position];
  const bluffs = subtract(WHEEL_BLUFFS, open);
  const calls = subtract([...PAIR_CALLS, ...SUITED_CALLS], open, bluffs);
  return {
    id: `isolate-limpers:${position}:${stack}`,
    spot: "isolate-limpers",
    position,
    stack,
    groups: [
      group(open, actions("raise", 1, 0.18, "isolate")),
      group(bluffs, actions("raise", 0.55, 0.04, "isolate")),
      group(calls, splitActions(0, stack >= 60 ? 0.7 : 0.35, "raise", "isolate")),
    ].filter((candidate) => candidate.hands.length > 0),
    defaultSource: "expert-baseline-v3",
    defaultActions: [{ kind: "fold", frequency: 1, evBb: 0 }],
  };
}

function facingOpen(
  spot: "facing-open" | "blind-defense",
  position: Position,
  stack: PreflopStackBucket,
): PreflopSourceNode {
  const bluffRaises = subtract(WHEEL_BLUFFS, PREMIUM);
  const standardCalls = subtract([...STRONG_CONTINUE, ...PAIR_CALLS, ...SUITED_CALLS], PREMIUM, bluffRaises);
  const blindCalls = spot === "blind-defense"
    ? subtract(BB_EXTRA_CALLS, PREMIUM, bluffRaises, standardCalls)
    : [];
  const short = stack <= 40;
  return {
    id: `${spot}:${position}:${stack}`,
    spot,
    position,
    stack,
    groups: [
      group(PREMIUM, splitActions(short ? 0.78 : 0.62, short ? 0.22 : 0.38, short ? "all-in" : "raise", short ? "jam" : position === "BB" || position === "SB" ? "three-bet-oop" : "three-bet-ip")),
      group(bluffRaises, splitActions(short ? 0.22 : 0.36, spot === "blind-defense" ? 0.38 : 0.12, "raise", position === "BB" || position === "SB" ? "three-bet-oop" : "three-bet-ip")),
      group(standardCalls, splitActions(0.08, short ? 0.52 : 0.72, "raise", position === "BB" || position === "SB" ? "three-bet-oop" : "three-bet-ip")),
      group(blindCalls, splitActions(0.03, short ? 0.42 : 0.64, "raise", "three-bet-oop")),
    ].filter((candidate) => candidate.hands.length > 0),
    defaultSource: "expert-baseline-v3",
    defaultActions: [{ kind: "fold", frequency: 1, evBb: 0 }],
  };
}

function squeeze(position: Position, stack: PreflopStackBucket): PreflopSourceNode {
  const value = stack <= 40 ? hands("AA,KK,QQ,JJ,AKs,AKo,AQs") : PREMIUM;
  const calls = subtract(STRONG_CONTINUE, value);
  const bluffs = subtract(WHEEL_BLUFFS, value, calls);
  return {
    id: `squeeze:${position}:${stack}`,
    spot: "squeeze",
    position,
    stack,
    groups: [
      group(value, splitActions(stack <= 40 ? 0.82 : 0.72, stack <= 40 ? 0.18 : 0.28, stack <= 40 ? "all-in" : "raise", stack <= 40 ? "jam" : "three-bet-oop")),
      group(calls, splitActions(0.16, stack >= 60 ? 0.42 : 0.26, "raise", "three-bet-oop")),
      group(bluffs, splitActions(stack >= 60 ? 0.28 : 0.18, 0, "raise", "three-bet-oop")),
    ],
    defaultSource: "expert-baseline-v3",
    defaultActions: [{ kind: "fold", frequency: 1, evBb: 0 }],
  };
}

function facingReRaise(
  spot: "facing-3bet" | "facing-4bet" | "facing-all-in",
  position: Position,
  stack: PreflopStackBucket,
): PreflopSourceNode {
  const jam = spot === "facing-3bet"
    ? (stack <= 40 ? hands("AA,KK,QQ,JJ,AKs,AKo,AQs") : hands("AA,KK,QQ,AKs,AKo"))
    : spot === "facing-4bet"
      ? hands("AA,KK,AKs")
      : [];
  const calls = spot === "facing-3bet"
    ? subtract(hands("QQ,JJ,TT,99,AKs,AQs,AJs,KQs,AKo,AQo"), jam)
    : spot === "facing-4bet"
      ? subtract(hands("QQ,AKo"), jam)
      : hands(stack <= 40 ? "AA,KK,QQ,JJ,AKs,AQs,AKo" : "AA,KK,QQ,AKs,AKo");
  const bluffs = spot === "facing-3bet" && stack >= 60
    ? subtract(hands("A5s,A4s"), jam, calls)
    : [];
  return {
    id: `${spot}:${position}:${stack}`,
    spot,
    position,
    stack,
    groups: [
      ...(jam.length ? [group(jam, splitActions(spot === "facing-3bet" && stack > 40 ? 0.58 : 1, spot === "facing-3bet" && stack > 40 ? 0.42 : 0, "all-in", "jam"))] : []),
      group(calls, splitActions(0, spot === "facing-all-in" ? 1 : 0.72, "raise", "four-bet")),
      ...(bluffs.length ? [group(bluffs, splitActions(0.24, 0, "raise", "four-bet"))] : []),
    ],
    defaultSource: "expert-baseline-v3",
    defaultActions: [{ kind: "fold", frequency: 1, evBb: 0 }],
  };
}

const nodes = STACKS.flatMap((stack) => POSITIONS.flatMap((position) => [
  unopened(position, stack),
  isolate(position, stack),
  facingOpen("facing-open", position, stack),
  facingOpen("blind-defense", position, stack),
  squeeze(position, stack),
  facingReRaise("facing-3bet", position, stack),
  facingReRaise("facing-4bet", position, stack),
  facingReRaise("facing-all-in", position, stack),
]));

export const PREFLOP_SOURCE_V3: PreflopSourceV3 = {
  version: 3,
  sourceVersion: "expert-baseline-v3.0.0",
  provenance: "expert-baseline-v3",
  nodes,
};
