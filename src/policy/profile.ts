import type { PlayerProfile } from "./types";

export const STANDARD_PROFILE: Readonly<PlayerProfile> = Object.freeze({
  id: "STANDARD",
  vpip: 0.24,
  pfr: 0.19,
  threeBet: 0.075,
  call: 1,
  aggression: 1,
  bluff: 1,
  riverRaiseStrength: 1,
  sizePreference: 1,
});
