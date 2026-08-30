import type { Card } from "../engine/cards";
import type { WeightedCombo } from "../engine/ranges";
import type {
  ActionKind,
  Legal,
  Position,
  Street,
} from "../game/game";
import type { TableProfileId } from "../policy/tableProfiles";
import type { PolicyIntent } from "../policy/types";
import type { HandPlayerProfile } from "../policy/playerProfiles";
import type { StreetPlanV4 } from "./v4/streetPlan";

export type PublicAction = {
  street: Street;
  actorSeat: number;
  kind: ActionKind;
  amount: number;
  toAmount: number;
  potBefore: number;
  potAfter: number;
};

export type PublicPlayer = {
  seat: number;
  playerId: string;
  position: Position;
  stack: number;
  streetBet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
};

export type PublicDecisionState = {
  schemaVersion: 1;
  seed: number;
  decisionIndex: number;
  actingSeat: number;
  buttonSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  blindLevel: { small: number; big: number };
  street: Street;
  heroHole: [Card, Card];
  board: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  legal: Legal;
  pendingSeats: number[];
  players: PublicPlayer[];
  actions: PublicAction[];
  tableProfileId: TableProfileId;
};

export type RangeLedger = {
  version: 1;
  knownCards: Card[];
  bySeat: Record<number, WeightedCombo[]>;
  lastActionIndex: number;
};

export type RangeLedgerSnapshot = {
  version: 1;
  lastActionIndex: number;
  bySeat: Record<
    number,
    Array<{ cards: [Card, Card]; weight: number }>
  >;
};

export type StrategyAction = {
  action: "fold" | "check" | "call" | "bet" | "raise" | "all-in";
  toAmount?: number;
  potFraction?: number;
  frequency: number;
  ev: number;
  intent: PolicyIntent;
};

export type StrategySource =
  | "blueprint"
  | "interpolated"
  | "blueprint+resolver"
  | "multiway-resolver"
  | "strategy-pack-v3"
  | "strategy-pack-v3+resolver"
  | "strategy-pack-v4+resolver"
  | "safe-fallback";

export type StrategyPackFacts = {
  packKind: "desktop" | "mobile";
  strategyVersion: string;
  sourceVersion: string;
};

export type StrategyDegradationFacts = {
  reason: string;
  fallbackStrategyVersion: string;
};

export type ExploitAdjustmentFacts = {
  applied: boolean;
  tableProfileId: TableProfileId;
  playerArchetype: HandPlayerProfile["archetype"] | "none";
  maxShift: number;
  reasonCodes: string[];
};

export type StrategyResult = {
  actions: StrategyAction[];
  baselineActions?: StrategyAction[];
  adjustment?: ExploitAdjustmentFacts;
  confidence: number;
  source: StrategySource;
  nodeId?: string;
  strategyVersion: string;
  rangeFacts: Record<string, number | string>;
  explanationFacts: Record<string, number | string>;
  packFacts?: StrategyPackFacts;
  degradation?: StrategyDegradationFacts;
};

export type StrategyRequest = {
  state: PublicDecisionState;
  ranges: RangeLedgerSnapshot;
  deadlineMs: number;
  playerProfile?: HandPlayerProfile;
  streetPlan?: StreetPlanV4;
};

export type PostflopLineV2 =
  | "first-to-act"
  | "checked-to"
  | "cbet"
  | "delayed-cbet"
  | "probe"
  | "donk"
  | "facing-bet"
  | "facing-raise";

export type PostflopSituation = {
  version: 2;
  street: "flop" | "turn" | "river";
  headsUp: boolean;
  inPosition: boolean;
  initiative: boolean;
  lastToAct: boolean;
  line: PostflopLineV2;
  potType: "limped" | "srp" | "3bp" | "4bp";
  spr: number;
  playersBehind: number;
  textureCluster: string;
  rangeShiftCard: boolean;
  nodeId: string;
};

export type BoardFamilyV3 = {
  street: "flop" | "turn" | "river";
  highCardBand: "ace-high" | "broadway-high" | "mid" | "low";
  pairedStructure: "unpaired" | "top-paired" | "low-paired" | "two-pair" | "trips";
  suitStructure: "rainbow" | "two-tone" | "monotone" | "four-flush";
  connectivity: "disconnected" | "gutshot-rich" | "connected";
  straightPressure: number;
  familyId: string;
};

export type ComboProfileV3 = {
  hole: [Card, Card];
  board: Card[];
  madeCategory: "high-card" | "pair" | "two-pair" | "three-of-a-kind" | "straight" | "flush" | "full-house" | "four-of-a-kind" | "straight-flush";
  currentMade: boolean;
  construction: "board-only" | "hole-high" | "pocket-pair" | "one-hole-pair" | "two-hole-two-pair" | "pocket-set" | "board-pair-trips" | "hole-straight" | "hole-flush" | "full-house" | "quads" | "straight-flush";
  kickerBand: "none" | "weak" | "medium" | "strong" | "top";
  showdownTier: "nuts" | "near-nuts" | "strong" | "medium" | "bluff-catcher" | "weak" | "air";
  drawVector: string[];
  improvementOuts: { clean: number; dirty: number };
  nutBlockers: number;
  counterfeitRisk: number;
  futureVulnerability: number;
  publicMadeHand: boolean;
};

export type BlockerEffectV3 = {
  worseCallBlocked: number;
  betterContinueBlocked: number;
  bluffBlocked: number;
};

export type PreflopSpot =
  | "unopened"
  | "blind-defense"
  | "facing-open"
  | "squeeze"
  | "facing-3bet"
  | "facing-4bet"
  | "facing-all-in"
  | "isolate-limpers";

export type PreflopStackBucket = 25 | 40 | 60 | 100 | 150 | 200;

export type StackInterpolation = {
  lower: PreflopStackBucket;
  upper: PreflopStackBucket;
  weight: number;
};

export type PreflopNode = {
  spot: PreflopSpot;
  actingPosition: Position;
  openerPosition?: Position;
  lastAggressorPosition?: Position;
  raiseCount: number;
  coldCallers: number;
  limpers: number;
  effectiveStackBb: number;
  stack: StackInterpolation;
  inPosition: boolean;
  nodeId: string;
};

export interface StrategyEngine {
  decide(request: StrategyRequest): StrategyResult;
}
