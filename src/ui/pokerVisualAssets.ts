const ROOT = "/assets/poker-visuals";

const PORTRAITS = Array.from({ length: 6 }, (_, index) =>
  `${ROOT}/avatars/player-${String(index + 1).padStart(2, "0")}.png`,
);

const PLAYER_PORTRAITS: Record<string, string> = Object.fromEntries(
  PORTRAITS.map((path, index) => [`friend-${String(index + 1).padStart(2, "0")}`, path]),
);

const WAGER_CHIPS = ["red", "blue", "green", "black", "gold"].map(
  (color) => `${ROOT}/chips/wager-${color}.png`,
);

export const POKER_CONTROL_ASSETS = Object.freeze({
  fold: `${ROOT}/controls/fold.png`,
  check: `${ROOT}/controls/check.png`,
  primary: `${ROOT}/controls/primary.png`,
  allIn: `${ROOT}/controls/all-in.png`,
  sizingPlaque: `${ROOT}/controls/sizing-plaque.png`,
});

export const POKER_CARD_ASSETS = Object.freeze({
  paper: `${ROOT}/cards/card-paper.png`,
  back: `${ROOT}/cards/card-back.png`,
});

export function playerPortraitFor(playerId: string, seat: number) {
  return PLAYER_PORTRAITS[playerId] ?? PORTRAITS[((seat % PORTRAITS.length) + PORTRAITS.length) % PORTRAITS.length];
}

export function wagerChipFor(seat: number) {
  return WAGER_CHIPS[((seat % WAGER_CHIPS.length) + WAGER_CHIPS.length) % WAGER_CHIPS.length];
}
