import type { WeightedCombo } from "../../engine/ranges";
import type { PolicyIntent } from "../../policy/types";
import { legalPostflopTarget } from "../postflopSizing";
import type { PostflopSituation, StrategyAction, StrategyRequest, StrategyResult } from "../types";
import { profileCombo } from "./comboProfile";
import { estimateElasticResponse, type ElasticResponseV3 } from "./elasticResponse";
import { evaluateCandidateV3 } from "./futureStreetValue";
import { applyDominanceGateV4 } from "../v4/dominanceGate";
import { analyzePokerFactsV4 } from "../v4/pokerFacts";
import { estimateMultiwayEquity, type MultiwayEquityResult } from "../multiwayEquity";

export type DecidePostflopV3Input = {
  request: StrategyRequest;
  situation: PostflopSituation;
  opponentRange: readonly WeightedCombo[];
};

type Candidate = Omit<StrategyAction, "frequency"> & { prior: number };
const LIVE_RANGE_COMBO_BUDGET = 160;
const LIVE_EQUITY_COMBO_BUDGET = 20;
const BOT_EQUITY_COMBO_BUDGET = 12;

function abstractOpponentRange(
  range: readonly WeightedCombo[],
  budget = LIVE_RANGE_COMBO_BUDGET,
): WeightedCombo[] {
  const valid = range.filter((combo) => combo.weight > 0);
  if (valid.length <= budget) return valid.map((combo) => ({ ...combo }));
  const total = valid.reduce((sum, combo) => sum + combo.weight, 0);
  if (total <= 0) return [];
  const bucketMass = total / budget;
  const selected = new Map<string, WeightedCombo>();
  let cumulative = 0;
  let index = 0;
  for (let bucket = 0; bucket < budget; bucket += 1) {
    const target = (bucket + 0.5) * bucketMass;
    while (index < valid.length - 1 && cumulative + valid[index].weight < target) {
      cumulative += valid[index].weight;
      index += 1;
    }
    const combo = valid[index];
    const key = combo.cards.join("");
    const existing = selected.get(key);
    if (existing) existing.weight += bucketMass;
    else selected.set(key, { ...combo, weight: bucketMass });
  }
  return [...selected.values()];
}

function currentEquity(input: DecidePostflopV3Input) {
  const known = [...input.request.state.heroHole, ...input.request.state.board];
  const valid = input.opponentRange.filter((combo) =>
    combo.weight > 0 && combo.cards.every((card) => !known.includes(card)));
  if (!valid.length) return {
    heroEquity: 0.5,
    opponentEquity: {},
    validJointSamples: 0,
    rejectedConflicts: 0,
    exact: false,
    elapsedMs: 0,
  } satisfies MultiwayEquityResult;
  const fastBotBudget = input.request.deadlineMs <= 100;
  const comboBudget = fastBotBudget ? BOT_EQUITY_COMBO_BUDGET : LIVE_EQUITY_COMBO_BUDGET;
  const runoutBudget = 12;
  return estimateMultiwayEquity(
    input.request.state.heroHole,
    input.request.state.board,
    { 0: valid },
    {
      maxJointSamples: Math.min(comboBudget, valid.length),
      maxRunouts: input.request.state.board.length === 5
        ? 1
        : runoutBudget,
    },
  );
}

function passiveCandidate(input: DecidePostflopV3Input, equity: number): Candidate {
  const { request, situation } = input;
  if (request.state.legal.canCheck) {
    return {
      action: "check",
      ev: equity * request.state.pot,
      intent: "pot-control",
      prior: situation.inPosition ? 0.62 : 0.78,
    };
  }
  if (request.state.legal.canCall) {
    const call = request.state.legal.callAmount;
    return {
      action: "call",
      ev: equity * (request.state.pot + call) - call,
      intent: "pot-control",
      prior: 0.72,
    };
  }
  return { action: "fold", ev: 0, intent: "pot-control", prior: 1 };
}

function valueIntent(profile: ReturnType<typeof profileCombo>, response: ElasticResponseV3): PolicyIntent {
  if (response.worseMadeCall + response.drawCall >= 0.16 && profile.currentMade) return "value";
  if (profile.drawVector.length) return "semi-bluff";
  if (profile.showdownTier === "strong" || profile.showdownTier === "near-nuts" || profile.showdownTier === "nuts") return "induce";
  return profile.currentMade ? "protection" : "bluff";
}

function sizePrior(
  fraction: number,
  profile: ReturnType<typeof profileCombo>,
  response: ElasticResponseV3,
  situation: PostflopSituation,
) {
  let prior = situation.inPosition ? 1.08 : 0.86;
  if (fraction <= 0.5) prior *= 1.12;
  if (fraction >= 1) prior *= 0.82;
  if (profile.construction === "board-pair-trips") {
    prior *= fraction <= 2 / 3 ? 1.35 : fraction >= 1 ? 0.48 : 1;
  }
  if (response.worseMadeCall + response.drawCall < 0.18 && fraction >= 1) prior *= 0.55;
  if (situation.line === "donk" && !situation.rangeShiftCard) prior *= 0.45;
  return prior;
}

function aggressiveCandidates(
  input: DecidePostflopV3Input,
  profile: ReturnType<typeof profileCombo>,
) {
  if (!input.request.state.legal.canRaise) return [];
  const activeDraw = profile.drawVector.some((draw) => draw !== "backdoor-flush");
  const backdoorOnly = profile.drawVector.includes("backdoor-flush") && !activeDraw;
  const checkedTo = input.situation.line === "checked-to" || input.situation.line === "first-to-act";
  const supportedBluff = activeDraw || profile.nutBlockers > 0 ||
    (checkedTo && (backdoorOnly || profile.kickerBand === "top" || profile.kickerBand === "strong"));
  // Do not manufacture a mandatory bluff from featureless air. Facing a bet,
  // raising needs a made hand, draw or relevant blocker. When checked to, only
  // stronger high-card/backdoor candidates may enter the low-frequency bluff mix.
  if (!profile.currentMade && !supportedBluff) return [];
  const actor = input.request.state.players.find((player) => player.seat === input.request.state.actingSeat)!;
  const fractions = [1 / 3, 0.5, 2 / 3, 1, 1.5];
  const seen = new Set<number>();
  const candidates: Candidate[] = [];
  for (const fraction of fractions) {
    const toAmount = legalPostflopTarget(input.request.state, fraction);
    if (seen.has(toAmount)) continue;
    seen.add(toAmount);
    const investment = Math.max(0, toAmount - actor.streetBet);
    const actualFraction = input.request.state.currentBet === 0
      ? investment / Math.max(1, input.request.state.pot)
      : Math.max(0, investment - input.request.state.legal.callAmount) /
        Math.max(1, input.request.state.pot + input.request.state.legal.callAmount);
    const response = estimateElasticResponse({
      heroHole: input.request.state.heroHole,
      board: input.request.state.board,
      opponentRange: input.opponentRange,
      situation: input.situation,
      potFraction: actualFraction,
      playerProfile: input.request.playerProfile,
    });
    const value = evaluateCandidateV3({
      pot: input.request.state.pot,
      investment,
      potFraction: actualFraction,
      streetsRemaining: input.request.state.street === "flop" ? 2 : input.request.state.street === "turn" ? 1 : 0,
      inPosition: input.situation.inPosition,
      response,
      heroProfile: profile,
    });
    candidates.push({
      action: toAmount === input.request.state.legal.maxRaiseTo
        ? "all-in"
        : input.request.state.currentBet === 0 ? "bet" : "raise",
      toAmount,
      potFraction: fraction,
      ev: value.total,
      intent: valueIntent(profile, response),
      prior: sizePrior(fraction, profile, response, input.situation),
    });
  }
  return candidates;
}

function mix(candidates: Candidate[], pot: number, profile: ReturnType<typeof profileCombo>) {
  const best = Math.max(...candidates.map((candidate) => candidate.ev));
  const temperature = Math.max(2, pot * 0.28);
  const raw = candidates.map((candidate) =>
    Math.exp((candidate.ev - best) / temperature) * candidate.prior);
  let total = raw.reduce((sum, value) => sum + value, 0);
  let frequencies = raw.map((value) => value / total);
  const passiveIndex = candidates.findIndex((candidate) => candidate.action === "check" || candidate.action === "call");
  if (passiveIndex >= 0 && profile.construction === "board-pair-trips" && frequencies[passiveIndex] < 0.12) {
    const required = 0.12 - frequencies[passiveIndex];
    const aggressiveTotal = 1 - frequencies[passiveIndex];
    frequencies = frequencies.map((frequency, index) =>
      index === passiveIndex ? 0.12 : frequency * (1 - 0.12) / Math.max(Number.EPSILON, aggressiveTotal));
    if (required < 0) total += required;
  }
  return candidates.map((candidate, index): StrategyAction => {
    const { prior, ...action } = candidate;
    void prior;
    return { ...action, frequency: frequencies[index] };
  });
}

function removeExactRiverDominance(input: DecidePostflopV3Input, candidates: Candidate[]) {
  if (input.request.state.street !== "river") return candidates;
  const fold = candidates.find((candidate) => candidate.action === "fold");
  const call = candidates.find((candidate) => candidate.action === "call");
  if (!fold || !call) return candidates;
  const tolerance = Math.max(0.01, input.request.state.pot * 0.02);
  if (call.ev > fold.ev + tolerance) {
    return candidates.filter((candidate) => candidate !== fold);
  }
  if (fold.ev > call.ev + tolerance) {
    return candidates.filter((candidate) => candidate !== call);
  }
  return candidates;
}

export function decidePostflopV3(input: DecidePostflopV3Input): StrategyResult {
  const opponentRange = abstractOpponentRange(input.opponentRange);
  const boundedInput = { ...input, opponentRange };
  const heroProfile = profileCombo(
    input.request.state.heroHole,
    input.request.state.board,
    opponentRange,
  );
  const equityFacts = currentEquity(boundedInput);
  const equity = equityFacts.heroEquity;
  const candidates: Candidate[] = [passiveCandidate(boundedInput, equity)];
  if (!input.request.state.legal.canCheck && input.request.state.legal.canFold) {
    candidates.unshift({ action: "fold", ev: 0, intent: "pot-control", prior: 0.45 });
  }
  candidates.push(...aggressiveCandidates(boundedInput, heroProfile));
  const rationalCandidates = removeExactRiverDominance(boundedInput, candidates);
  const mixedActions = mix(rationalCandidates, input.request.state.pot, heroProfile);
  const callAmount = input.request.state.legal.canCall
    ? input.request.state.legal.callAmount
    : 0;
  const requiredEquity = callAmount > 0
    ? callAmount / Math.max(1, input.request.state.pot + callAmount)
    : 0;
  const gate = applyDominanceGateV4({
    actions: mixedActions,
    facts: analyzePokerFactsV4(
      input.request.state.heroHole,
      input.request.state.board,
      opponentRange,
    ),
    pot: input.request.state.pot,
    requiredEquity,
    currentEquity: equity,
    facingBet: callAmount > 0,
    street: input.situation.street,
  });
  const actions = gate.actions;
  return {
    actions,
    baselineActions: actions.map((action) => ({ ...action })),
    confidence: Math.min(0.84, 0.58 + Math.min(0.22, input.opponentRange.length / 100)),
    source: "strategy-pack-v3+resolver",
    nodeId: `pfv3:${input.situation.nodeId}:${heroProfile.construction}`,
    strategyVersion: "strategy-v3",
    rangeFacts: {
      opponentCombos: input.opponentRange.length,
      evaluatedOpponentCombos: opponentRange.length,
      currentEquity: Number(equity.toFixed(4)),
      equityMode: equityFacts.exact ? "exact-runout" : "fixed-budget-runout",
      equityJointSamples: equityFacts.validJointSamples,
      equityRunoutMs: Number(equityFacts.elapsedMs.toFixed(2)),
    },
    explanationFacts: {
      algorithm: "combo-elasticity-multistreet-v3",
      boardFamily: input.situation.textureCluster,
      construction: heroProfile.construction,
      madeCategory: heroProfile.madeCategory,
      showdownTier: heroProfile.showdownTier,
      cleanOuts: heroProfile.improvementOuts.clean,
      dirtyOuts: heroProfile.improvementOuts.dirty,
      futureVulnerability: Number(heroProfile.futureVulnerability.toFixed(4)),
      inPosition: input.situation.inPosition ? 1 : 0,
      line: input.situation.line,
      dominanceRejected: gate.rejected.map((item) =>
        `${item.action.action}:${item.reason}`
      ).join("|"),
    },
  };
}
