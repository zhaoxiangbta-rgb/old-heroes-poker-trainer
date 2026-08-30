import type { Card } from "../../engine/cards";
import type { Street } from "../../game/game";

export type SolverActionV4 = {
  kind: "fold" | "check" | "call" | "bet" | "raise" | "all-in";
  potFraction?: number;
  frequency: number;
  evBb?: number;
};

export type SolverNodeV4 = {
  id: string;
  street: Exclude<Street, "preflop">;
  board: Card[];
  boardFamily: string;
  hero: [Card, Card];
  opponentHandClasses: string[];
  history: string;
  actingPlayer: 0 | 1;
  potBb: number;
  effectiveStackBb: number;
  reachProbability: number;
  actions: SolverActionV4[];
};

export type SolverPackV4 = {
  schemaVersion: 4;
  strategyVersion: string;
  source: {
    project: string;
    version: string;
    license: string;
    algorithm: string;
    generatedAt: string;
    sourceHash: string;
  };
  nodes: SolverNodeV4[];
};

export type SolverPackManifestV4 = {
  sha256: string;
  byteLength: number;
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

export function encodeSolverPackV4(pack: SolverPackV4) {
  return new TextEncoder().encode(canonical(pack));
}

export async function sha256HexV4(bytes: Uint8Array) {
  const stableBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", stableBytes.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function validate(pack: SolverPackV4) {
  if (pack.schemaVersion !== 4 || !pack.strategyVersion) throw new Error("Solver 策略包版本不兼容");
  if (!pack.source?.project || !pack.source.version || pack.source.license !== "MIT" ||
    !/^[0-9a-f]{64}$/.test(pack.source.sourceHash)) {
    throw new Error("Solver 策略包缺少可审计来源");
  }
  const allowed = new Set(["fold", "check", "call", "bet", "raise", "all-in"]);
  const ids = new Set<string>();
  for (const node of pack.nodes) {
    if (!node.id || ids.has(node.id)) throw new Error("Solver 节点 ID 缺失或重复");
    ids.add(node.id);
    if (node.hero.length !== 2 || node.board.length < 3 || node.board.length > 5) {
      throw new Error(`Solver 节点 ${node.id} 手牌或公共牌无效`);
    }
    if (!node.opponentHandClasses.length || node.opponentHandClasses.some((hand) =>
      !/^(?:[2-9TJQKA])(?:[2-9TJQKA])(?:s|o)?$/.test(hand)
    )) throw new Error(`Solver 节点 ${node.id} 缺少对手范围`);
    if (!node.actions.length || node.actions.some((action) =>
      !allowed.has(action.kind) || !Number.isFinite(action.frequency) || action.frequency < 0 || action.frequency > 1
    )) throw new Error(`Solver 节点 ${node.id} 动作或频率无效`);
    const total = node.actions.reduce((sum, action) => sum + action.frequency, 0);
    if (Math.abs(total - 1) > 1e-4) throw new Error(`Solver 节点 ${node.id} 频率未归一`);
  }
}

export async function loadSolverPackV4(bytes: Uint8Array, manifest: SolverPackManifestV4) {
  if (bytes.byteLength !== manifest.byteLength) throw new Error("Solver 策略包大小校验失败");
  if (await sha256HexV4(bytes) !== manifest.sha256) throw new Error("Solver 策略包哈希校验失败");
  const pack = JSON.parse(new TextDecoder().decode(bytes)) as SolverPackV4;
  validate(pack);
  return pack;
}
