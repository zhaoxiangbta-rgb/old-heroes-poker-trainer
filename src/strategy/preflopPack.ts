import packJson from "./data/preflop-blueprint.v1.json";
import manifestJson from "./data/preflop-manifest.v1.json";
import type { Position } from "../game/game";
import type { PreflopStackBucket, PreflopSpot } from "./types";
import { sha256Hex } from "./sha256";

export type PreflopPackNode = {
  id: string;
  spot: PreflopSpot;
  position: Position;
  stack: PreflopStackBucket;
  continue: number;
  aggressive: number;
  passiveAction: "check" | "call" | null;
  allIn: boolean;
};

export type PreflopPack = {
  schemaVersion: 1;
  strategyVersion: "preflop-abstract-v1";
  algorithmVersion: "boundary-regret-v1";
  seed: number;
  boundaryWidth: number;
  hands: string[];
  nodes: PreflopPackNode[];
};

export type PreflopManifest = {
  schemaVersion: 1;
  strategyVersion: "preflop-abstract-v1";
  algorithmVersion: "boundary-regret-v1";
  seed: number;
  stackBuckets: PreflopStackBucket[];
  nodeCount: number;
  iterations: number;
  averageRegret: number;
  regretThreshold: number;
  sha256: string;
  minimumAppVersion: string;
};

function canonicalJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function asPack(value: unknown) {
  return value as PreflopPack;
}

function asManifest(value: unknown) {
  return value as PreflopManifest;
}

export function verifyPreflopPack(
  pack: PreflopPack,
  manifest: PreflopManifest,
) {
  if (
    pack.schemaVersion !== 1 || manifest.schemaVersion !== 1 ||
    pack.strategyVersion !== "preflop-abstract-v1" ||
    manifest.strategyVersion !== "preflop-abstract-v1" ||
    pack.algorithmVersion !== "boundary-regret-v1" ||
    manifest.algorithmVersion !== "boundary-regret-v1"
  ) throw new Error("翻前策略包版本不兼容");
  if (pack.seed !== manifest.seed) throw new Error("翻前策略包种子不匹配");
  if (pack.hands.length !== 169 || new Set(pack.hands).size !== 169) {
    throw new Error("翻前策略包手牌覆盖不完整");
  }
  if (pack.nodes.length !== manifest.nodeCount || new Set(pack.nodes.map((node) => node.id)).size !== pack.nodes.length) {
    throw new Error("翻前策略包节点覆盖不完整");
  }
  for (const node of pack.nodes) {
    if (
      !Number.isFinite(node.continue) || !Number.isFinite(node.aggressive) ||
      node.continue < 0 || node.continue > 1 || node.aggressive < 0 ||
      node.aggressive > node.continue
    ) throw new Error("翻前策略包包含非法频率边界");
  }
  if (!Number.isFinite(manifest.averageRegret) || manifest.averageRegret > manifest.regretThreshold) {
    throw new Error("翻前策略包未达到 regret 质量门槛");
  }
  const actualHash = sha256Hex(canonicalJson(pack));
  if (actualHash !== manifest.sha256) throw new Error("翻前策略包哈希校验失败");
  return { pack, manifest };
}

let embedded: ReturnType<typeof verifyPreflopPack> | undefined;
let nodesById: Map<string, PreflopPackNode> | undefined;

export function loadEmbeddedPreflopPack() {
  embedded ??= verifyPreflopPack(asPack(packJson), asManifest(manifestJson));
  return embedded;
}

export function findPreflopPackNode(
  spot: PreflopSpot,
  position: Position,
  stack: PreflopStackBucket,
) {
  const loaded = loadEmbeddedPreflopPack();
  nodesById ??= new Map(loaded.pack.nodes.map((node) => [node.id, node]));
  const node = nodesById.get(`${spot}:${position}:${stack}`);
  if (!node) throw new Error("翻前策略包缺少目标节点");
  return node;
}
