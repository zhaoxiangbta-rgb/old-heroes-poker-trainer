import { useEffect, useMemo, useState } from "react";
import { PlayingCard } from "../components/PlayingCard";
import { positionLabel, type GameAction, type GameState } from "../game/game";
import {
  mobileBetPresetTarget,
  type MobileBetPreset,
} from "./mobileBetSizing";
import {
  mobileBetChoices,
  mobilePrimaryAction,
} from "./mobilePrimaryAction";
import { VerticalBetSlider } from "./VerticalBetSlider";

type Props = {
  game: GameState;
  busy: boolean;
  receipt: string;
  onAction(action: GameAction): void;
};

const presets: Array<{ id: MobileBetPreset; label: string }> = [
  { id: "half-pot", label: "半池" },
  { id: "two-thirds-pot", label: "2/3池" },
  { id: "pot", label: "底池" },
];

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

  const choosePreset = (preset: MobileBetPreset) => {
    if (!game.legal.canRaise || locked) return;
    const target = mobileBetPresetTarget(game, preset);
    setAmount(choices.includes(target) ? target : choices[0] ?? target);
    setError("");
  };

  return (
    <section className="mobile-floating-controls mobile-action-dock" aria-label="行动选择">
      <div className="mobile-floating-hole" aria-label="你的手牌">
        <div className="mobile-floating-hole-cards">
          {hero.hole.map((card) => (
            <PlayingCard card={card} key={card} />
          ))}
        </div>
        <small>你 · {positionLabel(hero.position).name}</small>
        <strong>余码 {hero.stack}</strong>
      </div>

      {choices.length > 1 ? (
        <VerticalBetSlider
          choices={choices}
          value={amount}
          disabled={locked}
          onChange={(value) => {
            setAmount(value);
            setError("");
          }}
        />
      ) : null}

      <div className="mobile-floating-actions">
        {game.legal.canFold ? (
          <button className="mobile-fold-chip" disabled={locked} onClick={() => send({ type: "fold" })}>
            弃牌
          </button>
        ) : null}
        {game.legal.canCheck ? (
          <button className="mobile-check-chip" disabled={locked} onClick={() => send({ type: "check" })}>
            过牌
          </button>
        ) : null}
        {primary ? (
          <button
            className={`mobile-primary-chip mode-${primary.mode}`}
            disabled={locked}
            onClick={() => send(primary.action)}
          >
            {primary.label}
          </button>
        ) : null}
      </div>

      {game.legal.canRaise ? (
        <div className="mobile-floating-presets">
          {presets.map((preset) => (
            <button key={preset.id} disabled={locked} onClick={() => choosePreset(preset.id)}>
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}
      {receipt ? <p className="mobile-floating-receipt">{receipt}</p> : null}
      {error ? <p className="mobile-floating-error" role="alert">{error}</p> : null}
    </section>
  );
}
