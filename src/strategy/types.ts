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
  | "safe-fallback";

export type StrategyResult = {
  actions: StrategyAction[];
  confidence: number;
  source: StrategySource;
  nodeId?: string;
  strategyVersion: string;
  rangeFacts: Record<string, number | string>;
  explanationFacts: Record<string, number | string>;
};

export type StrategyRequest = {
  state: PublicDecisionState;
  ranges: RangeLedgerSnapshot;
  deadlineMs: number;
  playerProfile?: HandPlayerProfile;
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
