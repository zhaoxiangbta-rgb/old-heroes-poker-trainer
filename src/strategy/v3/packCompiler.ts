import { encodeStrategyPack } from "./packCodec";
import { compareStrategyPackSources, type StrategyPackDiffReport } from "./packDiff";
import { compilePreflopMatrix, type CompiledPreflopAction } from "./preflopCompiler";
import { PREFLOP_SOURCE_V3 } from "./preflopSource";
import type { PackedAction, StrategyPackSource } from "./packTypes";

const FREQUENCY_TOTAL = 65_535;
const PACK_MATRIX = compilePreflopMatrix(PREFLOP_SOURCE_V3);
const SIZE_CODES: Record<string, number> = {
  "": 0,
  "open-2.0": 10,
  "open-2.5": 11,
  "open-3.0": 12,
  isolate: 20,
  "three-bet-ip": 30,
  "three-bet-oop": 31,
  "four-bet": 40,
  jam: 65_535,
};

function quantize(actions: readonly CompiledPreflopAction[]): PackedAction[] {
  const raw = actions.map((action, index) => {
    const scaled = action.frequency * FREQUENCY_TOTAL;
    return { action, index, floor: Math.floor(scaled), remainder: scaled - Math.floor(scaled) };
  });
  let residual = FREQUENCY_TOTAL - raw.reduce((sum, item) => sum + item.floor, 0);
  const order = [...raw].sort((first, second) =>
    second.remainder - first.remainder || first.index - second.index);
  for (let index = 0; index < residual; index += 1) order[index % order.length].floor += 1;
  residual = 0;
  return raw.map(({ action, floor }) => ({
    kind: action.kind,
    sizeCode: SIZE_CODES[action.sizeClass ?? ""] ?? 0,
    frequencyQ: floor,
    evMilliBb: Math.round(action.evBb * 1000),
  }));
}

function source(packKind: "desktop" | "mobile"): StrategyPackSource {
  return {
    strategyVersion: "strategy-v3.0.0",
    sourceVersion: PREFLOP_SOURCE_V3.sourceVersion,
    compilerVersion: "pack-compiler-v3.0.0",
    packKind,
    minimumAppVersion: "1.5.0",
    preflop: {
      nodes: PACK_MATRIX.nodes.map((node) => ({
        id: node.id,
        spot: node.spot,
        position: node.position,
        stack: node.stack,
        hands: node.hands.map((hand) => ({
          hand: hand.hand,
          source: hand.source,
          actions: quantize(hand.actions),
        })),
      })),
    },
    postflop: {
      nodes: [
        { id: "postflop-v3:paired", source: "expert-baseline-v3", algorithm: "combo-elasticity-multistreet-v3" },
        { id: "postflop-v3:dry", source: "expert-baseline-v3", algorithm: "combo-elasticity-multistreet-v3" },
        { id: "postflop-v3:wet", source: "expert-baseline-v3", algorithm: "combo-elasticity-multistreet-v3" },
      ],
    },
  };
}

export function compileStrategyPackSources() {
  return { desktop: source("desktop"), mobile: source("mobile") };
}

let cachedPacks: {
  desktop: Uint8Array;
  mobile: Uint8Array;
  diffReport: StrategyPackDiffReport;
} | undefined;

export function compileStrategyPacks(): {
  desktop: Uint8Array;
  mobile: Uint8Array;
  diffReport: StrategyPackDiffReport;
} {
  if (cachedPacks) return cachedPacks;
  const sources = compileStrategyPackSources();
  const diffReport = compareStrategyPackSources(sources.desktop, sources.mobile);
  if (diffReport.fatal.length) throw new Error(`策略包差异审计失败：${diffReport.fatal.join(", ")}`);
  cachedPacks = {
    desktop: encodeStrategyPack(sources.desktop),
    mobile: encodeStrategyPack(sources.mobile),
    diffReport,
  };
  return cachedPacks;
}
