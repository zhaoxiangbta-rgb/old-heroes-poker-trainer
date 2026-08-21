import { invoke } from "@tauri-apps/api/core";
import { normalizeGameState, type GameState } from "../game/game";
import type {
  ConnectionResult,
  DesktopRepository,
  ExportHandsResult,
  GameplaySettings,
  ImportHandsResult,
  ModelSettings,
} from "./types";
import { normalizeGameplaySettings } from "../ui/tableThemes";

export class RepositoryError extends Error {
  constructor(
    public readonly code: "read" | "write" | "import" | "export" | "settings" | "connection",
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

async function safely<T>(
  code: RepositoryError["code"],
  message: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new RepositoryError(code, message);
  }
}

export function createNativeRepository(): DesktopRepository {
  return {
    mode: "native",
    loadHands: () =>
      safely("read", "读取历史牌局失败", async () => {
        const encoded = await invoke<string[]>("list_hands");
        return encoded.map((item) => normalizeGameState(JSON.parse(item) as GameState));
      }),
    saveHand: (hand) =>
      safely("write", "本手未保存", async () => {
        await invoke("save_hand", { json: JSON.stringify(hand) });
      }),
    exportHands: () =>
      safely("export", "导出历史牌局失败", async () => {
        const result = await invoke<{ cancelled: boolean; exported: number }>("export_hands");
        return { cancelled: result.cancelled, count: result.exported } satisfies ExportHandsResult;
      }),
    importHands: () =>
      safely("import", "导入历史牌局失败", () =>
        invoke<ImportHandsResult>("import_hands").then((result) => ({
          ...result,
          gameplaySettings: result.gameplaySettings
            ? normalizeGameplaySettings(result.gameplaySettings)
            : undefined,
        })),
      ),
    clearHands: () =>
      safely("write", "清空历史牌局失败", () => invoke("clear_hands")),
    loadModelSettings: () =>
      safely("settings", "读取模型设置失败", () =>
        invoke<ModelSettings>("get_model_settings"),
      ),
    saveModelSettings: (settings) =>
      safely("settings", "保存模型设置失败", () =>
        invoke("save_model_settings", { settings }),
      ),
    loadGameplaySettings: () =>
      safely("settings", "读取玩法设置失败", () =>
        invoke<GameplaySettings>("get_gameplay_settings").then(normalizeGameplaySettings),
      ),
    saveGameplaySettings: (settings) =>
      safely("settings", "保存玩法设置失败", () =>
        invoke("save_gameplay_settings", {
          settings: normalizeGameplaySettings(settings),
        }),
      ),
    hasApiKey: () =>
      safely("settings", "读取密钥状态失败", () => invoke<boolean>("has_api_key")),
    saveApiKey: (value) =>
      safely("settings", "保存 API Key 失败", () => invoke("set_api_key", { value })),
    testModelConnection: (settings) =>
      safely("connection", "连接失败，训练仍可完全离线", () =>
        invoke<ConnectionResult>("test_ai", {
          baseUrl: settings.baseUrl,
          model: settings.model,
        }),
      ),
  };
}
