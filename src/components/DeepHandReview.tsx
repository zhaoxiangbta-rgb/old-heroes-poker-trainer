import { streetName, type GameState } from "../game/game";
import type { DeepDecisionReview, DeepHandReview } from "../review/types";
import { PlayingCard } from "./PlayingCard";

function precisionLabel(review: DeepHandReview) {
  if (review.summary.precision === "exact") return "精确枚举";
  if (review.summary.precision === "enumerated") return "分块枚举";
  return "确定性模拟";
}

function percent(value: number, digits = 0) { return `${(value * 100).toFixed(digits)}%`; }

function TechnicalDetails({ decision, playerNameById }: { decision: DeepDecisionReview; playerNameById: Map<string, string> }) {
  return <details className="coach-technical"><summary>查看专业计算依据</summary><div>
    <h4>范围组合</h4>{Object.entries(decision.ranges).map(([id, range]) => <p key={id}><b>{playerNameById.get(id) ?? id}</b> · 有效组合 {range.comboCount.toFixed(1)} · {range.change}</p>)}<small>有效组合表示加权后的范围宽度，不等于对手真实持有某一手牌。</small>
    <h4>赔率与筹码深度</h4><p>权益 {(decision.equity * 100).toFixed(1)}% · 所需胜率 {(decision.requiredEquity * 100).toFixed(1)}% · SPR {decision.spr.toFixed(1)}</p><small>所需胜率是跟注至少需要的胜率；SPR 表示有效筹码相对底池有多深。</small><p>干净补牌 {decision.cleanOuts} · 脏补牌 {decision.dirtyOuts} · 身后玩家 {decision.playersBehind}</p>
    <h4>计算精度</h4><p>{decision.precision === "exact" ? "精确枚举" : "确定性模拟"} · 样本 {decision.samples} · 覆盖率 {(decision.coverage * 100).toFixed(0)}%</p><small>样本和覆盖率只描述计算方法，不代表建议一定正确。</small>
  </div></details>;
}

function WholeHandCoachView({ game, review }: { game: GameState; review: Extract<DeepHandReview, { version: 3 }> }) {
  const whole = review.wholeHand!;
  const playerNameById = new Map(game.players.map((player) => [player.playerId, player.name]));
  return <>
    <section className="whole-hand-streets"><h3>逐街点评</h3><div>{whole.streets.map((street) => <article key={street.street}>
      <header><b>{streetName(street.street)}</b>{street.board.length ? <span className="whole-hand-board">{street.board.map((card) => <PlayingCard card={card} className="review-mini-card" key={card} />)}</span> : null}</header>
      <p className="whole-hand-line">{street.actionLine.length ? `行动：${street.actionLine.join(" → ")}` : "本街没有额外行动记录"}</p>
      <p>{street.comment}</p><small>你的动作：{street.actual} · 更优线：{street.recommended}</small>
    </article>)}</div></section>
    <section className="whole-hand-focus"><h3>关键转折</h3><p>{whole.turningPoint}</p></section>
    <section className="whole-hand-ranges"><h3>最终范围</h3>{whole.finalRanges.length ? whole.finalRanges.map((range) => <article key={range.playerId}>
      <header><b>{playerNameById.get(range.playerId) ?? range.playerId}</b><small>估计可信度 {percent(range.confidence)}</small></header>
      <p>最近行动：{range.latestAction}</p><div>{range.buckets.map((bucket) => <span key={bucket.label}>{bucket.label} {percent(bucket.probability)}</span>)}</div>
    </article>) : <p>本手结束前没有可靠的存活对手范围。</p>}</section>
    <section className="whole-hand-choice"><h3>最佳选择</h3><p>{whole.bestChoice}</p></section>
    <section className="whole-hand-next"><h3>下次先看</h3><p>{whole.nextRule}</p></section>
    <section className="whole-hand-technical"><h3>专业计算依据</h3><p>以下数据用于核对，不再重复生成结论。</p>{review.decisions.map((decision, index) => <div key={decision.id}><b>决策 {index + 1} · {streetName(decision.street)}</b><TechnicalDetails decision={decision} playerNameById={playerNameById} /></div>)}</section>
  </>;
}

export function DeepHandReviewView({ game, review, onRecalculate, onNextHand }: { game: GameState; review: DeepHandReview; onRecalculate(): void; onNextHand(): void }) {
  if (review.version !== 3 || !review.wholeHand) {
    return <section className="deep-hand-review deep-hand-review--legacy">
      <div className="deep-review-summary">
        <p className="eyebrow">旧版复盘结果</p>
        <h2>请用 V4 重新精算</h2>
        <p>这份结果没有 V4 的整手串联点评，继续展示会出现重复、冗长和位置误判。旧数据仍保留，但不再冒充当前策略结论。</p>
        <small>已保存版本：{review.strategyVersion} · {review.calculatorVersion}</small>
      </div>
      <div className="deep-review-actions"><button type="button" className="secondary" onClick={onRecalculate}>使用 V4 重新精算</button><button type="button" className="primary" onClick={onNextHand}>开始下一手 →</button></div>
    </section>;
  }
  const wholeHand = review.wholeHand;
  return <section className="deep-hand-review">
    <div className="deep-review-summary"><p className="eyebrow">V4 整手复盘 · {precisionLabel(review)}</p><h2>整手结论</h2><strong>{review.summary.grade}</strong><span>累计 EV 损失 {(review.summary.totalNormalizedEvLoss * 100).toFixed(1)}%</span><p>{wholeHand.conclusion}</p><small>置信度 {(review.summary.confidence * 100).toFixed(0)}% · {review.strategyVersion} · {review.calculatorVersion}</small></div>
    <WholeHandCoachView game={game} review={review} />
    <div className="deep-review-actions"><button type="button" className="secondary" onClick={onRecalculate}>使用 V4 重新精算</button><button type="button" className="primary" onClick={onNextHand}>开始下一手 →</button></div>
  </section>;
}
