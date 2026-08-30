import type { Position } from "../../game/game";
import { ALL_PREFLOP_HANDS } from "../preflopHands";
import type { PreflopStackBucket, PreflopSpot } from "../types";
import type { CompiledPreflopMatrix, CompiledPreflopNode } from "./preflopCompiler";
import type { PreflopSizeClass } from "./preflopSource";

export type PreflopAuditIssueCode =
  | "PF_NODE_MISSING"
  | "PF_NODE_DUPLICATE"
  | "PF_HAND_MISSING"
  | "PF_HAND_DUPLICATE"
  | "PF_FREQUENCY_INVALID"
  | "PF_EV_INVALID"
  | "PF_ACTION_ILLEGAL"
  | "PF_SIZE_CLASS_ILLEGAL"
  | "PF_PROVENANCE_MISSING"
  | "PF_POSITION_RANGE_INVERSION"
  | "PF_PRESSURE_RANGE_INVERSION";

export type PreflopAuditIssue = {
  code: PreflopAuditIssueCode;
  nodeId: string;
  detail: string;
};

export type PreflopAuditReport = {
  fatal: boolean;
  nodeCount: number;
  handCellCount: number;
  issues: PreflopAuditIssue[];
  aggregates: Record<string, number>;
};

const POSITIONS: Position[] = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const STACKS: PreflopStackBucket[] = [25, 40, 60, 100, 150, 200];
const SPOTS: PreflopSpot[] = [
  "unopened",
  "isolate-limpers",
  "facing-open",
  "blind-defense",
  "squeeze",
  "facing-3bet",
  "facing-4bet",
  "facing-all-in",
];

const SUPPORTED_SIZES = new Set<PreflopSizeClass>([
  "open-2.0",
  "open-2.5",
  "open-3.0",
  "isolate",
  "three-bet-ip",
  "three-bet-oop",
  "four-bet",
  "jam",
]);

function key(spot: PreflopSpot, position: Position, stack: PreflopStackBucket) {
  return `${spot}:${position}:${stack}`;
}

function issue(
  issues: PreflopAuditIssue[],
  code: PreflopAuditIssueCode,
  nodeId: string,
  detail: string,
) {
  issues.push({ code, nodeId, detail });
}

function legalAction(spot: PreflopSpot, position: Position, kind: string) {
  if (kind === "fold" || kind === "raise" || kind === "all-in") return true;
  if (kind === "check") return spot === "unopened" && position === "BB" || spot === "isolate-limpers";
  // An unopened small blind may legally complete the blind; other unopened
  // seats cannot call because no voluntary bet precedes them.
  if (kind === "call") return spot !== "unopened" || position === "SB";
  return false;
}

function continueFrequency(node: CompiledPreflopNode) {
  return node.hands.reduce((sum, hand) => sum + hand.actions.reduce(
    (handSum, action) => handSum + (action.kind === "fold" ? 0 : action.frequency),
    0,
  ), 0) / ALL_PREFLOP_HANDS.length;
}

function auditNode(node: CompiledPreflopNode, issues: PreflopAuditIssue[]) {
  const seen = new Set<string>();
  for (const hand of node.hands) {
    if (seen.has(hand.hand)) issue(issues, "PF_HAND_DUPLICATE", node.id, hand.hand);
    seen.add(hand.hand);
    if (!hand.source) issue(issues, "PF_PROVENANCE_MISSING", node.id, hand.hand);
    const total = hand.actions.reduce((sum, action) => sum + action.frequency, 0);
    if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-9 ||
      hand.actions.some((action) => !Number.isFinite(action.frequency) || action.frequency <= 0)) {
      issue(issues, "PF_FREQUENCY_INVALID", node.id, `${hand.hand}:${total}`);
    }
    for (const action of hand.actions) {
      if (!Number.isFinite(action.evBb)) issue(issues, "PF_EV_INVALID", node.id, hand.hand);
      if (!legalAction(node.spot, node.position, action.kind)) {
        issue(issues, "PF_ACTION_ILLEGAL", node.id, `${hand.hand}:${action.kind}`);
      }
      if (action.sizeClass && !SUPPORTED_SIZES.has(action.sizeClass)) {
        issue(issues, "PF_SIZE_CLASS_ILLEGAL", node.id, `${hand.hand}:${action.sizeClass}`);
      }
      if ((action.kind === "raise" || action.kind === "all-in") && !action.sizeClass) {
        issue(issues, "PF_SIZE_CLASS_ILLEGAL", node.id, `${hand.hand}:missing`);
      }
    }
  }
  for (const hand of ALL_PREFLOP_HANDS) {
    if (!seen.has(hand)) issue(issues, "PF_HAND_MISSING", node.id, hand);
  }
}

function auditAggregateDirections(
  byKey: Map<string, CompiledPreflopNode>,
  issues: PreflopAuditIssue[],
  aggregates: Record<string, number>,
) {
  for (const stack of STACKS) {
    const open = Object.fromEntries(POSITIONS.map((position) => {
      const node = byKey.get(key("unopened", position, stack));
      const value = node ? continueFrequency(node) : 0;
      aggregates[`unopened:${position}:${stack}`] = Number(value.toFixed(6));
      return [position, value];
    })) as Record<Position, number>;
    const ordered: Position[] = ["UTG", "HJ", "CO", "BTN"];
    for (let index = 1; index < ordered.length; index += 1) {
      const earlier = ordered[index - 1];
      const later = ordered[index];
      if (open[later] + 0.05 < open[earlier]) {
        issue(
          issues,
          "PF_POSITION_RANGE_INVERSION",
          `unopened:${later}:${stack}`,
          `${later} ${open[later].toFixed(3)} < ${earlier} ${open[earlier].toFixed(3)}`,
        );
      }
    }

    for (const position of POSITIONS) {
      const facingOpen = byKey.get(key("facing-open", position, stack));
      const facingFourBet = byKey.get(key("facing-4bet", position, stack));
      if (!facingOpen || !facingFourBet) continue;
      const openContinue = continueFrequency(facingOpen);
      const fourBetContinue = continueFrequency(facingFourBet);
      aggregates[`facing-open:${position}:${stack}`] = Number(openContinue.toFixed(6));
      aggregates[`facing-4bet:${position}:${stack}`] = Number(fourBetContinue.toFixed(6));
      if (fourBetContinue > openContinue + 0.08) {
        issue(
          issues,
          "PF_PRESSURE_RANGE_INVERSION",
          `facing-4bet:${position}:${stack}`,
          `4bet ${fourBetContinue.toFixed(3)} > open ${openContinue.toFixed(3)}`,
        );
      }
    }
  }
}

export function auditPreflopMatrix(matrix: CompiledPreflopMatrix): PreflopAuditReport {
  const issues: PreflopAuditIssue[] = [];
  const byKey = new Map<string, CompiledPreflopNode>();
  for (const node of matrix.nodes) {
    const nodeKey = key(node.spot, node.position, node.stack);
    if (byKey.has(nodeKey)) issue(issues, "PF_NODE_DUPLICATE", node.id, nodeKey);
    else byKey.set(nodeKey, node);
    auditNode(node, issues);
  }
  for (const stack of STACKS) {
    for (const position of POSITIONS) {
      for (const spot of SPOTS) {
        const nodeKey = key(spot, position, stack);
        if (!byKey.has(nodeKey)) issue(issues, "PF_NODE_MISSING", nodeKey, nodeKey);
      }
    }
  }
  const aggregates: Record<string, number> = {};
  auditAggregateDirections(byKey, issues, aggregates);
  return {
    fatal: issues.length > 0,
    nodeCount: matrix.nodes.length,
    handCellCount: matrix.nodes.reduce((sum, node) => sum + node.hands.length, 0),
    issues,
    aggregates,
  };
}
