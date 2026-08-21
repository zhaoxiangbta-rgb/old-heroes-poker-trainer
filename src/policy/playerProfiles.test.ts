import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYER_PROFILES,
  describePlayerProfile,
  effectivePlayerProfile,
  normalizePlayerProfiles,
  validatePlayerProfiles,
} from "./playerProfiles";

describe("player profile domain", () => {
  it("ships the six approved Old Heroes defaults", () => {
    expect(
      DEFAULT_PLAYER_PROFILES.map((profile) => [
        profile.playerId,
        profile.displayName,
        profile.looseness,
        profile.aggression,
        profile.bluff,
      ]),
    ).toEqual([
      ["friend-01", "阿岚", 86, 88, 66],
      ["friend-02", "北辰", 50, 58, 35],
      ["friend-03", "墨川", 42, 52, 28],
      ["friend-04", "青禾", 55, 64, 42],
      ["friend-05", "老周", 36, 32, 15],
      ["friend-06", "小满", 32, 28, 12],
    ]);
  });

  it("repairs one corrupt friend without replacing valid friends", () => {
    const input = DEFAULT_PLAYER_PROFILES.map((profile) => ({ ...profile }));
    input[0].displayName = "新名字";
    input[1].looseness = 999;
    const result = normalizePlayerProfiles(input);
    expect(result[0].displayName).toBe("新名字");
    expect(result[1]).toEqual(DEFAULT_PLAYER_PROFILES[1]);
  });

  it("rejects duplicate, reserved, empty and overlong names", () => {
    const invalidNames = ["你", "", "一二三四五六七八九十一二三"];
    for (const displayName of invalidNames) {
      expect(() =>
        validatePlayerProfiles([
          { ...DEFAULT_PLAYER_PROFILES[0], displayName },
          ...DEFAULT_PLAYER_PROFILES.slice(1),
        ]),
      ).toThrow();
    }
    expect(() =>
      validatePlayerProfiles([
        DEFAULT_PLAYER_PROFILES[0],
        { ...DEFAULT_PLAYER_PROFILES[1], displayName: "阿岚" },
        ...DEFAULT_PLAYER_PROFILES.slice(2),
      ]),
    ).toThrow("牌友名称不能重复");
  });

  it("keeps mood stable across rename and inside approved bounds", () => {
    const base = DEFAULT_PLAYER_PROFILES[0];
    const first = effectivePlayerProfile(base, "friends", 42);
    const renamed = effectivePlayerProfile(
      { ...base, displayName: "岚风" },
      "friends",
      42,
    );
    expect(renamed.handMood).toEqual(first.handMood);
    expect(
      Object.values(first.handMood).every(
        (value) => value >= -6 && value <= 6,
      ),
    ).toBe(true);
  });

  it("composes table style and clamps every effective value", () => {
    for (const profile of DEFAULT_PLAYER_PROFILES) {
      for (const tableProfileId of ["balanced", "friends", "loose-wild"] as const) {
        for (let seed = 0; seed < 200; seed += 1) {
          const effective = effectivePlayerProfile(profile, tableProfileId, seed);
          expect(Object.values(effective.effective).every(Number.isInteger)).toBe(true);
          expect(
            Object.values(effective.effective).every(
              (value) => value >= 0 && value <= 100,
            ),
          ).toBe(true);
        }
      }
    }
  });

  it("describes values rather than trusting the preset label", () => {
    expect(
      describePlayerProfile({
        ...DEFAULT_PLAYER_PROFILES[3],
        looseness: 90,
        aggression: 20,
        bluff: 10,
      }),
    ).toBe("入池很宽 · 偏向跟注 · 很少诈唬");
  });
});
