import { describe, expect, it } from "vitest";
import { decodeStrategyPack } from "./packCodec";
import { compileStrategyPacks } from "./packCompiler";

describe("V3 strategy pack compiler", () => {
  it("builds desktop and mobile packs deterministically", () => {
    const first = compileStrategyPacks();
    const second = compileStrategyPacks();
    expect(first.desktop).toEqual(second.desktop);
    expect(first.mobile).toEqual(second.mobile);
    expect(first.diffReport.fatal).toEqual([]);
  }, 60_000);

  it("emits verifiable complete preflop packs", () => {
    const result = compileStrategyPacks();
    const desktop = decodeStrategyPack(result.desktop, {
      schemaVersion: 3,
      appVersion: "1.5.0",
      packKind: "desktop",
    });
    const mobile = decodeStrategyPack(result.mobile, {
      schemaVersion: 3,
      appVersion: "1.5.0",
      packKind: "mobile",
    });
    expect(desktop.preflop.nodes).toHaveLength(288);
    expect(mobile.preflop.nodes).toHaveLength(288);
    expect(desktop.manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
