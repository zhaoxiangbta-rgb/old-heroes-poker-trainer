import type { GameState } from "../game/game";
import type { PolicyAction } from "../policy/types";
import { WEAKNESS_DEFINITIONS } from "../training/types";

function actionText(action: PolicyAction) {
  if (action.type === "fold") return "弃牌";
  if (action.type === "check") return "过牌";
  if (action.type === "call") return "跟注";
  return `加注到 ${action.to}`;
}

export function DecisionReview({ game }: { game: GameState }) {
  if (game.assessmentStatus === "failed")
    return <div className="decision-review failed">本手评分未生成</div>;
  if (!game.assessments.length)
    return <div className="decision-review empty">本手没有英雄决策点。</div>;
  return (
    <div className="decision-review">
      <h3>决策评分</h3>
      {game.assessments.map((assessment) => (
        <article key={assessment.id} className={`assessment ${assessment.severity}`}>
          <div>
            <b>实际：{actionText(assessment.actual)}</b>
            <span>推荐：{actionText(assessment.recommended)}</span>
            <strong className="assessment-severity">
              {!assessment.scored
                ? "仅供参考"
                : assessment.severity === "good"
                  ? "良好"
                  : assessment.severity === "review"
                    ? "需复盘"
                    : "重点纠正"}
            </strong>
          </div>
          <small>
            {assessment.scored
              ? `EV 损失 ${(assessment.normalizedEvLoss * 100).toFixed(1)}% · ${assessment.intent}`
              : `本次不计分 · ${assessment.intent}`}
          </small>
          {assessment.candidates.length > 0 && (
            <div className="assessment-candidates" aria-label="候选策略">
              {assessment.candidates.map((candidate, index) => (
                <span key={`${actionText(candidate.action)}-${index}`}>
                  {actionText(candidate.action)} ·{candidate.ev.toFixed(2)} · {Math.round(candidate.probability * 100)}%
                </span>
              ))}
            </div>
          )}
          {assessment.tags.length > 0 && (
            <div className="assessment-tags">
              {assessment.tags.map((tag) => <span key={tag}>{WEAKNESS_DEFINITIONS[tag].name}</span>)}
            </div>
          )}
          {assessment.coreRules.map((rule) => <p key={rule}>{rule}</p>)}
        </article>
      ))}
    </div>
  );
}
