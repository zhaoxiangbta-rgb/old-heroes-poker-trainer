import type { Position } from "../game/game";
import type {
  PreflopNode,
  PreflopStackBucket,
  PublicDecisionState,
  StackInterpolation,
} from "./types";

export const PREFLOP_STACK_BUCKETS: readonly PreflopStackBucket[] = [
  25,
  40,
  60,
  100,
  150,
  200,
];

const POSITION_ORDER: Record<Position, number> = {
  UTG: 0,
  HJ: 1,
  CO: 2,
  BTN: 3,
  SB: 4,
  BB: 5,
};

function clamp(value: number, lower: number, upper: number) {
  return Math.max(lower, Math.min(upper, value));
}

export function nearestStackBuckets(effectiveStackBb: number): StackInterpolation {
  const first = PREFLOP_STACK_BUCKETS[0];
  const last = PREFLOP_STACK_BUCKETS[PREFLOP_STACK_BUCKETS.length - 1];
  if (effectiveStackBb <= first) return { lower: first, upper: first, weight: 0 };
  if (effectiveStackBb >= last) return { lower: last, upper: last, weight: 0 };
  for (let index = 1; index < PREFLOP_STACK_BUCKETS.length; index += 1) {
    const upper = PREFLOP_STACK_BUCKETS[index];
    if (effectiveStackBb > upper) continue;
    const lower = PREFLOP_STACK_BUCKETS[index - 1];
    if (effectiveStackBb === upper) return { lower: upper, upper, weight: 0 };
    return {
      lower,
      upper,
      weight: (effectiveStackBb - lower) / (upper - lower),
    };
  }
  return { lower: last, upper: last, weight: 0 };
}

function playerPosition(state: PublicDecisionState, seat: number) {
  return state.players.find((player) => player.seat === seat)?.position;
}

function hasPosition(actor: Position, aggressor?: Position) {
  if (!aggressor) return actor === "BTN" || actor === "CO";
  if (actor === "SB" || actor === "BB") return false;
  if (aggressor === "SB" || aggressor === "BB") return true;
  return POSITION_ORDER[actor] > POSITION_ORDER[aggressor];
}

export function classifyPreflopNode(state: PublicDecisionState): PreflopNode {
  if (state.street !== "preflop") throw new Error("翻前节点分类器只接受翻前状态");
  const actor = state.players.find((player) => player.seat === state.actingSeat);
  if (!actor) throw new Error("公开状态缺少决策玩家");
  const actions = state.actions.filter((action) => action.street === "preflop");
  const aggressive = actions.filter((action) =>
    action.kind === "raise" || action.kind === "bet" || action.kind === "all-in"
  );
  const firstAggressor = aggressive[0];
  const lastAggressor = aggressive.at(-1);
  const firstRaiseIndex = firstAggressor ? actions.indexOf(firstAggressor) : -1;
  const coldCallers = firstRaiseIndex < 0
    ? 0
    : actions.slice(firstRaiseIndex + 1).filter((action) => action.kind === "call").length;
  const limpers = firstRaiseIndex >= 0
    ? actions.slice(0, firstRaiseIndex).filter((action) => action.kind === "call").length
    : actions.filter((action) => action.kind === "call").length;
  const lastIsAllIn = lastAggressor?.kind === "all-in";
  const raiseCount = aggressive.length;
  const spot = lastIsAllIn
    ? "facing-all-in"
    : raiseCount >= 3
      ? "facing-4bet"
      : raiseCount >= 2
        ? "facing-3bet"
        : raiseCount === 1 && coldCallers > 0
          ? "squeeze"
          : raiseCount === 1 && (actor.position === "SB" || actor.position === "BB")
            ? "blind-defense"
            : raiseCount === 1
              ? "facing-open"
              : limpers > 0
                ? "isolate-limpers"
                : "unopened";
  const opponentTotals = state.players
    .filter((player) => player.seat !== actor.seat && !player.folded)
    .map((player) => player.stack + player.streetBet);
  const actorTotal = actor.stack + actor.streetBet;
  const effectiveChips = Math.min(actorTotal, Math.max(0, ...opponentTotals));
  const effectiveStackBb = effectiveChips / Math.max(1, state.blindLevel.big);
  const openerPosition = firstAggressor
    ? playerPosition(state, firstAggressor.actorSeat)
    : undefined;
  const lastAggressorPosition = lastAggressor
    ? playerPosition(state, lastAggressor.actorSeat)
    : undefined;
  const stack = nearestStackBuckets(effectiveStackBb);
  return {
    spot,
    actingPosition: actor.position,
    openerPosition,
    lastAggressorPosition,
    raiseCount,
    coldCallers,
    limpers,
    effectiveStackBb,
    stack,
    inPosition: hasPosition(actor.position, lastAggressorPosition),
    nodeId: [
      "pf1",
      spot,
      actor.position,
      openerPosition ?? "none",
      `${stack.lower}-${stack.upper}`,
      `r${raiseCount}`,
      `c${coldCallers}`,
    ].join(":"),
  };
}

export function recommendedRaiseTo(
  node: PreflopNode,
  state: PublicDecisionState,
) {
  const legal = state.legal;
  if (!legal.canRaise) return legal.maxRaiseTo;
  const bigBlind = state.blindLevel.big;
  let target: number;
  if (node.spot === "unopened") {
    target = Math.round(bigBlind * 2.5);
  } else if (node.spot === "isolate-limpers") {
    target = Math.round(bigBlind * (4 + node.limpers));
  } else if (
    node.spot === "facing-3bet" ||
    node.spot === "facing-4bet" ||
    node.spot === "facing-all-in"
  ) {
    target = Math.round(state.currentBet * 2.25);
  } else {
    const multiplier = node.inPosition ? 3 : 4;
    target = Math.round(state.currentBet * (multiplier + node.coldCallers));
  }
  return clamp(target, legal.minRaiseTo, legal.maxRaiseTo);
}
