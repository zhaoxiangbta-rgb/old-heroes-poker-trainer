import type { Position } from "../../game/game";
import { ALL_PREFLOP_HANDS } from "../preflopHands";
import type { PreflopStackBucket, PreflopSpot } from "../types";
import type { StrategyProvenance } from "./packTypes";
import type {
  PreflopSizeClass,
  PreflopSourceAction,
  PreflopSourceV3,
} from "./preflopSource";

export type CompiledPreflopAction = {
  kind: PreflopSourceAction["kind"];
  sizeClass?: PreflopSizeClass;
  frequency: number;
  evBb: number;
};

export type CompiledPreflopHand = {
  hand: string;
  source: StrategyProvenance;
  actions: CompiledPreflopAction[];
};

export type CompiledPreflopNode = {
  id: string;
  spot: PreflopSpot;
  position: Position;
  stack: PreflopStackBucket;
  hands: CompiledPreflopHand[];
};

export type CompiledPreflopMatrix = {
  version: 3;
  sourceVersion: string;
  nodes: CompiledPreflopNode[];
  cell(
    spot: PreflopSpot,
    position: Position,
    stack: PreflopStackBucket,
    hand: string,
  ): CompiledPreflopHand;
};

function validateActions(actions: readonly PreflopSourceAction[], context: string) {
  if (!actions.length) throw new Error(`${context} 缺少动作`);
  const total = actions.reduce((sum, action) => sum + action.frequency, 0);
  if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-9) {
    throw new Error(`${context} 动作频率未归一`);
  }
  for (const action of actions) {
    if (!Number.isFinite(action.frequency) || action.frequency <= 0 || action.frequency > 1) {
      throw new Error(`${context} 包含非法频率`);
    }
    if (!Number.isFinite(action.evBb)) throw new Error(`${context} 包含非法 EV`);
  }
}

export function compilePreflopMatrix(source: PreflopSourceV3): CompiledPreflopMatrix {
  if (source.version !== 3) throw new Error("翻前源矩阵版本不兼容");
  const ids = new Set<string>();
  const nodes = source.nodes.map((node): CompiledPreflopNode => {
    if (ids.has(node.id)) throw new Error(`翻前节点重复：${node.id}`);
    ids.add(node.id);
    validateActions(node.defaultActions, `${node.id} 默认单元格`);
    const explicit = new Map<string, CompiledPreflopHand>();
    for (const group of node.groups) {
      validateActions(group.actions, `${node.id} 显式分组`);
      for (const hand of group.hands) {
        if (!ALL_PREFLOP_HANDS.includes(hand)) throw new Error(`${node.id} 包含未知手牌 ${hand}`);
        if (explicit.has(hand)) throw new Error(`${node.id} 对 ${hand} 存在重复显式分组`);
        explicit.set(hand, {
          hand,
          source: group.source,
          actions: group.actions.map((action) => ({ ...action })),
        });
      }
    }
    return {
      id: node.id,
      spot: node.spot,
      position: node.position,
      stack: node.stack,
      hands: ALL_PREFLOP_HANDS.map((hand) => explicit.get(hand) ?? ({
        hand,
        source: node.defaultSource,
        actions: node.defaultActions.map((action) => ({ ...action })),
      })),
    };
  });
  const cells = new Map<string, CompiledPreflopHand>();
  for (const node of nodes) {
    for (const hand of node.hands) {
      cells.set(`${node.spot}:${node.position}:${node.stack}:${hand.hand}`, hand);
    }
  }
  return {
    version: 3,
    sourceVersion: source.sourceVersion,
    nodes,
    cell(spot, position, stack, hand) {
      const cell = cells.get(`${spot}:${position}:${stack}:${hand}`);
      if (!cell) throw new Error(`V3 翻前矩阵缺少 ${spot}:${position}:${stack}:${hand}`);
      return cell;
    },
  };
}
