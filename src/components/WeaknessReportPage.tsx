import type { GameState } from "../game/game";
import type { WeaknessSummary } from "../training/curriculum";
import type { WeaknessTag } from "../training/types";

const TREND = { improving: "正在改善", stable: "暂无变化", worsening: "需要关注" } as const;

export function WeaknessReportPage({ summaries, hands, onTrain, onOpenHand }: {
  summaries: WeaknessSummary[];
  hands: GameState[];
  onTrain: (tag: WeaknessTag) => void;
  onOpenHand: (hand: GameState) => void;
}) {
  const formal = summaries.filter((item) => item.status === "weakness");
  const collecting = summaries.filter((item) => item.status === "collecting");
  return (
    <div className="placeholder weakness-page">
      <p className="eyebrow">只看决策 · 不看单手输赢</p>
      <h1>弱点报告</h1>
      {!formal.length ? (
        <div className="panel report-empty">
          <b>{collecting.length ? "样本积累中" : "还没有可分析的决策"}</b>
          <p>每类至少 5 个相关决策后才会形成正式结论。</p>
        </div>
      ) : (
        <div className="weakness-list">
          {formal.slice(0, 3).map((summary, index) => {
            const hand = hands.find((item) => `${item.seed}:${item.handNo}` === summary.representativeHandKeys[0]);
            return (
              <article className="weakness-row" key={summary.tag}>
                <strong className="weakness-rank">{index + 1}</strong>
                <div><small>{TREND[summary.trend]}</small><h2>{summary.name}</h2><p>{summary.samples} 个样本 · 错误率 {Math.round(summary.errorRate * 100)}% · 可信度 {Math.round(summary.confidence * 100)}%</p></div>
                <div className="report-actions">
                  {hand ? <button onClick={() => onOpenHand(hand)}>查看典型牌局</button> : null}
                  <button aria-label={`训练${summary.name}`} onClick={() => onTrain(summary.tag)}>开始专项</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
