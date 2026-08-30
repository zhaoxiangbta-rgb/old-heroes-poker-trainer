import type { Card } from "../engine/cards";
import { createLocalStrategyEngine } from "../strategy/engine";
import type { PublicDecisionState, RangeLedgerSnapshot, StrategyAction } from "../strategy/types";
import type { PolicyAction } from "../policy/types";
import { calculatePreflopSampledNode } from "./multiwayCalculator";
import type {
  DeepCalculationConfig,
  DeepDecisionInput,
  DeepNodeCalculation,
  DeepNodeInput,
  DeepRangeCombo,
} from "./types";

function seatForPosition(input: DeepDecisionInput, position: "BTN" | "SB" | "BB") {
  return input.visiblePlayers.find((player) => player.position === position)?.seat ?? -1;
}

function publicState(input: DeepDecisionInput, seed: number): PublicDecisionState {
  return {
    schemaVersion: 1,
    seed,
    decisionIndex: input.logIndex,
    actingSeat: input.heroSeat,
    buttonSeat: seatForPosition(input, "BTN"),
    smallBlindSeat: seatForPosition(input, "SB"),
    bigBlindSeat: seatForPosition(input, "BB"),
    blindLevel: { small: 1, big: 2 },
    street: "preflop",
    heroHole: [input.heroHole[0], input.heroHole[1]],
    board: [],
    pot: input.pot,
    currentBet: input.currentBet,
    minRaise: Math.max(2, input.legal.minRaiseTo - input.currentBet),
    legal: { ...input.legal },
    pendingSeats: input.visiblePlayers
      .filter((player) => !player.folded && !player.allIn)
      .map((player) => player.seat),
    players: input.visiblePlayers.map((player) => ({
      seat: player.seat,
      playerId: player.playerId,
      position: player.position,
      stack: player.stack,
      streetBet: player.streetBet,
      totalBet: player.totalBet,
      folded: player.folded,
      allIn: player.allIn,
    })),
    actions: input.log.map((entry) => ({
      street: entry.street,
      actorSeat: entry.actorSeat,
      kind: entry.kind,
      amount: entry.amount,
      toAmount: entry.toAmount,
      potBefore: entry.potBefore ?? Math.max(0, entry.potAfter - entry.amount),
      potAfter: entry.potAfter,
    })),
    tableProfileId: input.tableProfileId ?? "balanced",
  };
}

function rangeSnapshot(
  input: DeepDecisionInput,
  rangesBySeat: Readonly<Record<number, readonly DeepRangeCombo[]>>,
): RangeLedgerSnapshot {
  return {
    version: 1,
    lastActionIndex: input.log.length,
    bySeat: Object.fromEntries(Object.entries(rangesBySeat).map(([seat, range]) => [
      Number(seat),
      range.map((combo) => ({
        cards: [combo.cards[0], combo.cards[1]] as [Card, Card],
        weight: combo.weight,
      })),
    ])),
  };
}

function policyAction(action: StrategyAction, input: DeepDecisionInput): PolicyAction {
  if (action.action === "fold" || action.action === "check" || action.action === "call") {
    return { type: action.action };
  }
  return {
    type: "raise",
    to: action.toAmount ?? (action.action === "all-in"
      ? input.legal.maxRaiseTo
      : input.legal.minRaiseTo),
  };
}

export async function calculatePreflopNode(
  decision: DeepDecisionInput,
  input: DeepNodeInput,
  config: DeepCalculationConfig,
  onBatch: (completed: number, total: number) => void,
): Promise<DeepNodeCalculation> {
  const sampled = await calculatePreflopSampledNode(input, config, onBatch);
  const strategy = createLocalStrategyEngine().decide({
    state: publicState(decision, config.seed),
    ranges: rangeSnapshot(decision, input.rangesBySeat),
    deadlineMs: 250,
  });
  return {
    ...sampled,
    candidates: strategy.actions.map((action) => ({
      action: policyAction(action, decision),
      ev: action.ev,
      frequency: action.frequency,
      intent: action.intent,
    })),
    confidence: Math.min(sampled.confidence, strategy.confidence),
  };
}
