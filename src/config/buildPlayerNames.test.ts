import { describe, expect, it } from "vitest";
import { applyPlayerNameOverrides, PUBLIC_PLAYER_NAMES } from "./buildPlayerNames";
import { PUBLIC_DEFAULT_PLAYER_PROFILES } from "../policy/playerProfiles";

describe("build-time player names", () => {
  it("changes only display names for public defaults", () => {
    const overrides = { "friend-01": "本地名称" };
    const result = applyPlayerNameOverrides(PUBLIC_DEFAULT_PLAYER_PROFILES, overrides);
    expect(result[0]).toEqual({
      ...PUBLIC_DEFAULT_PLAYER_PROFILES[0],
      displayName: "本地名称",
    });
    expect(result[0].playerId).toBe("friend-01");
    expect(result[0].aggression).toBe(PUBLIC_DEFAULT_PLAYER_PROFILES[0].aggression);
  });

  it("preserves a name edited in Settings", () => {
    const profiles = PUBLIC_DEFAULT_PLAYER_PROFILES.map((profile) => ({ ...profile }));
    profiles[0].displayName = "用户自定义";
    const result = applyPlayerNameOverrides(profiles, { "friend-01": "本地名称" });
    expect(result[0].displayName).toBe("用户自定义");
  });

  it("declares exactly the stable public identities", () => {
    expect(Object.keys(PUBLIC_PLAYER_NAMES)).toEqual([
      "friend-01", "friend-02", "friend-03", "friend-04", "friend-05", "friend-06",
    ]);
  });
});
