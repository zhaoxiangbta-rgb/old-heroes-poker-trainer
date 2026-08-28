import type { PublicDecisionState } from "./types";

export const POSTFLOP_FRACTIONS = [1 / 3, 0.5, 2 / 3, 1, 1.25, 1.5] as const;

export type SizingInterpolation = {
  lower: number;
  upper: number;
  weight: number;
};

export function sizingInterpolation(fraction: number): SizingInterpolation {
  if (!Number.isFinite(fraction) || fraction <= POSTFLOP_FRACTIONS[0]) {
    return { lower: POSTFLOP_FRACTIONS[0], upper: POSTFLOP_FRACTIONS[0], weight: 0 };
  }
  const last = POSTFLOP_FRACTIONS.at(-1)!;
  if (fraction >= last) return { lower: last, upper: last, weight: 0 };
  for (let index = 0; index < POSTFLOP_FRACTIONS.length - 1; index += 1) {
    const lower = POSTFLOP_FRACTIONS[index];
    const upper = POSTFLOP_FRACTIONS[index + 1];
    if (fraction <= upper) {
      return { lower, upper, weight: (fraction - lower) / (upper - lower) };
    }
  }
  return { lower: last, upper: last, weight: 0 };
}

export function legalPostflopTarget(state: PublicDecisionState, potFraction: number) {
  const actor = state.players.find((player) => player.seat === state.actingSeat);
  if (!actor) throw new Error("公开状态缺少决策玩家");
  const desiredInvestment = state.currentBet === 0
    ? Math.round(state.pot * potFraction)
    : state.legal.callAmount + Math.round((state.pot + state.legal.callAmount) * potFraction);
  const desiredTotal = actor.streetBet + desiredInvestment;
  return Math.max(
    state.legal.minRaiseTo,
    Math.min(state.legal.maxRaiseTo, desiredTotal),
  );
}
