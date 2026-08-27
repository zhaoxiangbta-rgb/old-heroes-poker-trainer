import type { GameState } from "../game/game";
import type { PlaybackPhase } from "../game/playback";
import type { VisualToken } from "../game/useGamePlayback";
import { POKER_CARD_ASSETS, wagerChipFor } from "../ui/pokerVisualAssets";
import { mobileActionFlights, mobileSettlementFlights } from "./mobileTableMotion";

type Props = {
  game: GameState;
  phase: PlaybackPhase;
  tokens: VisualToken[];
};

export function MobileTableEffects({ game, phase, tokens }: Props) {
  const actions = mobileActionFlights(tokens, game.heroSeat, game.players.length);
  const awards = phase === "settling-pot"
    ? mobileSettlementFlights(game.result, game.heroSeat, game.players.length)
    : [];

  return (
    <div className="mobile-table-effects" aria-hidden="true">
      {actions.map((flight) => flight.kind === "chips" ? (
        <span
          className={`mobile-action-chip-flight toward-pot from-visual-seat-${flight.visualSeat}`}
          data-testid="mobile-chip-flight"
          key={flight.key}
        >
          {Array.from({ length: flight.chipCount }, (_, index) => (
            <img src={wagerChipFor(flight.actorSeat + index)} alt="" key={index} />
          ))}
        </span>
      ) : (
        <span
          className={`mobile-fold-flight from-visual-seat-${flight.visualSeat}`}
          data-testid="mobile-fold-flight"
          key={flight.key}
        >
          <img src={POKER_CARD_ASSETS.back} alt="" />
          <img src={POKER_CARD_ASSETS.back} alt="" />
        </span>
      ))}
      {awards.map((award) => (
        <span
          className={`mobile-pot-award to-visual-seat-${award.visualSeat}`}
          data-testid="mobile-pot-award"
          data-award-amount={award.amount}
          key={award.key}
        >
          {Array.from({ length: award.chipCount }, (_, index) => (
            <img src={wagerChipFor(award.winnerSeat + index)} alt="" key={index} />
          ))}
        </span>
      ))}
    </div>
  );
}
