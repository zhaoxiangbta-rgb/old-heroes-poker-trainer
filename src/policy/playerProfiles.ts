import type { TableProfileId } from "./tableProfiles";

export type PlayerArchetype =
  | "loose-aggressive"
  | "loose-passive"
  | "tight-aggressive"
  | "tight-passive"
  | "balanced"
  | "recreational";

export type PlayerProfile = {
  version: 1;
  playerId: string;
  displayName: string;
  archetype: PlayerArchetype;
  looseness: number;
  aggression: number;
  bluff: number;
};

export type ProfileDimensions = Pick<
  PlayerProfile,
  "looseness" | "aggression" | "bluff"
>;

export type HandPlayerProfile = PlayerProfile & {
  handMood: {
    loosenessDelta: number;
    aggressionDelta: number;
    bluffDelta: number;
  };
  effective: ProfileDimensions;
};

export const PLAYER_ARCHETYPES: Record<
  PlayerArchetype,
  Readonly<ProfileDimensions & { name: string }>
> = {
  "loose-aggressive": { name: "松凶", looseness: 75, aggression: 72, bluff: 45 },
  "loose-passive": { name: "松弱", looseness: 78, aggression: 28, bluff: 18 },
  "tight-aggressive": { name: "紧凶", looseness: 32, aggression: 75, bluff: 38 },
  "tight-passive": { name: "紧弱", looseness: 28, aggression: 25, bluff: 12 },
  balanced: { name: "均衡", looseness: 50, aggression: 50, bluff: 35 },
  recreational: { name: "娱乐型", looseness: 82, aggression: 68, bluff: 60 },
};

export const DEFAULT_PLAYER_PROFILES: ReadonlyArray<Readonly<PlayerProfile>> =
  Object.freeze([
    Object.freeze({ version: 1, playerId: "friend-01", displayName: "阿岚", archetype: "loose-aggressive", looseness: 86, aggression: 88, bluff: 66 }),
    Object.freeze({ version: 1, playerId: "friend-02", displayName: "北辰", archetype: "balanced", looseness: 50, aggression: 58, bluff: 35 }),
    Object.freeze({ version: 1, playerId: "friend-03", displayName: "墨川", archetype: "balanced", looseness: 42, aggression: 52, bluff: 28 }),
    Object.freeze({ version: 1, playerId: "friend-04", displayName: "青禾", archetype: "balanced", looseness: 55, aggression: 64, bluff: 42 }),
    Object.freeze({ version: 1, playerId: "friend-05", displayName: "老周", archetype: "tight-passive", looseness: 36, aggression: 32, bluff: 15 }),
    Object.freeze({ version: 1, playerId: "friend-06", displayName: "小满", archetype: "tight-passive", looseness: 32, aggression: 28, bluff: 12 }),
  ] satisfies PlayerProfile[]);

const ARCHETYPES = new Set<PlayerArchetype>(
  Object.keys(PLAYER_ARCHETYPES) as PlayerArchetype[],
);

function cloneProfile(profile: Readonly<PlayerProfile>): PlayerProfile {
  return { ...profile };
}

function validDimension(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100;
}

function validateOne(profile: PlayerProfile) {
  const displayName = profile.displayName.trim();
  if (!displayName) throw new Error("牌友名称不能为空");
  if (displayName === "你") throw new Error("名称不能使用你");
  if (Array.from(displayName).length > 12) throw new Error("牌友名称最多 12 个字符");
  if (profile.version !== 1) throw new Error("牌友画像版本无效");
  if (!profile.playerId.trim()) throw new Error("牌友身份无效");
  if (!ARCHETYPES.has(profile.archetype)) throw new Error("牌友类型无效");
  if (![profile.looseness, profile.aggression, profile.bluff].every(validDimension))
    throw new Error("牌友参数必须是 0 到 100 的整数");
  return { ...profile, displayName };
}

export function validatePlayerProfiles(input: PlayerProfile[]) {
  if (input.length !== DEFAULT_PLAYER_PROFILES.length)
    throw new Error("必须保留六位牌友");
  const profiles = input.map(validateOne);
  if (new Set(profiles.map((profile) => profile.playerId)).size !== profiles.length)
    throw new Error("牌友身份不能重复");
  if (new Set(profiles.map((profile) => profile.displayName)).size !== profiles.length)
    throw new Error("牌友名称不能重复");
  const expectedIds = new Set(DEFAULT_PLAYER_PROFILES.map((profile) => profile.playerId));
  if (profiles.some((profile) => !expectedIds.has(profile.playerId)))
    throw new Error("牌友身份无效");
  return profiles;
}

export function normalizePlayerProfiles(input: unknown): PlayerProfile[] {
  const values = Array.isArray(input) ? input : [];
  const byId = new Map<string, unknown>();
  for (const value of values) {
    if (value && typeof value === "object" && "playerId" in value)
      byId.set(String(value.playerId), value);
  }
  const normalized = DEFAULT_PLAYER_PROFILES.map((fallback) => {
    const candidate = byId.get(fallback.playerId);
    try {
      return validateOne(candidate as PlayerProfile);
    } catch {
      return cloneProfile(fallback);
    }
  });
  const seen = new Set<string>();
  return normalized.map((profile, index) => {
    if (!seen.has(profile.displayName)) {
      seen.add(profile.displayName);
      return profile;
    }
    const fallback = cloneProfile(DEFAULT_PLAYER_PROFILES[index]);
    if (!seen.has(fallback.displayName)) {
      seen.add(fallback.displayName);
      return fallback;
    }
    fallback.displayName = `${fallback.displayName}${index + 1}`;
    seen.add(fallback.displayName);
    return fallback;
  });
}

function mix(seed: number, text: string, salt: number) {
  let value = (seed ^ salt) >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x45d9f3b) >>> 0;
    value ^= value >>> 16;
  }
  return value >>> 0;
}

function mood(seed: number, playerId: string, salt: number, radius: number) {
  return (mix(seed, playerId, salt) % (radius * 2 + 1)) - radius;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const TABLE_MODIFIERS: Record<TableProfileId, ProfileDimensions> = {
  balanced: { looseness: 0, aggression: 0, bluff: 0 },
  friends: { looseness: 8, aggression: -5, bluff: -8 },
  "loose-wild": { looseness: 15, aggression: 14, bluff: 12 },
};

export function effectivePlayerProfile(
  profile: PlayerProfile,
  tableProfileId: TableProfileId,
  seed: number,
): HandPlayerProfile {
  const valid = validateOne(profile);
  const radius = valid.archetype === "recreational" ? 10 : 6;
  const handMood = {
    loosenessDelta: mood(seed, valid.playerId, 0x1f123bb5, radius),
    aggressionDelta: mood(seed, valid.playerId, 0x6ac690c5, radius),
    bluffDelta: mood(seed, valid.playerId, 0x9e3779b9, radius),
  };
  const table = TABLE_MODIFIERS[tableProfileId];
  return {
    ...valid,
    handMood,
    effective: {
      looseness: clamp(valid.looseness + table.looseness + handMood.loosenessDelta),
      aggression: clamp(valid.aggression + table.aggression + handMood.aggressionDelta),
      bluff: clamp(valid.bluff + table.bluff + handMood.bluffDelta),
    },
  };
}

function loosenessText(value: number) {
  if (value >= 75) return "入池很宽";
  if (value >= 58) return "入池偏宽";
  if (value <= 35) return "入池谨慎";
  return "选择性入池";
}

function aggressionText(value: number) {
  if (value >= 75) return "强势进攻";
  if (value >= 55) return "主动施压";
  if (value <= 35) return "偏向跟注";
  return "攻守均衡";
}

function bluffText(value: number) {
  if (value >= 60) return "频繁诈唬";
  if (value >= 38) return "偶尔变速";
  if (value <= 20) return "很少诈唬";
  return "诈唬克制";
}

export function describePlayerProfile(profile: ProfileDimensions) {
  return `${loosenessText(profile.looseness)} · ${aggressionText(profile.aggression)} · ${bluffText(profile.bluff)}`;
}
