import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { normalizeGameplaySettings } from "../ui/tableThemes";
import { decodeTrainingExport, encodeTrainingExport, handKey } from "./exportDocument";

describe("v7 training export", () => {
  it("round-trips hands and gameplay settings", () => {
    const hand = newGame(42);
    const gameplaySettings = normalizeGameplaySettings({ tableProfileId: "friends" });
    const decoded = decodeTrainingExport(encodeTrainingExport({ hands: [hand], gameplaySettings }));
    expect(decoded.version).toBe(7);
    expect(decoded.format).toBe("poker-decision-trainer");
    expect(decoded.hands).toEqual([hand]);
    expect(decoded.gameplaySettings).toEqual(gameplaySettings);
    expect(handKey(hand)).toBe("42:1");
  });

  it("migrates a version-six hand without inventing strategy decisions", () => {
    const current = newGame(71);
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.version = 6;
    delete legacy.strategyVersion;
    delete legacy.strategyDecisions;
    const decoded = decodeTrainingExport(JSON.stringify({
      format: "poker-decision-trainer",
      version: 6,
      exportedAt: "2026-08-27T00:00:00.000Z",
      gameplaySettings: normalizeGameplaySettings({}),
      hands: [legacy],
    }));
    expect(decoded.version).toBe(7);
    expect(decoded.hands[0]).toMatchObject({
      version: 7,
      strategyVersion: "legacy-v6",
      strategyDecisions: [],
    });
  });

  it("round-trips unified strategy records without sensitive fields", () => {
    const hand = newGame(42);
    const json = encodeTrainingExport({
      hands: [hand],
      gameplaySettings: normalizeGameplaySettings({}),
    });
    expect(JSON.parse(json).version).toBe(7);
    expect(decodeTrainingExport(json).hands[0].strategyDecisions).toEqual(
      hand.strategyDecisions,
    );
    expect(json).not.toMatch(/apiKey|authorization|opponentHole/i);
  });

  it("rejects sensitive keys anywhere in an import", () => {
    expect(() => decodeTrainingExport(JSON.stringify({
      format: "poker-decision-trainer",
      version: 7,
      exportedAt: "now",
      apiKey: "secret",
      gameplaySettings: normalizeGameplaySettings({}),
      hands: [],
    }))).toThrow("导入文件包含不允许的字段");
  });
});
