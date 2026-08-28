import { buildPots } from "../engine/pots";
import type { PublicDecisionState } from "./types";

export type MultiwayPotLayer = {
  amount: number;
  eligibleSeats: number[];
  heroEligible: boolean;
  heroContribution: number;
  heroCanWinAmount: number;
  automaticallyWon: boolean;
};

export type MultiwayPotExposure = {
  heroSeat: number;
  actionTo: number;
  incrementalCost: number;
  refundableAmount: number;
  maxLoss: number;
  totalCommitted: number;
  heroWinnableAmount: number;
  pots: MultiwayPotLayer[];
};

export function multiwayPotExposure(
  state: PublicDecisionState,
  actionTo: number,
): MultiwayPotExposure {
  const hero = state.players.find((player) => player.seat === state.actingSeat);
  if (!hero) throw new Error("行动座位不存在");
  if (!Number.isFinite(actionTo) || actionTo < hero.streetBet) {
    throw new Error("候选投入不得低于本街已投入");
  }
  const incrementalCost = actionTo - hero.streetBet;
  if (incrementalCost > hero.stack) throw new Error("候选投入超过有效筹码");

  const seatCount = Math.max(...state.players.map((player) => player.seat)) + 1;
  const contributions = Array<number>(seatCount).fill(0);
  const folded = new Set<number>();
  for (const player of state.players) {
    contributions[player.seat] = player.totalBet;
    if (player.folded) folded.add(player.seat);
  }
  contributions[hero.seat] = hero.totalBet + incrementalCost;

  const rawPots = buildPots(contributions, folded);
  const levels = [...new Set(contributions.filter((amount) => amount > 0))].sort((a, b) => a - b);
  let previousLevel = 0;
  let refundableAmount = 0;
  const pots = rawPots.map((pot, index): MultiwayPotLayer => {
    const level = levels[index];
    const layerWidth = level - previousLevel;
    previousLevel = level;
    const contributors = contributions
      .map((amount, seat) => amount >= level ? seat : -1)
      .filter((seat) => seat >= 0);
    const heroEligible = pot.eligible.includes(hero.seat);
    const heroContribution = contributions[hero.seat] >= level ? layerWidth : 0;
    const automaticallyWon = heroEligible && pot.eligible.length === 1;
    if (automaticallyWon && contributors.length === 1 && contributors[0] === hero.seat) {
      refundableAmount += heroContribution;
    }
    return {
      amount: pot.amount,
      eligibleSeats: [...pot.eligible],
      heroEligible,
      heroContribution,
      heroCanWinAmount: heroEligible ? pot.amount : 0,
      automaticallyWon,
    };
  });

  return {
    heroSeat: hero.seat,
    actionTo,
    incrementalCost,
    refundableAmount,
    maxLoss: Math.max(0, incrementalCost - refundableAmount),
    totalCommitted: contributions.reduce((sum, amount) => sum + amount, 0),
    heroWinnableAmount: pots.reduce((sum, pot) => sum + pot.heroCanWinAmount, 0),
    pots,
  };
}
