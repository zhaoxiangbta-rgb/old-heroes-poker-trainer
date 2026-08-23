import type { GameplaySettings } from "../data/types";
import type { TableProfileId } from "../policy/tableProfiles";
import { normalizePlayerProfiles } from "../policy/playerProfiles";
import { applyBuildPlayerNames } from "../config/buildPlayerNames";

export const TABLE_THEME_IDS = [
  "classic-green",
  "midnight-blue",
  "wine-red",
  "graphite-black",
] as const;

export type TableThemeId = (typeof TABLE_THEME_IDS)[number];

export type TableTheme = {
  id: TableThemeId;
  name: string;
  center: string;
  edge: string;
  rail: string;
};

export const TABLE_THEMES: Record<TableThemeId, TableTheme> = {
  "classic-green": { id: "classic-green", name: "经典深绿", center: "#1a503b", edge: "#123425", rail: "#202822" },
  "midnight-blue": { id: "midnight-blue", name: "午夜蓝", center: "#234d67", edge: "#102738", rail: "#18242d" },
  "wine-red": { id: "wine-red", name: "酒红", center: "#6a2f38", edge: "#32151c", rail: "#2b1e20" },
  "graphite-black": { id: "graphite-black", name: "石墨黑", center: "#353d3a", edge: "#171c1a", rail: "#151a18" },
};

export const DEFAULT_TEACHING_PANEL_WIDTH = 350;
export const MIN_TEACHING_PANEL_WIDTH = 300;
export const MAX_TEACHING_PANEL_WIDTH = 520;

const PROFILE_IDS: TableProfileId[] = ["balanced", "friends", "loose-wild"];

export function normalizeGameplaySettings(
  input: Partial<GameplaySettings>,
): GameplaySettings {
  const tableProfileId = PROFILE_IDS.includes(input.tableProfileId as TableProfileId)
    ? input.tableProfileId as TableProfileId
    : "balanced";
  const tableThemeId = TABLE_THEME_IDS.includes(input.tableThemeId as TableThemeId)
    ? input.tableThemeId as TableThemeId
    : "classic-green";
  const candidateWidth = Number.isFinite(input.teachingPanelWidth)
    ? Math.round(input.teachingPanelWidth as number)
    : DEFAULT_TEACHING_PANEL_WIDTH;

  return {
    tableProfileId,
    tableThemeId,
    teachingPanelWidth: Math.min(
      MAX_TEACHING_PANEL_WIDTH,
      Math.max(MIN_TEACHING_PANEL_WIDTH, candidateWidth),
    ),
    playerProfiles: normalizePlayerProfiles(
      applyBuildPlayerNames(Array.isArray(input.playerProfiles) ? input.playerProfiles : []),
    ),
  };
}
