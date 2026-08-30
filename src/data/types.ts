import type { GameState } from "../game/game";
import type { TableProfileId } from "../policy/tableProfiles";
import type { PlayerProfile } from "../policy/playerProfiles";
import type { TableThemeId } from "../ui/tableThemes";

export type RepositoryMode = "native" | "preview" | "mobile";

export type ModelSettings = {
  baseUrl: string;
  model: string;
};

export type GameplaySettings = {
  tableProfileId: TableProfileId;
  tableThemeId: TableThemeId;
  teachingPanelWidth: number;
  playerProfiles: PlayerProfile[];
};

export type ConnectionResult = {
  ok: boolean;
  message: string;
};

export type ExportHandsResult = {
  cancelled: boolean;
  count: number;
};

export type ImportHandsResult = {
  cancelled: boolean;
  imported: number;
  skipped: number;
  gameplaySettings?: GameplaySettings;
};

export interface DesktopRepository {
  readonly mode: RepositoryMode;
  loadHands(): Promise<GameState[]>;
  saveHand(hand: GameState): Promise<void>;
  replaceHand(hand: GameState): Promise<void>;
  exportHands(): Promise<ExportHandsResult>;
  importHands(): Promise<ImportHandsResult>;
  clearHands(): Promise<void>;
  loadModelSettings(): Promise<ModelSettings>;
  saveModelSettings(settings: ModelSettings): Promise<void>;
  loadGameplaySettings(): Promise<GameplaySettings>;
  saveGameplaySettings(settings: GameplaySettings): Promise<void>;
  hasApiKey(): Promise<boolean>;
  saveApiKey(value: string): Promise<void>;
  testModelConnection(settings: ModelSettings): Promise<ConnectionResult>;
}

export interface MobileRepository extends DesktopRepository {
  exportDocument(): Promise<string>;
  importDocument(json: string): Promise<ImportHandsResult>;
}
