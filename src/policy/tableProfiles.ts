import { approxGtoPolicy } from "./approxGto";
import { sampleCandidate } from "./mixedStrategy";
import type {
  DecisionContext,
  PolicyAction,
  PolicyCandidate,
  PolicyDecision,
} from "./types";
import type { HandPlayerProfile } from "./playerProfiles";

export type TableProfileId = "balanced" | "friends" | "loose-wild";

export type TableProfile = {
  id: TableProfileId;
  name: string;
  description: string;
  vpip: number;
  callBias: number;
  threeBetBias: number;
  aggression: number;
  bluff: number;
  largeSizeBias: number;
  riverRaiseStrength: number;
};

export const TABLE_PROFILES: Record<TableProfileId, Readonly<TableProfile>> = {
  balanced: Object.freeze({
    id: "balanced",
    name: "标准均衡局",
    description: "接近均衡频率，适合建立标准决策框架。",
    vpip: 0.24,
    callBias: 1,
    threeBetBias: 1,
    aggression: 1,
    bluff: 1,
    largeSizeBias: 1,
    riverRaiseStrength: 1,
  }),
  friends: Object.freeze({
    id: "friends",
    name: "普通朋友局",
    description: "入池和跟注偏宽，诈唬偏少，河牌大加注偏强。",
    vpip: 0.36,
    callBias: 1.65,
    threeBetBias: 0.82,
    aggression: 0.9,
    bluff: 0.68,
    largeSizeBias: 0.92,
    riverRaiseStrength: 1.3,
  }),
  "loose-wild": Object.freeze({
    id: "loose-wild",
    name: "宽松疯狂局",
    description: "入池率高、再加注多、大尺寸更常见。",
    vpip: 0.52,
    callBias: 1.3,
    threeBetBias: 3,
    aggression: 1.7,
    bluff: 1.45,
    largeSizeBias: 1.6,
    riverRaiseStrength: 1.05,
  }),
};

export function actionKey(action: PolicyAction) {
  return action.type === "raise" ? `raise:${action.to}` : action.type;
}

function candidateMultiplier(
  candidate: PolicyCandidate,
  context: DecisionContext,
  profile: TableProfile,
) {
  const { action } = candidate;
  if (action.type === "fold") return Math.max(0.12, 2 - profile.vpip / 0.24);
  if (action.type === "call") return profile.callBias;
  if (action.type !== "raise") return 1;

  let multiplier = context.street === "preflop" ? profile.threeBetBias : profile.aggression;
  const raiseToPot = action.to / Math.max(1, context.pot);
  if (raiseToPot >= 1) multiplier *= profile.largeSizeBias;
  if (candidate.intent === "bluff" || candidate.intent === "semi-bluff") {
    multiplier *= profile.bluff;
  }
  if (context.street === "river" && candidate.intent === "value") {
    multiplier *= profile.riverRaiseStrength;
  }
  return multiplier;
}

function reweight(
  candidates: PolicyCandidate[],
  context: DecisionContext,
  profile: TableProfile,
) {
  const weights = candidates.map(
    (candidate) => candidate.probability * candidateMultiplier(candidate, context, profile),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return candidates.map((candidate, index) => ({
    ...candidate,
    probability: total > 0 ? weights[index] / total : candidate.probability,
  }));
}

function clampMultiplier(value: number) {
  return Math.max(0.15, Math.min(4, value));
}

function individualMultiplier(
  candidate: PolicyCandidate,
  context: DecisionContext,
  profile: HandPlayerProfile,
) {
  const loose = (profile.effective.looseness - 50) / 50;
  const aggressive = (profile.effective.aggression - 50) / 50;
  const { action } = candidate;
  if (action.type === "fold") return clampMultiplier(1 - loose * 0.9);
  if (action.type === "check") return clampMultiplier(1 - aggressive * 0.45);
  if (action.type === "call")
    return clampMultiplier(1 + loose * 0.7 - aggressive * 0.2);

  let multiplier = 1 + aggressive * 1.2 + loose * 0.3;
  const raiseToPot = action.to / Math.max(1, context.pot);
  if (raiseToPot >= 1)
    multiplier *= 0.7 + (profile.effective.aggression / 100) * 0.8;
  if (candidate.intent === "bluff" || candidate.intent === "semi-bluff")
    multiplier *= 0.25 + profile.effective.bluff / 50;
  return clampMultiplier(multiplier);
}

function reweightWithPlayer(
  candidates: PolicyCandidate[],
  context: DecisionContext,
  tableProfile: TableProfile,
  playerProfile?: HandPlayerProfile,
) {
  const weights = candidates.map((candidate) => {
    const table = candidateMultiplier(candidate, context, tableProfile);
    const individual = playerProfile
      ? individualMultiplier(candidate, context, playerProfile)
      : 1;
    return candidate.probability * table * individual;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return candidates.map((candidate, index) => ({
    ...candidate,
    probability: total > 0 ? weights[index] / total : candidate.probability,
  }));
}

export function decideWithProfile(
  context: DecisionContext,
  profileId: TableProfileId,
  playerProfile?: HandPlayerProfile,
): PolicyDecision {
  const base = approxGtoPolicy.decide(context);
  if (profileId === "balanced" && !playerProfile) return base;
  const candidates = playerProfile
    ? reweightWithPlayer(
        base.candidates,
        context,
        TABLE_PROFILES[profileId],
        playerProfile,
      )
    : reweight(base.candidates, context, TABLE_PROFILES[profileId]);
  const sampled = sampleCandidate(candidates, context.seed, context.decisionIndex);
  return {
    action: sampled.candidate.action,
    candidates,
    facts: { ...base.facts, sampled: sampled.sampled },
  };
}
