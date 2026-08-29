import { positionLabel, streetName, type GameState } from "../game/game";
import type { PolicyAction } from "../policy/types";
import type { DeepHandReview } from "../review/types";

function actionLabel(action: PolicyAction) {
  if (action.type === "fold") return "弃牌";
  if (action.type === "check") return "过牌";
  if (action.type === "call") return "跟注";
  return `加注到 ${action.to}`;
}

function precisionLabel(review: DeepHandReview) {
  if (review.summary.precision === "exact") return "精确枚举";
  if (review.summary.precision === "enumerated") return "分块枚举";
  return "确定性模拟";
}

export function DeepHandReviewView({
  game,
  review,
  onRecalculate,
  onNextHand,
}: {
  game: GameState;
  review: DeepHandReview;
  onRecalculate(): void;
  onNextHand(): void;
}) {
  const playerNameById = new Map(game.players.map((player) => [player.playerId, player.name]));
  return (
    <section className="deep-hand-review">
      <div className="deep-review-summary">
        <p className="eyebrow">整手统一复盘 · {precisionLabel(review)}</p>
        <h2>整手结论</h2>
        <strong>{review.summary.grade}</strong>
        <span>累计 EV 损失 {(review.summary.totalNormalizedEvLoss * 100).toFixed(1)}%</span>
        <p>做得最好：{review.summary.strongestPoint}</p>
        <p>优先纠正：{review.summary.priorityCorrection}</p>
        <small>置信度 {(review.summary.confidence * 100).toFixed(0)}% · {review.calculatorVersion}</small>
      </div>

      <section>
        <h3>行动时间线</h3>
        <div className="timeline">
          {game.log.length ? game.log.map((entry, index) => (
            <p className="line" key={`${entry.street}-${index}`}>
              <b>{streetName(entry.street)}</b> · {entry.actor} {entry.action}
              {entry.amount ? ` ${entry.amount}` : ""}
              <small>底池 {entry.potAfter}</small>
            </p>
          )) : <p>本手没有额外行动记录。</p>}
        </div>
      </section>

      {review.decisions.map((decision, index) => (
        <article className="deep-decision-card" key={decision.id}>
          <div className="deep-decision-heading">
            <div>
              <small>决策 {index + 1} · {streetName(decision.street)} · {positionLabel(decision.position).name}</small>
              <h3>{actionLabel(decision.actual)} → 推荐 {actionLabel(decision.recommended)}</h3>
            </div>
            <strong>EV 损失 {(decision.normalizedEvLoss * 100).toFixed(1)}%</strong>
          </div>

          <section>
            <h3>范围变化</h3>
            {Object.entries(decision.ranges).map(([playerId, range]) => (
              <p key={playerId}><b>{playerNameById.get(playerId) ?? playerId}</b> · 有效组合 {range.comboCount.toFixed(1)} · {range.change}</p>
            ))}
          </section>

          <section>
            <h3>候选 EV</h3>
            <div className="deep-ev-grid">
              {decision.candidates.map((candidate, candidateIndex) => (
                <span key={`${candidate.action.type}-${candidateIndex}`}>
                  {actionLabel(candidate.action)}
                  <b>{candidate.ev >= 0 ? "+" : ""}{candidate.ev.toFixed(2)}</b>
                  <small>{Math.round(candidate.frequency * 100)}% · {candidate.intent}</small>
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3>赔率与补牌</h3>
            <p>权益 {(decision.equity * 100).toFixed(1)}% · 所需胜率 {(decision.requiredEquity * 100).toFixed(1)}% · SPR {decision.spr.toFixed(1)}</p>
            <p>干净补牌 {decision.cleanOuts} · 脏补牌 {decision.dirtyOuts} · 身后玩家 {decision.playersBehind}</p>
            <small>{decision.precision === "exact" ? "精确枚举" : "确定性模拟"} · 样本 {decision.samples} · 覆盖率 {(decision.coverage * 100).toFixed(0)}%</small>
          </section>

          <section>
            <h3>核心规则</h3>
            {decision.correctThinking.map((line) => <p className="review-correct" key={line}>✓ {line}</p>)}
            {decision.corrections.map((line) => <p className="review-correction" key={line}>△ {line}</p>)}
            <p>{decision.coreRule}</p>
          </section>
        </article>
      ))}

      <div className="deep-review-actions">
        <button type="button" className="secondary" onClick={onRecalculate}>使用当前版本重新精算</button>
        <button type="button" className="primary" onClick={onNextHand}>开始下一手 →</button>
      </div>
    </section>
  );
}
