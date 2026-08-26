export const MOBILE_PORTRAITS = Array.from(
  { length: 6 },
  (_, index) => `/assets/mobile-casino/avatars/player-0${index + 1}.jpg`,
) as readonly string[];

export function mobilePortraitFor(playerId: string, seat: number) {
  if (playerId === "hero" || /^friend-\d+$/.test(playerId)) {
    return MOBILE_PORTRAITS[seat % MOBILE_PORTRAITS.length];
  }
  let hash = 17;
  for (const char of playerId) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  if (!playerId) hash = seat;
  return MOBILE_PORTRAITS[hash % MOBILE_PORTRAITS.length];
}
