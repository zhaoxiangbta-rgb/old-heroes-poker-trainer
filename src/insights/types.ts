import type { Card } from "../engine/cards";
import type { HandRank } from "../engine/evaluator";
import type { WeightedCombo } from "../engine/ranges";
import type { Legal, Position, Street } from "../game/game";
import type { HandPlayerProfile } from "../policy/playerProfiles";
import type { TableProfileId } from "../policy/tableProfiles";
import type { PolicyAction } from "../policy/types";
import type { PublicAction } from "../strategy/types";

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
  error?: string;
};

export type PersistedPreActionInsight = {
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

export type InsightWorkerRequest =
  | { type: "start"; requestId: string; key: InsightTaskKey; input: PreActionInsightInput; sampleBudget: number; deadlineMs: number }
  | { type: "cancel"; requestId: string; key: InsightTaskKey };

export type InsightWorkerEvent =
  | { type: "exact-completed"; requestId: string; key: InsightTaskKey; exact: ExactProjection }
  | { type: "ranges-completed"; requestId: string; key: InsightTaskKey; ranges: OpponentRangeSummary[]; responses: OpponentActionResponse[]; confidence: number }
  | { type: "partial"; requestId: string; key: InsightTaskKey; exact?: ExactProjection; message: string }
  | { type: "failed"; requestId: string; key: InsightTaskKey; message: string };
