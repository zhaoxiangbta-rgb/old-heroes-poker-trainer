import type { WeaknessSummary } from "../training/curriculum";
import { WEAKNESS_DEFINITIONS, type WeaknessTag } from "../training/types";

export function SpecialTrainingPage({
  summaries,
  onStart,
}: {
  summaries: WeaknessSummary[];
  onStart: (tag: WeaknessTag) => void;
}) {
  const byTag = new Map(summaries.map((summary) => [summary.tag, summary]));
  return (
    <div className="placeholder training-page">
      <p className="eyebrow">完整手牌 · 统一复盘</p>
      <h1>专项训练</h1>
      <p className="page-lead">目标场景会更常出现，行动时不给答案，打完整手再看规则评分。</p>
      <div className="training-grid">
        {(Object.keys(WEAKNESS_DEFINITIONS) as WeaknessTag[]).map((tag) => {
          const definition = WEAKNESS_DEFINITIONS[tag];
          const summary = byTag.get(tag);
          return (
            <article className="training-card" key={tag}>
              <span className="card-notch" aria-hidden="true">♠</span>
              <div>
                <small>{summary?.status === "weakness" ? "当前弱点" : "技术专项"}</small>
                <h2>{definition.name}</h2>
                <p>{definition.description}</p>
              </div>
              <div className="training-meta">
                <span>{summary?.samples ?? 0} 个相关决策</span>
                <span>{summary?.samples ? `近期正确 ${Math.round(summary.recentAccuracy * 100)}%` : "尚无样本"}</span>
              </div>
              <button aria-label={`开始${definition.name}专项`} onClick={() => onStart(tag)}>
                开始完整手 →
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
