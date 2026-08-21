import { useEffect, useState, type KeyboardEvent } from "react";
import { actionForTarget, type GameAction, type GameState } from "../game/game";

type Props = { game: GameState; busy: boolean; receipt: string; onAction: (action: GameAction) => void };

export function ActionControls({ game, busy, receipt, onAction }: Props) {
  const hero = game.players[game.heroSeat];
  const defaultAmount = game.legal.canCall ? hero.streetBet + game.legal.callAmount : game.legal.minRaiseTo;
  const [amount, setAmount] = useState(defaultAmount);
  const [error, setError] = useState("");
  const [confirmFold, setConfirmFold] = useState(false);
  const callAllIn = game.legal.canCall && game.legal.callAmount === hero.stack;
  const canAllIn = game.legal.canRaise || callAllIn;
  useEffect(() => { setAmount(defaultAmount); setError(""); setConfirmFold(false); }, [game.seed, game.street, game.toAct, defaultAmount]);

  const submitAmount = () => {
    try { onAction(actionForTarget(game, amount)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "请输入合法金额"); }
  };
  const preset = (ratio: number) => {
    if (!game.legal.canRaise) return;
    const target = Math.round(hero.streetBet + game.legal.callAmount + game.pot * ratio);
    setAmount(Math.max(defaultAmount, Math.min(game.legal.maxRaiseTo, target)));
    setError("");
  };
  const fold = () => {
    if (!confirmFold) { setConfirmFold(true); return; }
    onAction({ type: "fold" });
  };
  const allIn = () => {
    if (game.legal.canRaise)
      onAction(actionForTarget(game, game.legal.maxRaiseTo));
    else if (callAllIn) onAction({ type: "call" });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (busy) return;
    if (event.key === "Enter") { event.preventDefault(); submitAmount(); }
    if (event.key === " " && game.legal.canCheck && event.target instanceof HTMLElement && event.target.tagName !== "INPUT") { event.preventDefault(); onAction({ type: "check" }); }
    if (event.key === "Escape" && game.legal.canFold) { event.preventDefault(); fold(); }
  };

  return <div className="action-area" onKeyDown={onKeyDown}>
    <div className="legal-summary">跟注需到 <b>{hero.streetBet + game.legal.callAmount}</b><span>｜</span>{game.legal.canRaise ? <>最小加注到 <b>{game.legal.minRaiseTo}</b><span>｜</span>最多 <b>{game.legal.maxRaiseTo}</b></> : <b>短全下未重新开放加注</b>}</div>
    <div className="actions">
      <div className="amount-actions" data-testid="amount-actions">
        <label htmlFor="bet-amount">本街投入到</label>
        <input id="bet-amount" disabled={busy} value={amount} onChange={(event) => setAmount(Number(event.target.value))} type="number" min={defaultAmount} max={game.legal.canRaise ? game.legal.maxRaiseTo : defaultAmount} />
        <div className="size-presets" data-testid="size-presets"><button disabled={busy || !game.legal.canRaise} onClick={() => preset(.5)}>½池</button><button disabled={busy || !game.legal.canRaise} onClick={() => preset(2 / 3)}>⅔池</button><button disabled={busy || !game.legal.canRaise} onClick={() => preset(1)}>底池</button><button className="all-in-action" aria-label="ALL IN" title={canAllIn ? "直接提交全部剩余筹码" : "当前加注权未开放，且跟注不会全下"} disabled={busy || !canAllIn} onClick={allIn}>ALL IN</button></div>
        <button className="primary confirm-amount" disabled={busy} onClick={submitAmount}>确认金额</button>
      </div>
      <div className="basic-actions" data-testid="basic-actions">
        <button disabled={busy || !game.legal.canCheck} onClick={() => onAction({ type: "check" })}>过牌</button>
        <button aria-label={confirmFold ? "确认弃牌" : "弃牌"} className={`fold-action${confirmFold ? " confirming" : ""}`} disabled={busy || !game.legal.canFold} onClick={fold}>弃牌</button>
      </div>
    </div>
    <p className={receipt ? "submit-receipt visible" : "submit-receipt"} data-testid="submit-receipt" aria-live="polite">{receipt || "等待操作"}</p>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
