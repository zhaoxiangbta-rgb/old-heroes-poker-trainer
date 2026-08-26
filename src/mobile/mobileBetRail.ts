import type { GameState } from "../game/game";
import { mobileBetPresetTarget } from "./mobileBetSizing";

export type BetRailNode = {
  id: "min" | "half" | "two-thirds" | "pot" | "all-in";
  label: string;
  amount: number;
  index: number;
};

function nearestChoiceIndex(choices: number[], target: number) {
  let best = 0;
  for (let index = 1; index < choices.length; index += 1) {
    if (Math.abs(choices[index] - target) < Math.abs(choices[best] - target)) best = index;
  }
  return best;
}

export function mobileBetRailNodes(game: GameState, choices: number[]): BetRailNode[] {
  if (!choices.length) return [];
  const candidates = [
    { id: "min" as const, label: "最低", target: choices[0] },
    { id: "half" as const, label: "½", target: mobileBetPresetTarget(game, "half-pot") },
    { id: "two-thirds" as const, label: "⅔", target: mobileBetPresetTarget(game, "two-thirds-pot") },
    { id: "pot" as const, label: "1×", target: mobileBetPresetTarget(game, "pot") },
    { id: "all-in" as const, label: "ALL IN", target: choices.at(-1)! },
  ];
  const seen = new Set<number>();
  return candidates.flatMap(({ id, label, target }) => {
    const index = nearestChoiceIndex(choices, target);
    if (seen.has(index)) return [];
    seen.add(index);
    return [{ id, label, amount: choices[index], index }];
  }).sort((a, b) => a.index - b.index);
}

export function snapBetRailIndex(index: number, nodes: BetRailNode[], threshold = 2) {
  const nearest = [...nodes].sort((a, b) => Math.abs(a.index - index) - Math.abs(b.index - index) || a.index - b.index)[0];
  return nearest && Math.abs(nearest.index - index) <= threshold ? nearest.index : index;
}
