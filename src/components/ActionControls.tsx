import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { positionLabel, type GameAction, type GameState } from "../game/game";
import { mobileBetChoices, mobilePrimaryAction } from "../mobile/mobilePrimaryAction";
import { mobileBetPresetTarget, type MobileBetPreset } from "../mobile/mobileBetSizing";
import {
  betRailNodeFraction,
  choiceIndexAtRailFraction,
  mobileBetRailNodes,
  railFractionForChoiceIndex,
  snapBetRailIndex,
} from "../mobile/mobileBetRail";
import { PlayingCard } from "./PlayingCard";
import { POKER_CONTROL_ASSETS } from "../ui/pokerVisualAssets";

function chipStyle(image: string) {
  return { "--control-chip-image": `url(${image})` } as CSSProperties;
}

type Props = { game: GameState; busy: boolean; receipt: string; onAction: (action: GameAction) => void };

const PRESETS: { id: MobileBetPreset; label: string }[] = [
  { id: "half-pot", label: "半池" },
  { id: "two-thirds-pot", label: "2/3池" },
  { id: "pot", label: "底池" },
];

export function ActionControls({ game, busy, receipt, onAction }: Props) {
  const hero = game.players[game.heroSeat];
  const defaultAmount = game.legal.canCall ? hero.streetBet + game.legal.callAmount : game.legal.minRaiseTo;
  const choices = useMemo(() => mobileBetChoices(game), [game]);
  const nodes = useMemo(() => mobileBetRailNodes(game, choices), [game, choices]);
  const [amount, setAmount] = useState(defaultAmount);
  const [error, setError] = useState("");
  const [confirmFold, setConfirmFold] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<MobileBetPreset | null>(null);

  useEffect(() => {
    setAmount(defaultAmount);
    setError("");
    setConfirmFold(false);
    setSelectedPreset(null);
  }, [game.seed, game.street, game.toAct, defaultAmount]);

  let primary: ReturnType<typeof mobilePrimaryAction> | null = null;
  try {
    primary = mobilePrimaryAction(game, amount);
  } catch {
    primary = null;
  }

  const submitAmount = () => {
    try {
      onAction(mobilePrimaryAction(game, amount).action);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请输入合法金额");
    }
  };
  const selectPreset = (preset: MobileBetPreset) => {
    try {
      setAmount(mobileBetPresetTarget(game, preset));
      setSelectedPreset(preset);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "当前不能加注");
    }
  };
  const fold = () => {
    if (!confirmFold) {
      setConfirmFold(true);
      return;
    }
    onAction({ type: "fold" });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (busy) return;
    if (event.key === "Enter") {
      event.preventDefault();
      submitAmount();
    }
    if (event.key === " " && game.legal.canCheck && event.target instanceof HTMLElement && event.target.tagName !== "INPUT") {
      event.preventDefault();
      onAction({ type: "check" });
    }
    if (event.key === "Escape" && game.legal.canFold) {
      event.preventDefault();
      fold();
    }
  };
  const choiceIndex = Math.max(0, choices.reduce((best, choice, index) =>
    Math.abs(choice - amount) < Math.abs((choices[best] ?? amount) - amount) ? index : best, 0));
  const railResolution = Math.max(1000, Math.max(0, choices.length - 1) * 4);
  const railPosition = Math.round(railFractionForChoiceIndex(choiceIndex, nodes) * railResolution);
  const setRailPosition = (position: number, snap = false) => {
    if (!choices.length) return;
    const mappedIndex = choiceIndexAtRailFraction(position / railResolution, nodes);
    const nextIndex = snap ? snapBetRailIndex(mappedIndex, nodes) : mappedIndex;
    setAmount(choices[nextIndex]);
    setSelectedPreset(null);
    setError("");
  };

  return <div className="action-area desktop-action-dock" data-testid="desktop-action-dock" onKeyDown={onKeyDown}>
    <div className="legal-summary">
      跟注需到 <b>{hero.streetBet + game.legal.callAmount}</b><span>｜</span>
      {game.legal.canRaise ? <>最小加注到 <b>{game.legal.minRaiseTo}</b><span>｜</span>最多 <b>{game.legal.maxRaiseTo}</b></> : <b>短全下未重新开放加注</b>}
    </div>

    <div className="desktop-amount-rail">
      <div className="desktop-rail-track">
        <input aria-label="拖动下注金额" type="range" min={0} max={railResolution} value={railPosition} disabled={busy || choices.length < 2} onChange={(event) => setRailPosition(Number(event.target.value))} onPointerUp={(event) => setRailPosition(Number(event.currentTarget.value), true)} onKeyUp={(event) => setRailPosition(Number(event.currentTarget.value), true)} />
        <div className="desktop-rail-nodes" aria-hidden="true">
          {nodes.map((node, index) => <span key={node.id} className={node.id === "all-in" ? "all-in-node" : ""} style={{ "--node-left": `${betRailNodeFraction(index) * 100}%` } as CSSProperties}>{node.label}</span>)}
        </div>
      </div>
    </div>

    <div className="desktop-action-zones desktop-action-lower">
      <div className="desktop-size-zone" data-testid="desktop-size-zone">
        <div className="desktop-size-buttons">
          {PRESETS.map((preset) => <button key={preset.id} className={`sizing-plaque${selectedPreset === preset.id ? " selected" : ""}`} style={{ "--sizing-plaque-image": `url(${POKER_CONTROL_ASSETS.sizingPlaque})` } as CSSProperties} disabled={busy || !game.legal.canRaise} onClick={() => selectPreset(preset.id)}>{preset.label}</button>)}
        </div>
        <div className="desktop-left-meta" data-testid="desktop-left-meta">
          <small>余码 {hero.stack} · {positionLabel(hero.position).name}</small>
        </div>
      </div>
      <div className="desktop-hand-zone" aria-label="你的手牌">
        {hero.hole.map((card) => <PlayingCard key={card} card={card} />)}
      </div>
      <div className="desktop-action-zone" data-testid="desktop-action-zone">
        <button style={chipStyle(POKER_CONTROL_ASSETS.fold)} aria-label={confirmFold ? "确认弃牌" : "弃牌"} className={`desktop-action-chip fold-action${confirmFold ? " confirming" : ""}`} disabled={busy || !game.legal.canFold} onClick={fold}>弃牌</button>
        <button style={chipStyle(POKER_CONTROL_ASSETS.check)} className="desktop-action-chip check-action" disabled={busy || !game.legal.canCheck} onClick={() => onAction({ type: "check" })}>过牌</button>
        <button style={chipStyle(primary?.mode === "all-in" ? POKER_CONTROL_ASSETS.allIn : POKER_CONTROL_ASSETS.primary)} aria-label="确认金额" title={primary?.label} className={`desktop-action-chip primary-action ${primary?.mode === "all-in" ? "all-in-action" : ""}`} disabled={busy || !primary} onClick={submitAmount}>{primary?.label ?? "跟注 / 加注"}</button>
      </div>
    </div>

    <p className={receipt ? "submit-receipt visible" : "submit-receipt"} data-testid="submit-receipt" aria-live="polite">{receipt || "等待操作"}</p>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
