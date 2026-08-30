import { createDeck, type Card } from "../../engine/cards";
import type { RangeLedgerSnapshot } from "../types";

type LedgerCombo = { cards: [Card, Card]; weight: number };

export type RangeStateV4 = RangeLedgerSnapshot & {
  comboCount: number;
  hash: string;
};

const CARD_INDEX = new Map(createDeck().map((card, index) => [card, index]));

function comboKey(combo: Pick<LedgerCombo, "cards">) {
  const indexes = combo.cards.map((card) => CARD_INDEX.get(card) ?? 99).sort((first, second) => first - second);
  return `${String(indexes[0]).padStart(2, "0")}${String(indexes[1]).padStart(2, "0")}`;
}

function sortedCombos(combos: LedgerCombo[]) {
  for (let index = 1; index < combos.length; index += 1) {
    if (comboKey(combos[index - 1]) > comboKey(combos[index])) {
      return [...combos].sort((first, second) => comboKey(first).localeCompare(comboKey(second)));
    }
  }
  return combos;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeRangeStateV4(
  snapshot: RangeLedgerSnapshot,
  knownCards: readonly Card[],
): RangeStateV4 {
  const known = new Set(knownCards);
  let comboCount = 0;
  const bySeat = Object.fromEntries(
    Object.entries(snapshot.bySeat)
      .sort(([first], [second]) => Number(first) - Number(second))
      .map(([seat, source]) => {
        const merged = new Map<string, LedgerCombo>();
        for (const combo of source) {
          if (!Number.isFinite(combo.weight) || combo.weight <= 0) continue;
          if (combo.cards[0] === combo.cards[1] || combo.cards.some((card) => known.has(card))) continue;
          const key = comboKey(combo);
          const current = merged.get(key);
          if (current) current.weight += combo.weight;
          else merged.set(key, { cards: [combo.cards[0], combo.cards[1]], weight: combo.weight });
        }
        const ordered = sortedCombos([...merged.values()]);
        const total = ordered.reduce((sum, combo) => sum + combo.weight, 0);
        const normalized = total > 0
          ? ordered.map((combo) => ({ ...combo, weight: combo.weight / total }))
          : [];
        comboCount += normalized.length;
        return [Number(seat), normalized];
      }),
  );
  const canonical = Object.entries(bySeat)
    .map(([seat, range]) => `${seat}:${(range as LedgerCombo[])
      .map((combo) => `${comboKey(combo)}=${combo.weight.toFixed(12)}`).join(",")}`)
    .join("|");
  return {
    version: 1,
    lastActionIndex: snapshot.lastActionIndex,
    bySeat,
    comboCount,
    hash: `rv4:${fnv1a(`${snapshot.lastActionIndex}|${canonical}`)}`,
  };
}
