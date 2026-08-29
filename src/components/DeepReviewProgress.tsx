import type {
  DeepReviewProgress as ReviewProgress,
  DeepReviewStatus,
} from "../review/types";

const STAGE_LABEL: Record<ReviewProgress["stage"], string> = {
  "action-line": "整理完整行动线",
  ranges: "重建逐街范围",
  "equity-ev": "计算候选动作权益与 EV",
  teaching: "生成教学点评",
  saving: "保存复盘结果",
};

export function DeepReviewProgress({
  status,
  progress,
  error,
  onCancel,
  onRetry,
  onNextHand,
}: {
  status: DeepReviewStatus;
  progress?: ReviewProgress;
  error: string;
  onCancel(): void;
  onRetry(): void;
  onNextHand(): void;
}) {
  if (status === "calculating") {
    const percent = progress
      ? Math.round(progress.completed / Math.max(1, progress.total) * 100)
      : 0;
    return (
      <section className="deep-review-progress" aria-live="polite">
        <p className="eyebrow">整手结束 · 本地离线计算</p>
        <h2>正在精算</h2>
        <strong>{progress ? STAGE_LABEL[progress.stage] : "准备精算任务"}</strong>
        <div className="deep-review-progress-track" aria-label="精算进度" aria-valuenow={percent} role="progressbar">
          <i style={{ width: `${percent}%` }} />
        </div>
        <small>{progress ? `${progress.completed} / ${progress.total} · ${percent}%` : "0%"}</small>
        <p>计算在本机后台运行，牌局结果不会改变。</p>
        <button type="button" className="secondary" onClick={onCancel}>取消精算</button>
      </section>
    );
  }
  if (status === "cancelled" || status === "failed" || status === "not-started") {
    return (
      <section className="deep-review-progress stopped">
        <p className="eyebrow">整手复盘未完成</p>
        <h2>{status === "failed" ? "精算未能完成" : status === "cancelled" ? "精算已取消" : "尚未精算"}</h2>
        {error ? <p role="alert">{error}</p> : <p>本手行动与结算已保存，可立即重算或继续下一手。</p>}
        <div className="deep-review-actions">
          <button type="button" className="primary" onClick={onRetry}>重新精算</button>
          <button type="button" className="secondary" onClick={onNextHand}>开始下一手 →</button>
        </div>
      </section>
    );
  }
  return null;
}
