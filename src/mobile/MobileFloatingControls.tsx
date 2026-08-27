import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PlayingCard } from "../components/PlayingCard";
import { positionLabel, type GameAction, type GameState } from "../game/game";
import {
  mobileBetChoices,
  mobilePrimaryAction,
} from "./mobilePrimaryAction";
import { HorizontalBetSlider } from "./HorizontalBetSlider";
import { mobileBetRailNodes } from "./mobileBetRail";
import { mobileBetPresetTarget, type MobileBetPreset } from "./mobileBetSizing";
import { POKER_CONTROL_ASSETS } from "../ui/pokerVisualAssets";

function chipStyle(image: string) {
  return { "--control-chip-image": `url(${image})` } as CSSProperties;
}

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
  const chooseSize = (preset: MobileBetPreset) => {
    if (locked || !game.legal.canRaise) return;
    setAmount(mobileBetPresetTarget(game, preset));
    setError("");
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

      <div className="mobile-size-zone" aria-label="快捷下注尺寸">
        <div className="mobile-size-buttons">
          <button disabled={locked || !game.legal.canRaise} onClick={() => chooseSize("half-pot")}>半池</button>
          <button disabled={locked || !game.legal.canRaise} onClick={() => chooseSize("two-thirds-pot")}>2/3池</button>
          <button disabled={locked || !game.legal.canRaise} onClick={() => chooseSize("pot")}>底池</button>
        </div>
        <small>余码 {hero.stack} · {positionLabel(hero.position).name}</small>
      </div>

      <div className="mobile-floating-hole mobile-hand-zone" aria-label="你的手牌">
        <div className="mobile-floating-hole-cards">
          {hero.hole.map((card) => (
            <PlayingCard card={card} key={card} />
          ))}
        </div>
      </div>

      <div className="mobile-floating-actions mobile-right-actions mobile-action-zone">
        <button style={chipStyle(POKER_CONTROL_ASSETS.fold)} className="mobile-fold-chip mobile-chip-control chip-fold" disabled={locked || !game.legal.canFold} onClick={() => send({ type: "fold" })}>
          弃牌
        </button>
        <button style={chipStyle(POKER_CONTROL_ASSETS.check)} className="mobile-check-chip mobile-chip-control chip-primary" disabled={locked || !game.legal.canCheck} onClick={() => send({ type: "check" })}>
          过牌
        </button>
        <button
          className={`mobile-primary-chip mobile-chip-control ${primary?.mode === "all-in" ? "chip-all-in" : "chip-primary"}${primary ? ` mode-${primary.mode}` : ""}`}
          style={chipStyle(primary?.mode === "all-in" ? POKER_CONTROL_ASSETS.allIn : POKER_CONTROL_ASSETS.primary)}
          disabled={locked || !primary}
          onClick={() => primary && send(primary.action)}
        >
          {primary?.label ?? "跟注/下注"}
        </button>
      </div>

      {receipt ? <p className="mobile-floating-receipt">{receipt}</p> : null}
      {error ? <p className="mobile-floating-error" role="alert">{error}</p> : null}
    </section>
  );
}
