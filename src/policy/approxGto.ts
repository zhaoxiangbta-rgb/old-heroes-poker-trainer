import { exactEquity, potOdds } from "../engine/equity";
import type { WeightedCombo } from "../engine/ranges";
import { extractHandFeatures } from "./handFeatures";
import { probabilitiesFromEv, sampleCandidate } from "./mixedStrategy";
import { preflopFrequencies } from "./preflop";
import { inferRange } from "./rangeModel";
import type {
  DecisionContext,
  PokerPolicy,
  PolicyAction,
  PolicyCandidate,
  PolicyFacts,
  PolicyIntent,
} from "./types";

function actionKey(action: PolicyAction) {
  return action.type === "raise" ? `raise:${action.to}` : action.type;
}

export function candidateActions(context: DecisionContext): PolicyAction[] {
  const actions: PolicyAction[] = [];
  if (context.legal.fold) actions.push({ type: "fold" });
  if (context.legal.check) actions.push({ type: "check" });
  if (context.legal.call > 0) actions.push({ type: "call" });
  if (context.legal.raise) {
    for (const fraction of [0.33, 0.5, 0.75, 1]) {
      const raw =
        context.currentBet === 0
          ? Math.round(context.pot * fraction)
          : context.currentBet + Math.round(context.pot * fraction);
      const to = Math.max(context.minRaiseTo, Math.min(context.maxRaiseTo, raw));
      if (to > context.currentBet) actions.push({ type: "raise", to });
    }
    actions.push({ type: "raise", to: context.maxRaiseTo });
  }
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = actionKey(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sampledRange(range: WeightedCombo[], boardLength: number) {
  // Exact runout enumeration is retained for each sampled combo. A small,
  // deterministic stratified range sample keeps table interaction responsive.
  const limit = boardLength === 3 ? 6 : boardLength === 4 ? 8 : 16;
  if (range.length <= limit) return range;
  const sorted = [...range].sort(
    (a, b) => b.weight - a.weight || a.cards.join("").localeCompare(b.cards.join("")),
  );
  const stride = sorted.length / limit;
  return Array.from({ length: limit }, (_, index) => sorted[Math.floor(index * stride)]);
}

function weightedEquity(context: DecisionContext, range: WeightedCombo[]) {
  const selected = sampledRange(range, context.board.length);
  let weighted = 0;
  let total = 0;
  for (const combo of selected) {
    const equity = exactEquity([context.hole, combo.cards], context.board).equity[0];
    weighted += equity * combo.weight;
    total += combo.weight;
  }
  const headsUp = total ? weighted / total : 0.5;
  return {
    equity: Math.pow(headsUp, Math.max(1, context.activePlayers - 1)),
    sampledCombos: selected.length,
  };
}

function intent(
  strength: number,
  drawOuts: number,
  foldEquity: number,
  action: PolicyAction,
): PolicyIntent {
  if (action.type === "check") return strength > 0.72 ? "induce" : "pot-control";
  if (action.type !== "raise") return "pot-control";
  if (strength >= 0.68) return "value";
  if (strength >= 0.48) return "protection";
  if (drawOuts >= 4) return "semi-bluff";
  return foldEquity >= 0.3 ? "bluff" : "pot-control";
}

function preflopDecision(context: DecisionContext) {
  const frequencies = preflopFrequencies(context);
  const candidates: PolicyCandidate[] = frequencies.map((item) => ({
    action: item.action,
    label: `${item.action.type}: ${item.reason}`,
    ev: Math.log(Math.max(0.0001, item.frequency)),
    probability: item.frequency,
    intent: item.action.type === "raise" ? "value" : "pot-control",
  }));
  const sampled = sampleCandidate(candidates, context.seed, context.decisionIndex);
  return {
    action: sampled.candidate.action,
    candidates,
    facts: {
      strength: 0,
      equity: 0,
      requiredEquity: context.legal.call ? potOdds(context.legal.call, context.pot) : 0,
      spr: context.effectiveStack / Math.max(1, context.pot),
      rangeCombos: 0,
      sampled: sampled.sampled,
      elapsedMs: 0,
    },
  };
}

type PostflopBase = {
  candidates: PolicyCandidate[];
  facts: Omit<PolicyFacts, "sampled">;
};

const postflopCache = new Map<string, PostflopBase>();

function cacheKey(context: DecisionContext) {
  return JSON.stringify(context, (key, value) =>
    key === "seed" || key === "decisionIndex" ? undefined : value,
  );
}

function postflopBase(context: DecisionContext): PostflopBase {
  const features = extractHandFeatures(context.hole, context.board);
  const range = inferRange({
    position: context.position,
    heroHole: context.hole,
    board: context.board,
    activePlayers: context.activePlayers,
    visibleLine: context.visibleLine,
  });
  const equityResult = weightedEquity(context, range);
  const equity = equityResult.equity;
  const actions = candidateActions(context);
  const currentStreetLine = context.visibleLine.filter(
    (entry) => entry.street === context.street,
  );
  const checkedTo =
    context.currentBet === 0 &&
    currentStreetLine.length > 0 &&
    currentStreetLine.every((entry) => entry.kind === "check");
  const candidates: PolicyCandidate[] = actions.map((action) => {
    let ev = 0;
    let foldEquity = 0;
    let label: string = action.type;
    if (action.type === "check") {
      ev = equity * context.pot * (0.88 + features.strength * 0.12);
      label = "过牌";
    } else if (action.type === "call") {
      ev = equity * (context.pot + context.legal.call) - context.legal.call;
      label = `跟注 ${context.legal.call}`;
    } else if (action.type === "raise") {
      const investment = action.to - context.streetBet;
      const opponentCall = Math.max(0, action.to - context.currentBet);
      const sizePot = investment / Math.max(1, context.pot);
      foldEquity = Math.max(
        0.04,
        Math.min(
          0.62,
          0.3 + sizePot * 0.12 - features.strength * 0.12 -
            Math.max(0, context.activePlayers - 2) * 0.14 -
            context.playersBehind * 0.05 + features.nutBlockers * 0.04,
        ),
      );
      if (context.street === "river" && features.strength < 0.25)
        foldEquity *= features.nutBlockers ? 0.9 : 0.55;
      const finalPot = context.pot + investment + opponentCall;
      ev =
        foldEquity * context.pot +
        (1 - foldEquity) * (equity * finalPot - investment) -
        context.playersBehind * investment * 0.04;
      // Checking to a player transfers some initiative. Without accounting for
      // it, showdown equity makes checking dominate every unmade hand and the
      // table unrealistically checks down. Keep the bonus modest multiway.
      if (checkedTo) {
        const initiative = context.activePlayers === 2 ? 0.12 : 0.04;
        const drawBonus = Math.min(0.05, features.cleanOutEstimate * 0.006);
        ev += context.pot * (initiative + drawBonus);
      }
      label = `${context.currentBet ? "加注" : "下注"}到 ${action.to}`;
    } else {
      label = "弃牌";
    }
    return {
      action,
      label,
      ev,
      probability: 0,
      intent: intent(features.strength, features.cleanOutEstimate, foldEquity, action),
    };
  });
  const temperature = Math.max(0.65, context.pot * 0.025);
  const mixed = probabilitiesFromEv(candidates, temperature, Math.max(1.5, context.pot * 0.08));
  return {
    candidates: mixed,
    facts: {
      strength: features.strength,
      equity,
      requiredEquity: context.legal.call ? potOdds(context.legal.call, context.pot) : 0,
      spr: context.effectiveStack / Math.max(1, context.pot),
      rangeCombos: range.length,
      elapsedMs: 0,
    },
  };
}

function postflopDecision(context: DecisionContext) {
  const key = cacheKey(context);
  let base = postflopCache.get(key);
  if (!base) {
    base = postflopBase(context);
    if (postflopCache.size >= 256) postflopCache.delete(postflopCache.keys().next().value!);
    postflopCache.set(key, base);
  }
  const sampled = sampleCandidate(base.candidates, context.seed, context.decisionIndex);
  return {
    action: sampled.candidate.action,
    candidates: base.candidates,
    facts: { ...base.facts, sampled: sampled.sampled },
  };
}

export const approxGtoPolicy: PokerPolicy = {
  decide(context) {
    try {
      return context.street === "preflop"
        ? preflopDecision(context)
        : postflopDecision(context);
    } catch (error) {
      const action: PolicyAction = context.legal.check
        ? { type: "check" }
        : context.legal.call > 0 && context.legal.call / Math.max(1, context.pot) <= 0.2
          ? { type: "call" }
          : { type: "fold" };
      return {
        action,
        candidates: [
          { action, label: "保守降级", ev: 0, probability: 1, intent: "pot-control" },
        ],
        facts: {
          strength: 0,
          equity: 0,
          requiredEquity: context.legal.call ? potOdds(context.legal.call, context.pot) : 0,
          spr: context.effectiveStack / Math.max(1, context.pot),
          rangeCombos: 0,
          sampled: 0,
          elapsedMs: 0,
          fallback: error instanceof Error ? error.message : "policy error",
        },
      };
    }
  },
};
