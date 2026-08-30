import { TABLE_PROFILES } from "../policy/tableProfiles";
import type { PolicyAction } from "../policy/types";
import { classifyPostflopSituation } from "../strategy/postflopSituation";
import { classifyPostflopTexture } from "../strategy/postflopTexture";
import { estimateElasticResponse } from "../strategy/v3/elasticResponse";
import type { PublicDecisionState } from "../strategy/types";
import type {
  OpponentActionResponse,
  OpponentRangeSummary,
  PreActionInsightInput,
} from "./types";

type ResponseConfig = { seed: number; sampleBudget: number; deadlineMs: number };

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function uniqueRaises(input: PreActionInsightInput): PolicyAction[] {
  if (!input.legal.canRaise) return [];
  const base = input.currentBet;
  const potAfterCall = input.pot + input.legal.callAmount;
  const targets = [0.5, 2 / 3, 1].map((fraction) =>
    Math.round(base + potAfterCall * fraction));
  targets.push(input.legal.maxRaiseTo);
  return [...new Set(targets.map((to) => clamp(to, input.legal.minRaiseTo, input.legal.maxRaiseTo)))]
    .sort((a, b) => a - b)
    .map((to) => ({ type: "raise", to } as const));
}

function publicSummary(range: OpponentRangeSummary): Omit<OpponentRangeSummary, "ranges"> {
  const summary = { ...range };
  delete (summary as Partial<OpponentRangeSummary>).ranges;
  return summary;
}

function legacyResponseFor(
  input: PreActionInsightInput,
  range: OpponentRangeSummary,
  heroAction: PolicyAction,
): OpponentActionResponse {
  const player = input.players.find((candidate) => candidate.seat === range.seat);
  const profile = player?.profile?.effective;
  const table = TABLE_PROFILES[input.tableProfileId];
  const looseness = (profile?.looseness ?? table.vpip * 100) / 100;
  const aggression = (profile?.aggression ?? table.aggression * 50) / 100;
  const buckets = range.buckets;
  const strength = buckets.strongValue + buckets.madeHand * 0.58
    + buckets.strongDraw * 0.52 + buckets.weakDraw * 0.22;
  const to = heroAction.type === "raise" ? heroAction.to : input.currentBet;
  const size = Math.max(0, to - input.currentBet) / Math.max(1, input.pot + input.legal.callAmount);
  const rawFold = 0.12 + size * 0.42 - strength * 0.32 - looseness * 0.16;
  const fold = clamp(rawFold, 0.02, 0.94);
  const conditionalRaise = clamp(
    0.035 + aggression * 0.16 + buckets.strongValue * 0.2 + buckets.strongDraw * 0.08 - size * 0.035,
    0.01,
    0.42,
  );
  const raise = (1 - fold) * conditionalRaise;
  const call = 1 - fold - raise;
  return {
    seat: range.seat,
    heroAction,
    fold,
    call,
    raise,
    continuingRange: publicSummary(range),
  };
}

export function publicDecisionStateFromInsight(input: PreActionInsightInput): PublicDecisionState {
  return {
    schemaVersion: 1,
    seed: input.seed,
    decisionIndex: input.logIndex,
    actingSeat: input.heroSeat,
    buttonSeat: input.players.find((player) => player.position === "BTN")?.seat ?? input.heroSeat,
    smallBlindSeat: input.players.find((player) => player.position === "SB")?.seat ?? 0,
    bigBlindSeat: input.players.find((player) => player.position === "BB")?.seat ?? 0,
    blindLevel: { small: 1, big: 2 },
    street: input.street,
    heroHole: [...input.heroHole],
    board: [...input.board],
    pot: input.pot,
    currentBet: input.currentBet,
    minRaise: input.minRaise,
    legal: { ...input.legal },
    pendingSeats: [...input.pendingSeats],
    players: input.players.map((player) => ({
      seat: player.seat,
      playerId: player.playerId,
      position: player.position,
      stack: player.stack,
      streetBet: player.streetBet,
      totalBet: player.totalBet,
      folded: player.folded,
      allIn: player.allIn,
    })),
    actions: [...input.actions],
    tableProfileId: input.tableProfileId,
  };
}

function postflopResponseFor(
  input: PreActionInsightInput,
  range: OpponentRangeSummary,
  heroAction: PolicyAction,
): OpponentActionResponse {
  const state = publicDecisionStateFromInsight(input);
  const texture = classifyPostflopTexture([...input.board]);
  const situation = classifyPostflopSituation(state, texture);
  const to = heroAction.type === "raise" ? heroAction.to : input.currentBet;
  const potAfterCall = input.pot + input.legal.callAmount;
  const size = Math.max(0, to - input.currentBet) / Math.max(1, potAfterCall);
  const player = input.players.find((candidate) => candidate.seat === range.seat);
  const response = estimateElasticResponse({
    heroHole: [...input.heroHole],
    board: [...input.board],
    opponentRange: range.ranges,
    situation,
    potFraction: size,
    playerProfile: player?.profile,
  });
  return {
    seat: range.seat,
    heroAction,
    fold: response.fold,
    call: response.worseMadeCall + response.drawCall + response.betterCall,
    raise: response.valueRaise + response.bluffRaise,
    continuingRange: publicSummary(range),
  };
}

export function calculateActionResponses(
  input: PreActionInsightInput,
  ranges: readonly OpponentRangeSummary[],
  config: ResponseConfig,
): { precision: "sampled"; responses: OpponentActionResponse[]; samples: number; confidence: number } {
  const startedAt = performance.now();
  const actions = uniqueRaises(input);
  const responses: OpponentActionResponse[] = [];
  let samples = 0;
  for (const action of actions) {
    for (const range of ranges) {
      if (performance.now() - startedAt >= config.deadlineMs) break;
      responses.push(input.board.length >= 3
        ? postflopResponseFor(
          input,
          range,
          action,
        )
        : legacyResponseFor(input, range, action));
      samples += Math.min(range.comboCount, Math.max(1, Math.floor(config.sampleBudget / Math.max(1, ranges.length))));
    }
  }
  const meanRangeConfidence = ranges.length
    ? ranges.reduce((sum, range) => sum + range.confidence, 0) / ranges.length
    : 0;
  return {
    precision: "sampled",
    responses,
    samples,
    confidence: clamp(meanRangeConfidence * Math.min(1, samples / Math.max(1, config.sampleBudget))),
  };
}
