import { normalizeGameState, type GameState } from "../game/game";
import type {
  ConnectionResult,
  DesktopRepository,
  GameplaySettings,
  ModelSettings,
} from "./types";
import { normalizeGameplaySettings } from "../ui/tableThemes";

const DEFAULT_SETTINGS: ModelSettings = {
  baseUrl: "http://127.0.0.1:8317",
  model: "gpt-local",
};

export function createMemoryRepository(): DesktopRepository {
  const hands: GameState[] = [];
  let settings = { ...DEFAULT_SETTINGS };
  let gameplaySettings: GameplaySettings = normalizeGameplaySettings({});
  return {
    mode: "preview",
    async loadHands() {
      return structuredClone(hands);
    },
    async saveHand(hand) {
      const key = `${hand.seed}:${hand.handNo}`;
      if (hands.some((item) => `${item.seed}:${item.handNo}` === key)) return;
      hands.unshift(normalizeGameState(structuredClone(hand)));
    },
    async exportHands() {
      return { cancelled: true, count: 0 };
    },
    async importHands() {
      return { cancelled: true, imported: 0, skipped: 0 };
    },
    async clearHands() {
      hands.length = 0;
    },
    async loadModelSettings() {
      return { ...settings };
    },
    async saveModelSettings(next) {
      settings = { ...next };
    },
    async loadGameplaySettings() {
      return normalizeGameplaySettings(gameplaySettings);
    },
    async saveGameplaySettings(next) {
      gameplaySettings = normalizeGameplaySettings(next);
    },
    async hasApiKey() {
      return false;
    },
    async saveApiKey() {
      // Browser preview deliberately does not retain secrets, even in memory.
    },
    async testModelConnection(): Promise<ConnectionResult> {
      throw new Error("开发预览不连接外部模型");
    },
  };
}

export { DEFAULT_SETTINGS };
