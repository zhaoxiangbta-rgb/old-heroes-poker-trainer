import { createDeck, parseCard, type Card } from "../engine/cards";
import { bestHand } from "../engine/evaluator";
import {
  removeBlocked,
  updateRange,
  type WeightedCombo,
} from "../engine/ranges";
import { canonicalHand } from "../policy/preflop";
import { positionPriorNotation } from "../policy/rangeModel";
import type {
  PublicAction,
  PublicDecisionState,
  RangeLedger,
  RangeLedgerSnapshot,
} from "./types";

function allCombos(): WeightedCombo[] {
  const deck = createDeck();
  const combos: WeightedCombo[] = [];
  for (let first = 0; first < deck.length; first += 1) {
    for (let second = first + 1; second < deck.length; second += 1) {
      const cards = [deck[first], deck[second]] as [Card, Card];
      combos.push({ cards, weight: 1, label: canonicalHand(cards), history: [] });
    }
  }
  return combos;
}

const COMPLETE_RANGE = allCombos();

function priorLabels(position: PublicDecisionState["players"][number]["position"]) {
  return new Set(positionPriorNotation(position).split(","));
}

function initialRange(
  position: PublicDecisionState["players"][number]["position"],
  knownCards: Card[],
) {
  const labels = priorLabels(position);
  const unblocked = removeBlocked(COMPLETE_RANGE, knownCards);
  return updateRange(
    unblocked,
    (combo) => labels.has(combo.label) ? 1 : 0.05,
    `position prior ${position}`,
  );
}

function preflopStrength(combo: WeightedCombo) {
  const ranks = combo.cards
    .map((card) => parseCard(card).rank)
    .sort((first, second) => second - first);
  const pair = ranks[0] === ranks[1];
  const suited = combo.cards[0][1] === combo.cards[1][1];
  return Math.min(
    1,
    (pair ? 0.38 : 0) + ranks[0] / 22 + ranks[1] / 50 + (suited ? 0.06 : 0),
  );
}

function comboStrength(combo: WeightedCombo, board: Card[]) {
  if (board.length < 3) return preflopStrength(combo);
  const hand = bestHand([...combo.cards, ...board]);
  return Math.min(1, hand.category / 8 + (hand.tiebreak[0] ?? 0) / 120);
}

function actionLikelihood(action: PublicAction, board: Card[]) {
  const size = action.amount / Math.max(1, action.potBefore);
  return (combo: WeightedCombo) => {
    const strength = comboStrength(combo, board);
    if (action.kind === "fold") return 1;
    if (action.kind === "check") return 1.02 - strength * 0.2;
    if (action.kind === "call")
      return Math.max(0.08, 0.7 - size * 0.18 + strength * 0.72);
    const riverLarge = action.street === "river" && size >= 0.75;
    const bluffTail = riverLarge ? 0.05 : 0.16;
    const valueBias = riverLarge ? strength * strength * 3.4 : strength * 1.5;
    return bluffTail + valueBias + size * strength * 0.32;
  };
}

function boardAtAction(board: readonly Card[], street: PublicAction["street"]) {
  if (street === "preflop") return [];
  if (street === "flop") return board.slice(0, 3);
  if (street === "turn") return board.slice(0, 4);
  return board.slice(0, 5);
}

export function createRangeLedger(state: PublicDecisionState): RangeLedger {
  const knownCards = [...state.heroHole, ...state.board];
  const bySeat: RangeLedger["bySeat"] = {};
  for (const player of state.players) {
    if (player.seat === state.actingSeat) continue;
    bySeat[player.seat] = initialRange(player.position, knownCards);
  }
  return {
    version: 1,
    knownCards,
    bySeat,
    lastActionIndex: -1,
  };
}

export function applyPublicAction(
  ledger: RangeLedger,
  state: PublicDecisionState,
  action: PublicAction,
): RangeLedger {
  const range = ledger.bySeat[action.actorSeat];
  if (!range) return ledger;
  const bySeat = { ...ledger.bySeat };
  bySeat[action.actorSeat] = updateRange(
    range,
    actionLikelihood(action, boardAtAction(state.board, action.street)),
    `${action.street} ${action.kind} ${(action.amount / Math.max(1, action.potBefore)).toFixed(2)} pot`,
  );
  return {
    ...ledger,
    bySeat,
    lastActionIndex: Math.max(ledger.lastActionIndex, state.actions.indexOf(action)),
  };
}

export function buildRangeLedger(state: PublicDecisionState): RangeLedger {
  let ledger = createRangeLedger(state);
  state.actions.forEach((action, index) => {
    ledger = applyPublicAction(ledger, state, action);
    if (ledger.lastActionIndex !== index) ledger = { ...ledger, lastActionIndex: index };
  });
  return ledger;
}

export function snapshotRangeLedger(ledger: RangeLedger): RangeLedgerSnapshot {
  const bySeat: RangeLedgerSnapshot["bySeat"] = {};
  for (const [seat, range] of Object.entries(ledger.bySeat)) {
    bySeat[Number(seat)] = range.map((combo) => ({
      cards: [...combo.cards] as [Card, Card],
      weight: combo.weight,
    }));
  }
  return {
    version: 1,
    lastActionIndex: ledger.lastActionIndex,
    bySeat,
  };
}
