import { BUILD_PLAYER_NAME_OVERRIDES } from "./playerNames.generated";

export const PUBLIC_PLAYER_NAMES = Object.freeze({
  "friend-01": "阿岚",
  "friend-02": "北辰",
  "friend-03": "墨川",
  "friend-04": "青禾",
  "friend-05": "老周",
  "friend-06": "小满",
} as const);

export type StablePlayerId = keyof typeof PUBLIC_PLAYER_NAMES;
export type PlayerNameOverrides = Readonly<Partial<Record<StablePlayerId, string>>>;

type NamedPlayer = { playerId: string; displayName: string };

export function applyPlayerNameOverrides<T extends NamedPlayer>(
  profiles: readonly T[],
  overrides: Readonly<Partial<Record<string, string>>>,
): T[] {
  return profiles.map((profile) => {
    const playerId = profile.playerId as StablePlayerId;
    const localName = overrides[playerId];
    if (!localName || profile.displayName !== PUBLIC_PLAYER_NAMES[playerId])
      return { ...profile };
    return { ...profile, displayName: localName };
  });
}

export function applyBuildPlayerNames<T extends NamedPlayer>(profiles: readonly T[]): T[] {
  return applyPlayerNameOverrides(profiles, BUILD_PLAYER_NAME_OVERRIDES);
}
