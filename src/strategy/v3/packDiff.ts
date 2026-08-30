import type { PackedAction, StrategyPackSource } from "./packTypes";

export type StrategyPackDiffReport = {
  comparedHands: number;
  primaryActionDifferences: number;
  missingProvenance: number;
  fatal: string[];
};

function primary(actions: PackedAction[]) {
  return actions.reduce((best, action) => action.frequencyQ > best.frequencyQ ? action : best);
}

export function compareStrategyPackSources(
  desktop: StrategyPackSource,
  mobile: StrategyPackSource,
): StrategyPackDiffReport {
  const mobileNodes = new Map(mobile.preflop.nodes.map((node) => [node.id, node]));
  let comparedHands = 0;
  let primaryActionDifferences = 0;
  let missingProvenance = 0;
  const fatal: string[] = [];
  for (const node of desktop.preflop.nodes) {
    const target = mobileNodes.get(node.id);
    if (!target) {
      fatal.push(`mobile node missing:${node.id}`);
      continue;
    }
    const targetHands = new Map(target.hands.map((hand) => [hand.hand, hand]));
    for (const hand of node.hands) {
      const mobileHand = targetHands.get(hand.hand);
      if (!mobileHand) {
        fatal.push(`mobile hand missing:${node.id}:${hand.hand}`);
        continue;
      }
      comparedHands += 1;
      if (!mobileHand.source) missingProvenance += 1;
      const desktopPrimary = primary(hand.actions);
      const mobilePrimary = primary(mobileHand.actions);
      if (desktopPrimary.kind !== mobilePrimary.kind || desktopPrimary.sizeCode !== mobilePrimary.sizeCode) {
        primaryActionDifferences += 1;
      }
    }
  }
  if (primaryActionDifferences > 0) fatal.push(`primary action differences:${primaryActionDifferences}`);
  if (missingProvenance > 0) fatal.push(`missing provenance:${missingProvenance}`);
  return { comparedHands, primaryActionDifferences, missingProvenance, fatal };
}
