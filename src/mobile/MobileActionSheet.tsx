import { useEffect, useState } from "react";
import { actionForTarget, type GameAction, type GameState } from "../game/game";
import {
  clampMobileBet,
  mobileBetBounds,
  mobileBetPresetTarget,
  type MobileBetPreset,
} from "./mobileBetSizing";
import { VerticalBetSlider } from "./VerticalBetSlider";

type Props = {
  game: GameState;
  busy: boolean;
  receipt: string;
  onAction(action: GameAction): void;
};

const presets: Array<{ id: MobileBetPreset; label: string }> = [
  { id: "half-pot", label: "½池" },
  { id: "two-thirds-pot", label: "⅔池" },
  { id: "pot", label: "底池" },
  { id: "minimum", label: "最小" },
];

export function MobileActionSheet({ game, busy, receipt, onAction }: Props) {
  const bounds = mobileBetBounds(game);
  const minimum = bounds?.min ?? 0;
  const maximum = bounds?.max ?? 0;
  const [amount, setAmount] = useState(minimum);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || submitted;
  const allIn = Boolean(bounds && amount === maximum);

  useEffect(() => {
    setAmount((current) =>
      game.legal.canRaise
        ? clampMobileBet(current || minimum, { min: minimum, max: maximum })
        : 0,
    );
    setSubmitted(false);
    setError("");
  }, [game.seed, game.street, game.toAct, game.legal.canRaise, minimum, maximum]);

  const send = (action: GameAction | (() => GameAction)) => {
    if (locked) return;
    setSubmitted(true);
    try {
      onAction(typeof action === "function" ? action() : action);
    } catch (reason) {
      setSubmitted(false);
      setError(reason instanceof Error ? reason.message : "当前金额不合法");
    }
  };

  const choosePreset = (preset: MobileBetPreset) => {
    if (!bounds || locked) return;
    setAmount(mobileBetPresetTarget(game, preset));
    setError("");
  };

  return (
    <section className="mobile-action-sheet" aria-label="行动选择">
      <div className="mobile-sheet-handle" aria-hidden="true" />
      {bounds ? (
        <>
          <div className="mobile-amount-heading">
            <small>{game.legal.canCall ? "加注到" : "下注到"}</small>
            <strong
              className={allIn ? "mobile-selected-amount all-in" : "mobile-selected-amount"}
              data-testid="mobile-selected-amount"
            >
              {allIn ? "ALL IN" : amount}
            </strong>
            {allIn ? <span>{maximum}</span> : null}
          </div>
          <div className="mobile-sizing-controls">
            <div className="mobile-presets mobile-presets-left">
              {presets.slice(0, 2).map((preset) => (
                <button
                  key={preset.id}
                  disabled={locked}
                  onClick={() => choosePreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <VerticalBetSlider
              min={minimum}
              max={maximum}
              value={amount}
              disabled={locked}
              onChange={(value) => {
                setAmount(clampMobileBet(value, bounds));
                setError("");
              }}
            />
            <div className="mobile-presets mobile-presets-right">
              {presets.slice(2).map((preset) => (
                <button
                  key={preset.id}
                  disabled={locked}
                  onClick={() => choosePreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : game.legal.canCall ? (
        <p className="mobile-raise-closed">短全下未重新开放加注</p>
      ) : null}

      <div
        className={`mobile-direct-actions${bounds ? " has-raise" : ""}`}
        data-testid="mobile-direct-actions"
      >
        {game.legal.canFold ? (
          <button
            className="mobile-fold"
            disabled={locked}
            onClick={() => send({ type: "fold" })}
          >
            弃牌
          </button>
        ) : null}
        {game.legal.canCheck ? (
          <button disabled={locked} onClick={() => send({ type: "check" })}>
            过牌
          </button>
        ) : null}
        {game.legal.canCall ? (
          <button disabled={locked} onClick={() => send({ type: "call" })}>
            跟注 {game.legal.callAmount}
          </button>
        ) : null}
        {bounds ? (
          <button
            className="mobile-confirm-bet"
            disabled={locked}
            onClick={() => send(() => actionForTarget(game, amount))}
          >
            {game.legal.canCall ? "加注" : "下注"}
          </button>
        ) : null}
      </div>
      {receipt ? <p className="mobile-action-receipt">{receipt}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
  );
}
