import type { Card } from "../engine/cards";
import type { HandRank } from "../engine/evaluator";
import type { WeightedCombo } from "../engine/ranges";
import type { Legal, Position, Street } from "../game/game";
import type { HandPlayerProfile } from "../policy/playerProfiles";
import type { TableProfileId } from "../policy/tableProfiles";
import type { PolicyAction } from "../policy/types";
import type { PublicAction } from "../strategy/types";
import type { ExploitAdjustmentFacts, StrategyAction } from "../strategy/types";

export type PublicInsightPlayer = {
  seat: number;
  playerId: string;
  position: Position;
  stack: number;
  streetBet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  profile?: HandPlayerProfile;
};

export type PreActionInsightInput = {
  schemaVersion: 1;
  handNo: number;
  seed: number;
  street: Street;
  logIndex: number;
  heroSeat: number;
  heroHole: readonly [Card, Card];
  board: readonly Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  legal: Legal;
  pendingSeats: readonly number[];
  tableProfileId: TableProfileId;
  players: readonly PublicInsightPlayer[];
  actions: readonly PublicAction[];
};

export type InsightTaskKey = {
  handNo: number;
  seed: number;
  street: Street;
  logIndex: number;
  stateHash: string;
};

export type HandClassProbability = {
  category: HandRank["category"];
  name: string;
  nextCard: number;
  byRiver: number;
};

export type OutAssessment = {
  card: Card;
  classification: "clean" | "dirty" | "neutral";
  equityDelta: number;
  riskReason?: "higher-flush" | "higher-straight" | "paired-board" | "full-house" | "players-behind";
};

export type ExactProjection = {
  precision: "exact";
  currentHand: { category: HandRank["category"]; name: string };
  atLeastCurrentByRiver: number;
  handClasses: HandClassProbability[];
  exclusiveNextTotal: number;
  exclusiveRiverTotal: number;
  absoluteNuts: number;
  tiedNuts: number;
  nearNuts: number;
  outs: OutAssessment[];
  elapsedMs: number;
};

export type OpponentRangeBuckets = {
  strongValue: number;
  madeHand: number;
  strongDraw: number;
  weakDraw: number;
  air: number;
};

export type OpponentRangeSummary = {
  seat: number;
  playerId: string;
  comboCount: number;
  buckets: OpponentRangeBuckets;
  changes: string[];
  confidence: number;
  ranges: readonly WeightedCombo[];
};

export type OpponentActionResponse = {
  seat: number;
  heroAction: PolicyAction;
  fold: number;
  call: number;
  raise: number;
  continuingRange: Omit<OpponentRangeSummary, "ranges">;
};

export type PreActionInsightState = {
  key?: InsightTaskKey;
  status: "idle" | "calculating-exact" | "calculating-ranges" | "ready" | "partial" | "failed";
  exact?: ExactProjection;
  ranges?: OpponentRangeSummary[];
  responses?: OpponentActionResponse[];
  confidence?: number;
  analysis?: DecisionAnalysisV2;
  liveCoach?: LiveCoachSummary;
  error?: string;
};

export type LiveCoachUpgrade = {
  category: HandRank["category"];
  name: string;
  nextCard: number;
  byRiver: number;
};

export type LiveCoachOpponentBucket = {
  key: keyof OpponentRangeBuckets;
  label: string;
  probability: number;
};

export type LiveCoachOpponentSummary = {
  seat: number;
  playerId: string;
  primary: boolean;
  comboCount: number;
  confidence: number;
  actionLine: string;
  buckets: LiveCoachOpponentBucket[];
};

export type LiveCoachSummary = {
  schemaVersion: 1;
  strategy: { label: string; version: string; degraded: boolean; reason?: string };
  hero: { currentHand: string; upgrades: LiveCoachUpgrade[]; upgradeSummary: string };
  opponents: LiveCoachOpponentSummary[];
  confidence: number;
};

export type AnalysisSectionKind =
  | "situation"
  | "ranges"
  | "baseline"
  | "adjustment"
  | "watch";

export type DecisionAnalysisV2 = {
  schemaVersion: 2;
  sections: Array<{ kind: AnalysisSectionKind; title: string; text: string }>;
  heroRange: { label: string; percentile: number | null };
  opponentBuckets: OpponentRangeBuckets;
  baseline: StrategyAction[];
  adjusted: StrategyAction[];
  adjustment?: ExploitAdjustmentFacts;
  confidence: number;
  audit: {
    strategyVersion: string;
    displayVersion?: string;
    degraded?: boolean;
    sampleBudget: number;
    seed: number;
    nodeId?: string;
    source?: string;
    degradationReason?: string;
  };
};

export type PersistedPreActionInsightV1 = {
  schemaVersion: 1;
  key: InsightTaskKey;
  calculatorVersion: "pre-action-exact-v1";
  rangeModelVersion: "public-range-v1";
  sampleSeed: number;
  sampleBudget: number;
  exact?: ExactProjection;
  rangeSummaries?: Array<Omit<OpponentRangeSummary, "ranges">>;
  responses?: OpponentActionResponse[];
  confidence?: number;
};

export type PersistedPreActionInsightV2 = {
  schemaVersion: 2;
  key: InsightTaskKey;
  calculatorVersion: "pre-action-analysis-v2";
  rangeModelVersion: "public-range-v2";
  sampleSeed: number;
  sampleBudget: number;
  exact?: ExactProjection;
  rangeSummaries?: Array<Omit<OpponentRangeSummary, "ranges">>;
  responses?: OpponentActionResponse[];
  confidence?: number;
  analysis: DecisionAnalysisV2;
};

export type PersistedPreActionInsight = PersistedPreActionInsightV1 | PersistedPreActionInsightV2;

export type InsightWorkerRequest =
  | { type: "start"; requestId: string; key: InsightTaskKey; input: PreActionInsightInput; sampleBudget: number; deadlineMs: number }
  | { type: "cancel"; requestId: string; key: InsightTaskKey };

export type InsightWorkerEvent =
  | { type: "exact-completed"; requestId: string; key: InsightTaskKey; exact: ExactProjection }
  | { type: "ranges-completed"; requestId: string; key: InsightTaskKey; ranges: OpponentRangeSummary[]; responses: OpponentActionResponse[]; confidence: number }
  | { type: "analysis-completed"; requestId: string; key: InsightTaskKey; analysis: DecisionAnalysisV2; liveCoach: LiveCoachSummary }
  | { type: "partial"; requestId: string; key: InsightTaskKey; exact?: ExactProjection; message: string }
  | { type: "failed"; requestId: string; key: InsightTaskKey; message: string };
