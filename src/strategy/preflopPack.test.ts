import { describe, expect, it } from "vitest";
import {
  loadEmbeddedPreflopPack,
  verifyPreflopPack,
} from "./preflopPack";
import type { PreflopManifest } from "./preflopPack";

describe("embedded preflop strategy pack", () => {
  it("loads the generated package and quality manifest", () => {
    const loaded = loadEmbeddedPreflopPack();
    expect(loaded.manifest).toMatchObject({
      strategyVersion: "preflop-abstract-v1",
      algorithmVersion: "boundary-regret-v1",
      nodeCount: 288,
      iterations: 4000,
    });
    expect(loaded.pack.hands).toHaveLength(169);
    expect(loaded.pack.nodes).toHaveLength(288);
  });

  it("rejects a one-field strategy mutation by content hash", () => {
    const loaded = loadEmbeddedPreflopPack();
    const tampered = structuredClone(loaded.pack);
    tampered.nodes[0].continue += 0.001;
    expect(() => verifyPreflopPack(tampered, loaded.manifest)).toThrow(/哈希/);
  });

  it("rejects incompatible versions and malformed coverage", () => {
    const loaded = loadEmbeddedPreflopPack();
    expect(() => verifyPreflopPack(
      loaded.pack,
      {
        ...loaded.manifest,
        strategyVersion: "unknown" as PreflopManifest["strategyVersion"],
      },
    )).toThrow(/版本/);
    expect(() => verifyPreflopPack(
      { ...loaded.pack, nodes: loaded.pack.nodes.slice(1) },
      loaded.manifest,
    )).toThrow();
  });
});
