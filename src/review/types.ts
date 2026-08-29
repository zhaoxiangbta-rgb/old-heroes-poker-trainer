import type { Card } from "../engine/cards";
import type {
  GameLog,
  Legal,
  Player,
  Position,
  Street,
} from "../game/game";
import type { PolicyAction, PolicyIntent } from "../policy/types";
import type { WeaknessTag } from "../training/types";
import type { TableProfileId } from "../policy/tableProfiles";
import type { PersistedPreActionInsight } from "../insights/types";

export type DeepReviewStatus =
  | "not-started"
  | "calculating"
  | "completed"
  | "cancelled"
  | "failed";

export type ReviewPrecision = "exact" | "enumerated" | "sampled";

export type VisibleReviewPlayer = Omit<Player, "hole"> & { hole?: Card[] };

export type DeepDecisionInput = {
  handNo: number;
  logIndex: number;
  street: Street;
  heroSeat: number;
  heroHole: Card[];
  board: Card[];
  pot: number;
  currentBet: number;
  tableProfileId?: TableProfileId;
  legal: Legal;
  visiblePlayers: VisibleReviewPlayer[];
  log: GameLog[];
  actual?: PolicyAction;
  preActionInsight?: PersistedPreActionInsight;
};

export type DeepReviewInput = {
  handNo: number;
  seed: number;
  strategyVersion: string;
  calculatorVersion: string;
  decisions: DeepDecisionInput[];
};

export type DeepRangeSummary = {
  comboCount: number;
  topPairOrBetter: number;
  draws: number;
  air: number;
  change: string;
};

export type DeepCandidateReview = {
  action: PolicyAction;
  ev: number;
  frequency: number;
  intent: PolicyIntent;
};

export type DeepDecisionReview = {
  id: string;
  logIndex: number;
  street: Street;
  position: Position;
  pot: number;
  spr: number;
  activePlayers: number;
  playersBehind: number;
  actual: PolicyAction;
  recommended: PolicyAction;
  candidates: DeepCandidateReview[];
  normalizedEvLoss: number;
  equity: number;
  requiredEquity: number;
  cleanOuts: number;
  dirtyOuts: number;
  ranges: Record<string, DeepRangeSummary>;
  precision: ReviewPrecision;
  samples: number;
  coverage: number;
  confidence: number;
  tags: WeaknessTag[];
  correctThinking: string[];
  corrections: string[];
  coreRule: string;
};

export type HandReviewSummary = {
  grade: "良好" | "需复盘" | "重点纠正";
  totalNormalizedEvLoss: number;
  bestDecisionId?: string;
  worstDecisionId?: string;
  strongestPoint: string;
  priorityCorrection: string;
  confidence: number;
  precision: ReviewPrecision;
};

export type DeepHandReview = {
  version: 1;
  status: "completed";
  handNo: number;
  seed: number;
  stateHash: string;
  strategyVersion: string;
  calculatorVersion: string;
  completedAt: string;
  summary: HandReviewSummary;
  decisions: DeepDecisionReview[];
};

export type DeepReviewStage =
  | "action-line"
  | "ranges"
  | "equity-ev"
  | "teaching"
  | "saving";

export type DeepReviewProgress = {
  stage: DeepReviewStage;
  completed: number;
  total: number;
};

type DeepReviewEventBase = { requestId: string; stateHash: string };

export type DeepReviewEvent =
  | (DeepReviewEventBase & { type: "progress"; progress: DeepReviewProgress })
  | (DeepReviewEventBase & { type: "completed"; review: DeepHandReview })
  | (DeepReviewEventBase & { type: "failed"; code: string; message: string })
  | (DeepReviewEventBase & { type: "cancelled" });

export type DeepReviewRequest =
  | {
      type: "start";
      requestId: string;
      stateHash: string;
      input: DeepReviewInput;
      config: DeepCalculationConfig;
    }
  | { type: "cancel"; requestId: string; stateHash: string };

export type DeepCalculationConfig = {
  calculatorVersion: string;
  sampleBudget: number;
  batchSize: number;
  memoryLimitBytes: number;
  seed: number;
};

export type DeepRangeCombo = {
  cards: readonly [Card, Card];
  weight: number;
};

export type DeepNodeInput = {
  hero: readonly [Card, Card];
  board: readonly Card[];
  pot: number;
  heroStreetBet: number;
  heroSeat?: number;
  players?: Array<{
    seat: number;
    totalBet: number;
    streetBet: number;
    stack: number;
    folded: boolean;
  }>;
  legal: Legal;
  rangesBySeat: Readonly<Record<number, readonly DeepRangeCombo[]>>;
};

export type DeepNodeCalculation = {
  equity: number;
  requiredEquity: number;
  candidates: DeepCandidateReview[];
  precision: ReviewPrecision;
  samples: number;
  coverage: number;
  confidence: number;
  expectedPotReturn?: number;
  diagnostics: {
    rejectedConflicts: number;
    conflictingSamples: number;
  };
};
