import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { normalizeGameplaySettings } from "../ui/tableThemes";
import { decodeTrainingExport, encodeTrainingExport, handKey } from "./exportDocument";

describe("v6 training export", () => {
  it("round-trips hands and gameplay settings", () => {
    const hand = newGame(42);
    const gameplaySettings = normalizeGameplaySettings({ tableProfileId: "friends" });
    const decoded = decodeTrainingExport(encodeTrainingExport({ hands: [hand], gameplaySettings }));
    expect(decoded.version).toBe(6);
    expect(decoded.format).toBe("poker-decision-trainer");
    expect(decoded.hands).toEqual([hand]);
    expect(decoded.gameplaySettings).toEqual(gameplaySettings);
    expect(handKey(hand)).toBe("42:1");
  });

  it("rejects sensitive keys anywhere in an import", () => {
    expect(() => decodeTrainingExport(JSON.stringify({
      format: "poker-decision-trainer",
      version: 6,
      exportedAt: "now",
      apiKey: "secret",
      gameplaySettings: normalizeGameplaySettings({}),
      hands: [],
    }))).toThrow("导入文件包含不允许的字段");
  });
});
