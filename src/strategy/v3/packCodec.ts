import { sha256Hex } from "../sha256";
import type {
  LoadedStrategyPack,
  PackExpectation,
  PackedAction,
  StrategyPackManifestV3,
  StrategyPackPayloadV3,
  StrategyPackSource,
} from "./packTypes";

const MAGIC = "OHSP3\n";
const FREQUENCY_TOTAL = 65_535;

function canonicalJson(value: unknown) {
  return JSON.stringify(value);
}

function compareVersions(left: string, right: string) {
  const a = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function assertAction(action: PackedAction) {
  if (!Number.isInteger(action.sizeCode) || action.sizeCode < 0 || action.sizeCode > 65_535) {
    throw new Error("策略包包含非法 sizeCode");
  }
  if (!Number.isInteger(action.frequencyQ) || action.frequencyQ < 0 || action.frequencyQ > FREQUENCY_TOTAL) {
    throw new Error("策略包包含非法 frequencyQ");
  }
  if (action.evMilliBb !== undefined && !Number.isFinite(action.evMilliBb)) {
    throw new Error("策略包包含非法 EV");
  }
}

function validatePayload(payload: StrategyPackPayloadV3) {
  if (!payload || !Array.isArray(payload.preflop?.nodes) || !Array.isArray(payload.postflop?.nodes)) {
    throw new Error("策略包 payload 结构无效");
  }
  const nodeIds = [
    ...payload.preflop.nodes.map((node) => `preflop:${node.id}`),
    ...payload.postflop.nodes.map((node) => `postflop:${node.id}`),
  ];
  if (new Set(nodeIds).size !== nodeIds.length) throw new Error("策略包节点 ID 重复");
  for (const node of payload.preflop.nodes) {
    if (node.hands.length !== 169 || new Set(node.hands.map((hand) => hand.hand)).size !== 169) {
      throw new Error(`翻前节点 ${node.id} 必须包含 169 类唯一手牌`);
    }
    for (const hand of node.hands) {
      if (!hand.actions.length) throw new Error(`翻前手牌 ${hand.hand} 没有动作`);
      hand.actions.forEach(assertAction);
      const total = hand.actions.reduce((sum, action) => sum + action.frequencyQ, 0);
      if (total !== FREQUENCY_TOTAL) {
        throw new Error(`翻前手牌 ${hand.hand} 量化频率必须合计 65535`);
      }
    }
  }
}

function manifestFor(source: StrategyPackSource, payloadText: string): StrategyPackManifestV3 {
  return {
    schemaVersion: 3,
    strategyVersion: source.strategyVersion,
    sourceVersion: source.sourceVersion,
    compilerVersion: source.compilerVersion,
    packKind: source.packKind,
    nodeCount: source.preflop.nodes.length + source.postflop.nodes.length,
    sha256: sha256Hex(payloadText),
    minimumAppVersion: source.minimumAppVersion,
  };
}

function validateManifest(
  manifest: StrategyPackManifestV3,
  payload: StrategyPackPayloadV3,
  expectation?: PackExpectation,
) {
  if (manifest.schemaVersion !== 3) throw new Error("策略包 schemaVersion 不兼容");
  if (!manifest.strategyVersion || !manifest.sourceVersion || !manifest.compilerVersion) {
    throw new Error("策略包版本信息不完整");
  }
  const nodeCount = payload.preflop.nodes.length + payload.postflop.nodes.length;
  if (manifest.nodeCount !== nodeCount) throw new Error("策略包节点数不匹配");
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error("策略包 SHA-256 格式无效");
  if (!expectation) return;
  if (expectation.schemaVersion !== manifest.schemaVersion) throw new Error("策略包 schemaVersion 不匹配");
  if (expectation.packKind !== manifest.packKind) throw new Error("策略包 packKind 不匹配");
  if (compareVersions(expectation.appVersion, manifest.minimumAppVersion) < 0) {
    throw new Error("当前应用版本低于策略包最低版本");
  }
}

export function verifyStrategyManifest(
  manifest: StrategyPackManifestV3,
  payload: StrategyPackPayloadV3,
  payloadText: string,
  expectation?: PackExpectation,
) {
  validatePayload(payload);
  validateManifest(manifest, payload, expectation);
  if (sha256Hex(payloadText) !== manifest.sha256) throw new Error("策略包 SHA-256 校验失败");
}

export function encodeStrategyPack(source: StrategyPackSource): Uint8Array {
  const payload: StrategyPackPayloadV3 = { preflop: source.preflop, postflop: source.postflop };
  validatePayload(payload);
  const payloadText = canonicalJson(payload);
  const manifest = manifestFor(source, payloadText);
  validateManifest(manifest, payload);
  return new TextEncoder().encode(`${MAGIC}${canonicalJson(manifest)}\n${payloadText}`);
}

export function decodeStrategyPack(
  bytes: Uint8Array,
  expectation: PackExpectation,
): LoadedStrategyPack {
  const text = new TextDecoder().decode(bytes);
  if (!text.startsWith(MAGIC)) throw new Error("策略包魔数无效");
  const manifestEnd = text.indexOf("\n", MAGIC.length);
  if (manifestEnd < 0) throw new Error("策略包 manifest 缺失");
  const manifest = JSON.parse(text.slice(MAGIC.length, manifestEnd)) as StrategyPackManifestV3;
  const payloadText = text.slice(manifestEnd + 1);
  if (sha256Hex(payloadText) !== manifest.sha256) throw new Error("策略包 SHA-256 校验失败");
  const payload = JSON.parse(payloadText) as StrategyPackPayloadV3;
  verifyStrategyManifest(manifest, payload, payloadText, expectation);
  return { manifest, ...payload };
}
