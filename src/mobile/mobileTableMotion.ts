import type { Result } from "../game/game";
import type { VisualToken } from "../game/useGamePlayback";
import { mobileVisualSeat } from "./mobileSeatLayout";

export type MobileActionFlight =
  | {
      key: string;
      kind: "chips";
      actorSeat: number;
      visualSeat: number;
      chipCount: number;
    }
  | {
      key: string;
      kind: "fold";
      actorSeat: number;
      visualSeat: number;
      cardCount: 2;
    };

export type MobileSettlementFlight = {
  key: string;
  winnerSeat: number;
  visualSeat: number;
  amount: number;
  chipCount: 2;
};

export function mobileActionFlights(
  tokens: VisualToken[],
  heroSeat: number,
  playerCount: number,
): MobileActionFlight[] {
  let visibleChipCount = 0;
  return tokens.flatMap((token): MobileActionFlight[] => {
    if (token.actorSeat === undefined) return [];
    const visualSeat = mobileVisualSeat(token.actorSeat, heroSeat, playerCount);
    if (token.effect === "fold") {
      return [{
        key: `fold-${token.id}`,
        kind: "fold",
        actorSeat: token.actorSeat,
        visualSeat,
        cardCount: 2,
      }];
    }
    if (token.effect !== "chips" || visibleChipCount >= 12) return [];
    const requested = token.action?.kind === "all-in"
      ? 6
      : (token.action?.amount ?? 0) >= 30
        ? 4
        : 3;
    const chipCount = Math.min(requested, 12 - visibleChipCount);
    visibleChipCount += chipCount;
    return [{
      key: `chips-${token.id}`,
      kind: "chips",
      actorSeat: token.actorSeat,
      visualSeat,
      chipCount,
    }];
  });
}

export function mobileSettlementFlights(
  result: Result | undefined,
  heroSeat: number,
  playerCount: number,
): MobileSettlementFlight[] {
  return (result?.pots ?? []).flatMap((pot, potIndex) =>
    pot.winners.map((winnerSeat, winnerIndex) => ({
      key: `collect-${potIndex}-${winnerIndex}-${winnerSeat}`,
      winnerSeat,
      visualSeat: mobileVisualSeat(winnerSeat, heroSeat, playerCount),
      amount: Math.floor(pot.amount / pot.winners.length),
      chipCount: 2 as const,
    })),
  ).slice(0, 6);
}
