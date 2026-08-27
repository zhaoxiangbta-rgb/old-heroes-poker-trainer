import type { GameState } from "../game/game";
import { mobileBetPresetTarget } from "./mobileBetSizing";

export type BetRailNode = {
  id: "min" | "half" | "two-thirds" | "pot" | "all-in";
  label: string;
  amount: number;
  index: number;
};

const RAIL_FRACTIONS = [0, 1 / 6, 1 / 3, 1 / 2, 1] as const;

export function betRailNodeFraction(nodeIndex: number) {
  return RAIL_FRACTIONS[nodeIndex] ?? 1;
}

export function choiceIndexAtRailFraction(fraction: number, nodes: BetRailNode[]) {
  if (!nodes.length) return 0;
  const value = Math.max(0, Math.min(1, fraction));
  for (let segment = 0; segment < nodes.length - 1; segment += 1) {
    const startFraction = betRailNodeFraction(segment);
    const endFraction = betRailNodeFraction(segment + 1);
    if (value > endFraction && segment < nodes.length - 2) continue;
    const progress = (value - startFraction) / Math.max(Number.EPSILON, endFraction - startFraction);
    const startIndex = nodes[segment].index;
    const endIndex = nodes[segment + 1].index;
    return Math.round(startIndex + Math.max(0, Math.min(1, progress)) * (endIndex - startIndex));
  }
  return nodes.at(-1)!.index;
}

export function railFractionForChoiceIndex(index: number, nodes: BetRailNode[]) {
  if (!nodes.length) return 0;
  const target = Math.max(nodes[0].index, Math.min(nodes.at(-1)!.index, index));
  const exactNode = nodes.findIndex((node) => node.index === target);
  if (exactNode >= 0) return betRailNodeFraction(exactNode);
  for (let segment = 0; segment < nodes.length - 1; segment += 1) {
    const startIndex = nodes[segment].index;
    const endIndex = nodes[segment + 1].index;
    if (endIndex <= startIndex || target < startIndex || target > endIndex) continue;
    const progress = (target - startIndex) / (endIndex - startIndex);
    const startFraction = betRailNodeFraction(segment);
    return startFraction + progress * (betRailNodeFraction(segment + 1) - startFraction);
  }
  return 1;
}

function nearestChoiceIndex(choices: number[], target: number) {
  let best = 0;
  for (let index = 1; index < choices.length; index += 1) {
    if (Math.abs(choices[index] - target) < Math.abs(choices[best] - target)) best = index;
  }
  return best;
}

export function mobileBetRailNodes(game: GameState, choices: number[]): BetRailNode[] {
  if (!choices.length) return [];
  const presetTarget = (preset: "half-pot" | "two-thirds-pot" | "pot") =>
    game.legal.canRaise ? mobileBetPresetTarget(game, preset) : choices[0];
  const candidates = [
    { id: "min" as const, label: "最低", target: choices[0] },
    { id: "half" as const, label: "半池", target: presetTarget("half-pot") },
    { id: "two-thirds" as const, label: "2/3池", target: presetTarget("two-thirds-pot") },
    { id: "pot" as const, label: "底池", target: presetTarget("pot") },
    { id: "all-in" as const, label: "ALL IN", target: choices.at(-1)! },
  ];
  return candidates.map(({ id, label, target }) => {
    const index = nearestChoiceIndex(choices, target);
    return { id, label, amount: choices[index], index };
  });
}

export function snapBetRailIndex(index: number, nodes: BetRailNode[], threshold = 2) {
  const nearest = [...nodes].sort((a, b) => Math.abs(a.index - index) - Math.abs(b.index - index) || a.index - b.index)[0];
  return nearest && Math.abs(nearest.index - index) <= threshold ? nearest.index : index;
}
