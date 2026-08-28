import type { Card } from "../engine/cards";

export type PolicyAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; to: number };

export type PolicyIntent =
  | "value"
  | "protection"
  | "semi-bluff"
  | "bluff"
  | "pot-control"
  | "induce";

export type PolicyCandidate = {
  action: PolicyAction;
  label: string;
  ev: number;
  probability: number;
  intent: PolicyIntent;
};

export type VisiblePolicyAction = {
  street: string;
  actorSeat: number;
  kind: string;
  /** Chips actually moved by this action. */
  amount?: number;
  toAmount: number;
  /** Pot immediately before this action. */
  potBefore?: number;
  potAfter: number;
};

export type DecisionContext = {
  seed: number;
  decisionIndex: number;
  seat: number;
  street: "preflop" | "flop" | "turn" | "river";
  position: "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB";
  hole: [Card, Card];
  board: Card[];
  pot: number;
  currentBet: number;
  streetBet: number;
  stack: number;
  effectiveStack: number;
  activePlayers: number;
  playersBehind: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  legal: { fold: boolean; check: boolean; call: number; raise: boolean };
  visibleLine: VisiblePolicyAction[];
};

export type PolicyFacts = {
  strength: number;
  equity: number;
  requiredEquity: number;
  spr: number;
  rangeCombos: number;
  sampled: number;
  elapsedMs: number;
  fallback?: string;
};

export type PolicyDecision = {
  action: PolicyAction;
  candidates: PolicyCandidate[];
  facts: PolicyFacts;
};

export interface PokerPolicy {
  decide(context: DecisionContext): PolicyDecision;
}

export type PlayerProfile = {
  id: string;
  vpip: number;
  pfr: number;
  threeBet: number;
  call: number;
  aggression: number;
  bluff: number;
  riverRaiseStrength: number;
  sizePreference: number;
};
