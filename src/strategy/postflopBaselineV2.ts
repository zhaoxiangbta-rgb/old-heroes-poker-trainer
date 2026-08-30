import type { PolicyIntent } from "../policy/types";
import type { PostflopHandBucket } from "./postflopHandBucket";
import type { RangeAdvantageFacts } from "./rangeAdvantage";
import type { ScaleResponseFacts } from "./responseModel";
import type {
  PostflopSituation,
  StrategyAction,
  StrategyRequest,
  StrategyResult,
} from "./types";

type Candidate = Omit<StrategyAction, "frequency"> & { prior: number };

export type PostflopBaselineV2Input = {
  request: StrategyRequest;
  situation: PostflopSituation;
  bucket: PostflopHandBucket;
  rangeAdvantage: RangeAdvantageFacts;
  responses: ScaleResponseFacts[];
};

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function intentForBet(bucket: PostflopHandBucket, response: ScaleResponseFacts): PolicyIntent {
  const valueSupport = response.worseCall - response.betterContinue - response.raise * 0.5;
  if (valueSupport >= 0.08 && response.worseCall >= 0.12) return "value";
  if (bucket.tier === "strong-draw" || bucket.tier === "draw") return "semi-bluff";
  if (bucket.equity >= 0.5) return "protection";
  return "bluff";
}

function passiveCandidate(input: PostflopBaselineV2Input): Candidate {
  const { request, bucket, rangeAdvantage } = input;
  const equity = rangeAdvantage.hero.equityRealization;
  if (request.state.legal.canCheck) {
    return {
      action: "check",
      ev: equity * request.state.pot,
      intent: bucket.tier === "nuts" || bucket.tier === "strong" ? "induce" : "pot-control",
      prior: bucket.tier === "nuts" ? 0.28 : bucket.tier === "strong" ? 0.3 : 0.72,
    };
  }
  if (request.state.legal.canCall) {
    const call = request.state.legal.callAmount;
    return {
      action: "call",
      ev: equity * (request.state.pot + call) - call,
      intent: bucket.tier === "strong-draw" || bucket.tier === "draw" ? "semi-bluff" : "pot-control",
      prior: 0.62,
    };
  }
  return { action: "fold", ev: 0, intent: "pot-control", prior: 1 };
}

function aggressionPrior(situation: PostflopSituation, bucket: PostflopHandBucket) {
  let prior = situation.inPosition ? 1.18 : 0.68;
  if (situation.line === "checked-to" || situation.line === "probe") prior *= 1.15;
  if (situation.line === "donk") prior *= situation.rangeShiftCard ? 1.28 : 0.38;
  if (bucket.tier === "nuts") prior *= 1.35;
  if (bucket.tier === "strong") prior *= 1.18;
  if (bucket.tier === "showdown" || bucket.tier === "weak") prior *= 0.62;
  return prior;
}

function betCandidates(input: PostflopBaselineV2Input): Candidate[] {
  if (!input.request.state.legal.canRaise) return [];
  const actor = input.request.state.players.find(
    (player) => player.seat === input.request.state.actingSeat,
  );
  if (!actor) return [];
  return input.responses.map((response): Candidate => {
    const toAmount = clamp(
      response.toAmount,
      input.request.state.legal.minRaiseTo,
      input.request.state.legal.maxRaiseTo,
    );
    const investment = Math.max(0, toAmount - actor.streetBet);
    const continueProbability = response.worseCall + response.betterContinue + response.raise;
    const calledEv = response.equityWhenContinued *
      (input.request.state.pot + investment * 2) - investment;
    const raisePenalty = response.raise * investment * 0.45;
    const ev = response.fold * input.request.state.pot +
      continueProbability * calledEv - raisePenalty;
    return {
      action: toAmount === input.request.state.legal.maxRaiseTo ? "all-in" :
        input.request.state.currentBet === 0 ? "bet" : "raise",
      toAmount,
      potFraction: response.potFraction,
      ev,
      intent: intentForBet(input.bucket, response),
      prior: aggressionPrior(input.situation, input.bucket),
    };
  });
}

function aggressionCap(situation: PostflopSituation) {
  if (situation.line === "donk") return situation.rangeShiftCard ? 0.55 : 0.18;
  if (situation.street === "flop" && !situation.inPosition && !situation.initiative) return 0.35;
  return 0.92;
}

function normalized(candidates: Candidate[], input: PostflopBaselineV2Input): StrategyAction[] {
  const best = Math.max(...candidates.map((candidate) => candidate.ev));
  const temperature = Math.max(1, input.request.state.pot * 0.2);
  const raw = candidates.map((candidate) =>
    Math.exp((candidate.ev - best) / temperature) * candidate.prior);
  const total = raw.reduce((sum, value) => sum + value, 0);
  let frequencies = raw.map((value) => value / total);
  const aggressiveIndexes = candidates.map((candidate, index) =>
    ["bet", "raise", "all-in"].includes(candidate.action) ? index : -1)
    .filter((index) => index >= 0);
  const aggressiveTotal = aggressiveIndexes.reduce((sum, index) => sum + frequencies[index], 0);
  const cap = aggressionCap(input.situation);
  if (aggressiveTotal > cap) {
    const passiveTotal = 1 - aggressiveTotal;
    frequencies = frequencies.map((frequency, index) =>
      aggressiveIndexes.includes(index)
        ? frequency * cap / aggressiveTotal
        : frequency * (1 - cap) / Math.max(Number.EPSILON, passiveTotal));
  }
  return candidates.map((candidate, index) => {
    const { prior, ...action } = candidate;
    void prior;
    return { ...action, frequency: frequencies[index] };
  });
}

export function buildPostflopBaselineV2(input: PostflopBaselineV2Input): StrategyResult {
  const candidates: Candidate[] = [passiveCandidate(input)];
  if (!input.request.state.legal.canCheck && input.request.state.legal.canFold) {
    candidates.unshift({ action: "fold", ev: 0, intent: "pot-control", prior: 0.5 });
  }
  candidates.push(...betCandidates(input));
  const actions = normalized(candidates, input);
  return {
    actions,
    confidence: Math.min(input.rangeAdvantage.confidence,
      input.responses.length ? Math.min(...input.responses.map((item) => item.confidence)) : 0),
    source: "blueprint",
    nodeId: input.situation.nodeId,
    strategyVersion: "hu-postflop-abstract-v2",
    rangeFacts: {
      equity: input.bucket.equity,
      equityAdvantage: input.rangeAdvantage.equityAdvantage,
      nutAdvantage: input.rangeAdvantage.nutAdvantage,
    },
    explanationFacts: {
      algorithm: "position-range-response-v2",
      line: input.situation.line,
      inPosition: input.situation.inPosition ? 1 : 0,
      rangeShiftCard: input.situation.rangeShiftCard ? 1 : 0,
      tier: input.bucket.tier,
    },
  };
}
