import type { Street } from "../../game/game";
import type { StrategyAction } from "../types";
import type { PokerFactsV4 } from "./pokerFacts";

export type StreetPlanStatusV4 = "continue" | "complete" | "abandon";

export type StreetPlanHistoryV4 = {
  street: Street;
  status: StreetPlanStatusV4;
  reason: "made-target" | "equity-collapse" | "range-shift" | "plan-intact";
};

export type StreetPlanV4 = {
  version: 4;
  id: string;
  createdAtStreet: Street;
  sourceAction: StrategyAction["action"];
  intent: StrategyAction["intent"];
  reason: string;
  targetCombos: string[];
  foldTargets: string[];
  continueOn: string[];
  abandonOn: string[];
  status: StreetPlanStatusV4;
  history: StreetPlanHistoryV4[];
};

export type CreateStreetPlanInputV4 = {
  street: Street;
  action: StrategyAction;
  facts: PokerFactsV4;
  targetCombos: string[];
  foldTargets: string[];
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hasActiveDraw(facts: PokerFactsV4) {
  return facts.draws.some((draw) => !draw.backdoor);
}

function hasStrongBlocker(facts: PokerFactsV4) {
  return facts.blockers.some((blocker) => blocker.strength >= 0.75);
}

export function createStreetPlanV4(input: CreateStreetPlanInputV4): StreetPlanV4 {
  const drawPlan = input.action.intent === "semi-bluff" || hasActiveDraw(input.facts);
  const bluffPlan = input.action.intent === "bluff";
  const reason = drawPlan
    ? "用真实听牌权益和弃牌率共同支撑"
    : bluffPlan
      ? "用阻断牌和对手弃牌范围支撑"
      : input.action.intent === "value"
        ? "向更差继续范围取值"
        : "控制底池并保留摊牌价值";
  const signature = [
    input.street,
    input.action.action,
    input.action.toAmount ?? 0,
    input.action.intent,
    input.facts.absoluteCategory,
    input.facts.privateContribution,
    input.targetCombos.join(","),
    input.foldTargets.join(","),
  ].join("|");
  return {
    version: 4,
    id: `spv4:${stableHash(signature)}`,
    createdAtStreet: input.street,
    sourceAction: input.action.action,
    intent: input.action.intent,
    reason,
    targetCombos: [...input.targetCombos],
    foldTargets: [...input.foldTargets],
    continueOn: drawPlan
      ? ["made-draw", "active-draw", "strong-blocker"]
      : ["range-advantage", "worse-calls", "showdown-value"],
    abandonOn: ["equity-collapse", "range-shift", "no-fold-targets"],
    status: "continue",
    history: [],
  };
}

export function updateStreetPlanV4(
  plan: StreetPlanV4,
  input: { street: Street; facts: PokerFactsV4; rangeShift?: boolean },
): StreetPlanV4 {
  let status: StreetPlanStatusV4 = "continue";
  let reason: StreetPlanHistoryV4["reason"] = "plan-intact";
  if (input.rangeShift) {
    status = "abandon";
    reason = "range-shift";
  } else if (plan.intent === "semi-bluff" &&
    input.facts.privateContribution !== "none" &&
    input.facts.privateContribution !== "kicker") {
    status = "complete";
    reason = "made-target";
  } else if (plan.intent === "bluff" && !hasActiveDraw(input.facts) && !hasStrongBlocker(input.facts)) {
    status = "abandon";
    reason = "equity-collapse";
  }
  return {
    ...plan,
    status,
    history: [...plan.history, { street: input.street, status, reason }],
  };
}
