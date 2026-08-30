import { describe, expect, it } from "vitest";
import { ALL_PREFLOP_HANDS } from "../preflopHands";
import { decodeStrategyPack, encodeStrategyPack } from "./packCodec";
import type { PackExpectation, StrategyPackSource } from "./packTypes";

function minimalSource(packKind: "desktop" | "mobile" = "desktop"): StrategyPackSource {
  return {
    strategyVersion: "strategy-v3-test",
    sourceVersion: "source-v3-test",
    compilerVersion: "compiler-v3-test",
    packKind,
    minimumAppVersion: "1.5.0",
    preflop: {
      nodes: [{
        id: "unopened:HJ:100",
        spot: "unopened",
        position: "HJ",
        stack: 100,
        hands: ALL_PREFLOP_HANDS.map((hand) => ({
          hand,
          source: "expert-baseline-v3",
          actions: [{ kind: "fold", sizeCode: 0, frequencyQ: 65_535, evMilliBb: 0 }],
        })),
      }],
    },
    postflop: { nodes: [] },
  };
}

function expectation(packKind: "desktop" | "mobile"): PackExpectation {
  return { schemaVersion: 3, appVersion: "1.5.0", packKind };
}

describe("strategy pack v3 codec", () => {
  it("round-trips a versioned strategy pack", () => {
    const bytes = encodeStrategyPack(minimalSource());
    const loaded = decodeStrategyPack(bytes, expectation("desktop"));

    expect(loaded.manifest).toMatchObject({
      schemaVersion: 3,
      packKind: "desktop",
      nodeCount: 1,
    });
    expect(loaded.preflop.nodes[0].hands).toHaveLength(169);
  });

  it("rejects a tampered payload before parsing it", () => {
    const bytes = encodeStrategyPack(minimalSource());
    bytes[bytes.length - 1] ^= 1;

    expect(() => decodeStrategyPack(bytes, expectation("desktop")))
      .toThrow(/SHA-256/);
  });

  it("rejects a pack-kind mismatch", () => {
    const bytes = encodeStrategyPack(minimalSource("desktop"));

    expect(() => decodeStrategyPack(bytes, expectation("mobile")))
      .toThrow(/packKind/);
  });

  it("rejects incomplete or non-normalized preflop cells", () => {
    const incomplete = minimalSource();
    incomplete.preflop.nodes[0].hands.pop();
    expect(() => encodeStrategyPack(incomplete)).toThrow(/169/);

    const nonNormalized = minimalSource();
    nonNormalized.preflop.nodes[0].hands[0].actions[0].frequencyQ = 50_000;
    expect(() => encodeStrategyPack(nonNormalized)).toThrow(/65535/);
  });
});
