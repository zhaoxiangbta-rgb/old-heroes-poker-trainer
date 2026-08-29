import type { GameState } from "../game/game";

export type MobileBetBounds = { min: number; max: number };
export type MobileBetPreset =
  | "half-pot"
  | "two-thirds-pot"
  | "pot"
  | "minimum";

export function mobileBetBounds(game: GameState): MobileBetBounds | null {
  if (!game.legal.canRaise) return null;
  return { min: game.legal.minRaiseTo, max: game.legal.maxRaiseTo };
}

export function clampMobileBet(value: number, bounds: MobileBetBounds) {
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(value)));
}

export function mobileBetPresetTarget(
  game: GameState,
  preset: MobileBetPreset,
) {
  const bounds = mobileBetBounds(game);
  if (!bounds) throw new Error("当前不能下注或加注");
  if (preset === "minimum") return bounds.min;
  const ratio =
    preset === "half-pot" ? 0.5 : preset === "two-thirds-pot" ? 2 / 3 : 1;
  const hero = game.players[game.heroSeat];
  const potAfterCall = game.pot + game.legal.callAmount;
  return clampMobileBet(
    hero.streetBet + game.legal.callAmount + potAfterCall * ratio,
    bounds,
  );
}
