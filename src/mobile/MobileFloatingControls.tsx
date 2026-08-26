import { useEffect, useMemo, useState } from "react";
import { PlayingCard } from "../components/PlayingCard";
import { positionLabel, type GameAction, type GameState } from "../game/game";
import {
  mobileBetChoices,
  mobilePrimaryAction,
} from "./mobilePrimaryAction";
import { HorizontalBetSlider } from "./HorizontalBetSlider";
import { mobileBetRailNodes } from "./mobileBetRail";

type Props = {
  game: GameState;
  busy: boolean;
  receipt: string;
  onAction(action: GameAction): void;
};

export function MobileFloatingControls({
  game,
  busy,
  receipt,
  onAction,
}: Props) {
  const choices = useMemo(() => mobileBetChoices(game), [game]);
  const hero = game.players[game.heroSeat];
  const [amount, setAmount] = useState(choices[0] ?? 0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || submitted;
  const primary = choices.length ? mobilePrimaryAction(game, amount) : null;
  const nodes = useMemo(
    () => game.legal.canRaise ? mobileBetRailNodes(game, choices) : [],
    [game, choices],
  );

  useEffect(() => {
    setAmount(choices[0] ?? 0);
    setSubmitted(false);
    setError("");
  }, [choices, game.seed, game.street, game.toAct, game.legal.callAmount, game.legal.minRaiseTo]);

  const send = (action: GameAction) => {
    if (locked) return;
    setSubmitted(true);
    try {
      onAction(action);
    } catch (reason) {
      setSubmitted(false);
      setError(reason instanceof Error ? reason.message : "当前操作不合法");
    }
  };

  return (
    <section className="mobile-floating-controls mobile-action-dock mobile-casino-dock" aria-label="行动选择">
      {choices.length > 1 ? (
        <HorizontalBetSlider
          choices={choices}
          value={amount}
          nodes={nodes}
          disabled={locked}
          onChange={(value) => {
            setAmount(value);
            setError("");
          }}
        />
      ) : null}

      <div className="mobile-player-bankroll" role="group" aria-label="你的筹码信息">
        <span className="mobile-bankroll-stack" aria-hidden="true"><i /><i /><i /></span>
        <strong>余码 {hero.stack}</strong>
        <small>你 · {positionLabel(hero.position).name}</small>
      </div>

      <div className="mobile-floating-hole mobile-centered-hole" aria-label="你的手牌">
        <div className="mobile-floating-hole-cards">
          {hero.hole.map((card) => (
            <PlayingCard card={card} key={card} />
          ))}
        </div>
      </div>

      <div className="mobile-floating-actions mobile-right-actions">
        {game.legal.canFold ? (
          <button className="mobile-fold-chip mobile-chip-control chip-fold" disabled={locked} onClick={() => send({ type: "fold" })}>
            弃牌
          </button>
        ) : null}
        {game.legal.canCheck ? (
          <button className="mobile-check-chip mobile-chip-control chip-primary" disabled={locked} onClick={() => send({ type: "check" })}>
            过牌
          </button>
        ) : null}
        {primary ? (
          <button
            className={`mobile-primary-chip mobile-chip-control ${primary.mode === "all-in" ? "chip-all-in" : "chip-primary"} mode-${primary.mode}`}
            disabled={locked}
            onClick={() => send(primary.action)}
          >
            {primary.label}
          </button>
        ) : null}
      </div>

      {receipt ? <p className="mobile-floating-receipt">{receipt}</p> : null}
      {error ? <p className="mobile-floating-error" role="alert">{error}</p> : null}
    </section>
  );
}
