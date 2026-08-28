import { decideWithProfile } from "../policy/tableProfiles";
import { sampleCandidate } from "../policy/mixedStrategy";
import type { PolicyIntent } from "../policy/types";
import { adaptLegacyDecision, toLegacyContext } from "./legacyAdapter";
import { lookupPreflopBlueprint } from "./preflopBlueprint";
import { classifyPreflopNode, recommendedRaiseTo } from "./preflopNode";
import { applyBoundedDeviation } from "./profileDeviation";
import { lookupPostflopBlueprint } from "./postflopBlueprint";
import { bucketPostflopHand } from "./postflopHandBucket";
import { classifyHeadsUpPostflopNode } from "./postflopNode";
import { resolveHeadsUpPostflop } from "./postflopResolver";
import { classifyPostflopTexture } from "./postflopTexture";
import { estimateMultiwayEquity } from "./multiwayEquity";
import { classifyMultiwayOuts, type MultiwayOutFacts } from "./multiwayOuts";
import { multiwayPotExposure } from "./multiwayPots";
import { resolveMultiwayStrategy } from "./multiwayStrategy";
import type {
  StrategyAction,
  StrategyEngine,
  StrategyRequest,
  StrategyResult,
} from "./types";

export type LocalStrategyEngineOptions = {
  decidePreflop?: (request: StrategyRequest) => StrategyResult;
};

function isLegal(action: StrategyAction, request: StrategyRequest) {
  const legal = request.state.legal;
  if (action.action === "fold") return legal.canFold;
  if (action.action === "check") return legal.canCheck;
  if (action.action === "call") return legal.canCall;
  return legal.canRaise && action.toAmount !== undefined &&
    action.toAmount >= legal.minRaiseTo && action.toAmount <= legal.maxRaiseTo;
}

function fallbackAction(request: StrategyRequest): StrategyAction {
  const legal = request.state.legal;
  const base = { frequency: 1, ev: 0, intent: "pot-control" as PolicyIntent };
  if (legal.canCheck) return { action: "check", ...base };
  if (legal.canCall) return { action: "call", ...base };
  if (legal.canFold) return { action: "fold", ...base };
  if (legal.canRaise) {
    return {
      action: legal.minRaiseTo === legal.maxRaiseTo ? "all-in" : "raise",
      toAmount: legal.minRaiseTo,
      potFraction: legal.minRaiseTo / Math.max(1, request.state.pot),
      ...base,
    };
  }
  throw new Error("规则引擎未提供可用动作");
}

function safeResult(request: StrategyRequest, reason: string): StrategyResult {
  return {
    actions: [fallbackAction(request)],
    confidence: 0,
    source: "safe-fallback",
    strategyVersion: "legacy-adapter-v1",
    rangeFacts: {
      opponentSeats: Object.keys(request.ranges.bySeat).length,
      lastActionIndex: request.ranges.lastActionIndex,
    },
    explanationFacts: { fallback: reason },
  };
}

function normalize(result: StrategyResult, request: StrategyRequest): StrategyResult {
  const actions = result.actions.filter(
    (action) => isLegal(action, request) && Number.isFinite(action.ev) && action.frequency > 0,
  );
  const total = actions.reduce((sum, action) => sum + action.frequency, 0);
  if (!total) return safeResult(request, "策略未返回合法权重");
  return {
    ...result,
    actions: actions.map((action) => ({
      ...action,
      frequency: action.frequency / total,
    })),
  };
}

function preflopResult(request: StrategyRequest): StrategyResult {
  const node = classifyPreflopNode(request.state);
  const blueprint = lookupPreflopBlueprint(node, request.state.heroHole);
  const actor = request.state.players.find(
    (player) => player.seat === request.state.actingSeat,
  );
  if (!actor) throw new Error("公开状态缺少决策玩家");
  const raiseTo = recommendedRaiseTo(node, request.state);
  const mappedActions: StrategyAction[] = blueprint.actions.map((item) => {
    if (item.action === "fold" || item.action === "check" || item.action === "call") {
      return { ...item, action: item.action };
    }
    if (
      !request.state.legal.canRaise &&
      request.state.legal.canCall &&
      request.state.legal.callAmount >= actor.stack
    ) {
      return { ...item, action: "call" };
    }
    const toAmount = item.action === "all-in"
      ? request.state.legal.maxRaiseTo
      : raiseTo;
    return {
      ...item,
      action: toAmount === request.state.legal.maxRaiseTo ? "all-in" : "raise",
      toAmount,
      potFraction: (toAmount - actor.streetBet) / Math.max(1, request.state.pot),
    };
  });
  const actions = [...mappedActions.reduce((byAction, action) => {
    const key = `${action.action}:${action.toAmount ?? ""}`;
    const previous = byAction.get(key);
    if (!previous) {
      byAction.set(key, { ...action });
      return byAction;
    }
    const total = previous.frequency + action.frequency;
    previous.ev = total > 0
      ? (previous.ev * previous.frequency + action.ev * action.frequency) / total
      : previous.ev;
    previous.frequency = total;
    if (action.intent === "value") previous.intent = "value";
    return byAction;
  }, new Map<string, StrategyAction>()).values()];
  const rangeCombos = Object.values(request.ranges.bySeat)
    .reduce((sum, range) => sum + range.length, 0);
  return applyBoundedDeviation({
    actions,
    confidence: blueprint.confidence,
    source: blueprint.source,
    nodeId: blueprint.nodeId,
    strategyVersion: "preflop-abstract-v1",
    rangeFacts: {
      opponentSeats: Object.keys(request.ranges.bySeat).length,
      lastActionIndex: request.ranges.lastActionIndex,
      rangeCombos,
    },
    explanationFacts: {
      ...blueprint.explanationFacts,
      raiseTo,
      algorithm: "expert-baseline+boundary-regret-v1",
    },
  }, request.state.tableProfileId, request.playerProfile);
}

function postflopResult(request: StrategyRequest): StrategyResult | undefined {
  const liveOpponents = request.state.players.filter(
    (player) => player.seat !== request.state.actingSeat && !player.folded,
  );
  if (liveOpponents.length !== 1) return undefined;
  const texture = classifyPostflopTexture(request.state.board);
  const node = classifyHeadsUpPostflopNode(request.state, texture);
  if (!node) return undefined;
  const opponentRange = request.ranges.bySeat[liveOpponents[0].seat] ?? [];
  const bucket = bucketPostflopHand(
    request.state.heroHole,
    request.state.board,
    opponentRange,
  );
  const base = lookupPostflopBlueprint(node, bucket, request.state);
  return applyBoundedDeviation(
    resolveHeadsUpPostflop(base, request, node, bucket),
    request.state.tableProfileId,
    request.playerProfile,
  );
}

function multiwayPostflopResult(request: StrategyRequest): StrategyResult | undefined {
  const liveOpponents = request.state.players.filter(
    (player) => player.seat !== request.state.actingSeat && !player.folded,
  );
  if (liveOpponents.length < 2) return undefined;
  const rangesBySeat = Object.fromEntries(liveOpponents.map((player) => [
    player.seat,
    request.ranges.bySeat[player.seat] ?? [],
  ]));
  if (Object.values(rangesBySeat).some((range) => range.length === 0)) {
    return undefined;
  }
  const equity = estimateMultiwayEquity(
    request.state.heroHole,
    request.state.board,
    rangesBySeat,
    {
      maxJointSamples: Math.max(24, Math.min(72, Math.floor(request.deadlineMs * 0.3))),
      maxRunouts: request.state.board.length === 5
        ? 1
        : request.state.board.length === 4 ? 28 : 16,
    },
  );
  const outs: MultiwayOutFacts = request.state.board.length < 5
    ? classifyMultiwayOuts(request.state.heroHole, request.state.board, rangesBySeat)
    : { clean: [], dirty: [], shared: [], counterfeit: [], reverseImpliedRisk: 0 };
  const actor = request.state.players.find(
    (player) => player.seat === request.state.actingSeat,
  );
  if (!actor) throw new Error("公开状态缺少决策玩家");
  const passiveTo = actor.streetBet +
    (request.state.legal.canCall ? request.state.legal.callAmount : 0);
  const exposure = multiwayPotExposure(request.state, passiveTo);
  return applyBoundedDeviation(
    resolveMultiwayStrategy(request, equity, outs, exposure),
    request.state.tableProfileId,
    request.playerProfile,
  );
}

export function createLocalStrategyEngine(
  options: LocalStrategyEngineOptions = {},
): StrategyEngine {
  const decidePreflop = options.decidePreflop ?? preflopResult;
  return {
    decide(request) {
      if (request.deadlineMs <= 0) return safeResult(request, "决策预算已用尽");
      try {
        if (request.state.street === "preflop") {
          return normalize(decidePreflop(request), request);
        }
        const postflop = postflopResult(request);
        if (postflop) return normalize(postflop, request);
        const multiway = multiwayPostflopResult(request);
        if (multiway) return normalize(multiway, request);
        const decision = decideWithProfile(
          toLegacyContext(request),
          request.state.tableProfileId,
          request.playerProfile,
        );
        return normalize(adaptLegacyDecision(decision, request), request);
      } catch (error) {
        return safeResult(
          request,
          error instanceof Error ? error.message : "本地策略异常",
        );
      }
    },
  };
}

export function selectStrategyAction(
  result: StrategyResult,
  seed: number,
  decisionIndex: number,
) {
  const sampled = sampleCandidate(
    result.actions.map((action, index) => ({
      action: action.action === "fold" || action.action === "check" || action.action === "call"
        ? { type: action.action }
        : { type: "raise", to: action.toAmount ?? 0 },
      label: String(index),
      ev: action.ev,
      probability: action.frequency,
      intent: action.intent,
    })),
    seed,
    decisionIndex,
  );
  return {
    action: result.actions[Number(sampled.candidate.label)],
    sampled: sampled.sampled,
  };
}
