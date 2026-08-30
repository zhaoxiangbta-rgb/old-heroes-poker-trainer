import type { Card } from "./cards";
import { potOdds, cleanOuts } from "./equity";
import type { WeightedCombo } from "./ranges";
import { bucketPostflopHand } from "../strategy/postflopHandBucket";

export type Intent = "价值" | "保护" | "半诈唬" | "纯诈唬" | "控池" | "诱导";
export type Alternative = {
  kind: "fold" | "call" | "raise";
  action: string;
  amount: number;
  ev: number;
  risk: number;
  intent: Intent;
  equity: number;
  foldEquity: number;
};
export type DecisionFacts = {
  equity: number;
  requiredEquity: number;
  outs: { clean: Card[]; dirty: Card[] };
  alternatives: Alternative[];
  recommended: Alternative;
  risk: { playersBehind: number; effectiveStack: number; spr: number };
  assumptions: string[];
};
export type DecisionAnalysisInput = {
  hero: Card[];
  board: Card[];
  range: WeightedCombo[];
  pot: number;
  toCall: number;
  stack: number;
  streetBet?: number;
  canRaise?: boolean;
  minRaiseTo?: number;
  maxRaiseTo?: number;
  playersBehind: number;
  seed: number;
};

export function classifyIntent(
  equity: number,
  foldEquity: number,
  drawPotential: number,
): Intent {
  if (equity > 0.7 && foldEquity > 0.35) return "价值";
  if (equity > 0.7 && foldEquity < 0.2 && drawPotential < 0.05) return "诱导";
  if (equity > 0.5 && foldEquity < 0.2) return "控池";
  if (equity > 0.5) return "保护";
  if (drawPotential > 0.2) return "半诈唬";
  return "纯诈唬";
}

function representativeOuts(input: DecisionAnalysisInput) {
  if (input.board.length >= 5 || !input.range.length) {
    return { clean: [] as Card[], dirty: [] as Card[] };
  }
  const representative = [...input.range]
    .sort((first, second) => second.weight - first.weight)
    .slice(0, 8);
  const results = representative.map((combo) =>
    cleanOuts(input.hero, input.board, [combo.cards]));
  const candidates = [...new Set<Card>(
    results.flatMap((result) => [...result.clean, ...result.dirty]),
  )];
  return {
    clean: candidates.filter((card) =>
      results.every((result) => result.clean.includes(card))),
    dirty: candidates.filter((card) =>
      results.some((result) => result.dirty.includes(card))),
  };
}

function legalRaiseTargets(input: DecisionAnalysisInput) {
  const streetBet = input.streetBet ?? 0;
  const callTo = streetBet + input.toCall;
  const minRaiseTo = input.minRaiseTo ?? Math.min(streetBet + input.stack, callTo + 2);
  const maxRaiseTo = input.maxRaiseTo ?? streetBet + input.stack;
  if ((input.canRaise ?? true) === false || maxRaiseTo < minRaiseTo) return [];
  const potAfterCall = input.pot + input.toCall;
  const targets = [0.5, 0.75, 1].map((fraction) =>
    Math.max(minRaiseTo, Math.min(maxRaiseTo, Math.round(callTo + potAfterCall * fraction))));
  return [...new Set(targets)].filter((target) =>
    target >= minRaiseTo && target <= maxRaiseTo && target > callTo);
}

export function analyzeDecision(input: DecisionAnalysisInput): DecisionFacts {
  if (input.hero.length !== 2) throw new Error("决策分析需要两张手牌");
  const bucket = bucketPostflopHand(
    [input.hero[0], input.hero[1]],
    input.board,
    input.range,
  );
  const equity = bucket.equity;
  const requiredEquity = input.toCall ? potOdds(input.toCall, input.pot) : 0;
  const outs = representativeOuts(input);
  const drawPotential = Math.min(
    0.5,
    outs.clean.length * (input.board.length === 3 ? 0.02 : 0.04),
  );
  const fold: Alternative = {
    kind: "fold",
    action: "弃牌",
    amount: 0,
    ev: 0,
    risk: 0,
    intent: "控池",
    equity,
    foldEquity: 1,
  };
  const callEv = equity * (input.pot + input.toCall) - input.toCall;
  const call: Alternative = {
    kind: "call",
    action: input.toCall ? `跟注 ${input.toCall}` : "过牌",
    amount: input.toCall,
    ev: callEv,
    risk: input.toCall,
    intent: classifyIntent(equity, 0.08, drawPotential),
    equity,
    foldEquity: 0,
  };
  const alternatives = [fold, call];
  const streetBet = input.streetBet ?? 0;
  const callTo = streetBet + input.toCall;
  for (const target of legalRaiseTargets(input)) {
    const investment = target - streetBet;
    const fraction = investment / Math.max(1, input.pot + input.toCall);
    const strengthFold = Math.max(0.08, Math.min(0.58, 0.35 - 0.18 * equity + 0.16 * fraction));
    const behindPenalty = input.playersBehind * 0.06;
    const foldEquity = Math.max(0.02, strengthFold - behindPenalty);
    const opponentCall = Math.max(0, target - callTo);
    const finalPot = input.pot + investment + opponentCall;
    const ev = foldEquity * input.pot +
      (1 - foldEquity) * (equity * finalPot - investment) -
      behindPenalty * investment;
    alternatives.push({
      kind: "raise",
      action: target === input.maxRaiseTo ? `全下 ${target}` : `加注到 ${target}`,
      amount: target,
      ev,
      risk: investment,
      intent: classifyIntent(equity, foldEquity, drawPotential),
      equity,
      foldEquity,
    });
  }
  const recommended = [...alternatives].sort((first, second) => second.ev - first.ev)[0];
  return {
    equity,
    requiredEquity,
    outs,
    alternatives,
    recommended,
    risk: {
      playersBehind: input.playersBehind,
      effectiveStack: input.stack,
      spr: input.stack / Math.max(1, input.pot),
    },
    assumptions: [
      "胜率使用与本地策略引擎一致的固定预算范围抽象",
      "所有下注候选均由规则引擎合法上下限约束",
      "普通朋友局跟注偏宽、诈唬偏少",
      "身后玩家按额外继续风险折减加注 EV",
    ],
  };
}
