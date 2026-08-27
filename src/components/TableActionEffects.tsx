import type { VisualToken } from "../game/useGamePlayback";
import { POKER_CARD_ASSETS, wagerChipFor } from "../ui/pokerVisualAssets";

export function TableActionEffects({ tokens }: { tokens: VisualToken[] }) {
  return (
    <div className="table-action-effects" aria-hidden="true">
      {tokens.map((token) => {
        if (token.actorSeat === undefined) return null;
        const actorSeat = token.actorSeat;
        if (token.effect === "chips") {
          const count = token.action?.amount && token.action.amount >= 30 ? 4 : 3;
          return (
            <div
              className={`flying-wager from-seat-${actorSeat}`}
              data-action-amount={token.action?.amount ?? 0}
              key={token.id}
            >
              {Array.from({ length: count }, (_, index) => (
                <img src={wagerChipFor(actorSeat + index)} alt="" key={index} />
              ))}
            </div>
          );
        }
        if (token.effect === "fold") {
          return (
            <div className={`fold-flight from-seat-${actorSeat}`} key={token.id}>
              <img src={POKER_CARD_ASSETS.back} alt="" />
              <img src={POKER_CARD_ASSETS.back} alt="" />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
