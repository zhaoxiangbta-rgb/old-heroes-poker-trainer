import { normalizeGameState, type GameState } from "../game/game";
import { normalizeGameplaySettings } from "../ui/tableThemes";
import type { GameplaySettings } from "./types";

export type TrainingExportV6 = {
  format: "poker-decision-trainer";
  version: 6;
  exportedAt: string;
  gameplaySettings: GameplaySettings;
  hands: GameState[];
};

const FORBIDDEN_KEYS = new Set(["apiKey", "api_key", "keychain", "secret", "authorization"]);

function containsForbidden(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbidden);
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_KEYS.has(key) || containsForbidden(nested));
}

export function handKey(hand: Pick<GameState, "seed" | "handNo">) {
  return `${hand.seed}:${hand.handNo}`;
}

export function encodeTrainingExport(input: {
  hands: GameState[];
  gameplaySettings: GameplaySettings;
}): string {
  const document: TrainingExportV6 = {
    format: "poker-decision-trainer",
    version: 6,
    exportedAt: new Date().toISOString(),
    gameplaySettings: normalizeGameplaySettings(input.gameplaySettings),
    hands: input.hands.map((hand) => normalizeGameState(structuredClone(hand))),
  };
  if (containsForbidden(document)) throw new Error("导出内容包含不允许的字段");
  return JSON.stringify(document, null, 2);
}

export function decodeTrainingExport(json: string): TrainingExportV6 {
  const parsed: unknown = JSON.parse(json);
  if (containsForbidden(parsed)) throw new Error("导入文件包含不允许的字段");
  if (!parsed || typeof parsed !== "object") throw new Error("导入文件格式无效");
  const root = parsed as Record<string, unknown>;
  if (root.format !== "poker-decision-trainer" || root.version !== 6 ||
      typeof root.exportedAt !== "string" || !Array.isArray(root.hands) ||
      !root.gameplaySettings || typeof root.gameplaySettings !== "object") {
    throw new Error("导入文件格式无效");
  }
  const hands = root.hands.map((item) => {
    if (!item || typeof item !== "object" || (item as { version?: unknown }).version !== 6)
      throw new Error("牌局快照版本无效");
    return normalizeGameState(structuredClone(item as GameState));
  });
  return {
    format: "poker-decision-trainer",
    version: 6,
    exportedAt: root.exportedAt,
    gameplaySettings: normalizeGameplaySettings(root.gameplaySettings as Partial<GameplaySettings>),
    hands,
  };
}
