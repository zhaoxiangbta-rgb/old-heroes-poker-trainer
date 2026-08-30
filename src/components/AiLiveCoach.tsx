import type { AiLiveCoachState } from "../ai/useAiLiveCoach";

export function AiLiveCoach({ state }: { state: AiLiveCoachState }) {
  if (state.status === "idle") return null;
  if (state.status === "loading") return <section className="ai-live-coach is-loading" role="status"><b>AI 正在解读这个决策…</b><span>不影响你立即行动</span></section>;
  if (state.status !== "ready") return <section className="ai-live-coach is-fallback"><b>已使用本地分析</b><span>AI 本次未返回可验证结果</span></section>;
  const { explanation } = state;
  return <section className="ai-live-coach" aria-label="AI 盘中解读">
    <header><div><span>AI 现场解读</span><b>{explanation.currentHand}</b></div><small>{state.model} · {state.elapsedMs} ms</small></header>
    <div className="ai-live-coach__prose">{explanation.reasoning.map((line) => <p key={line}>{line}</p>)}</div>
    {explanation.opponentRead.length ? <div><h3>对手范围</h3>{explanation.opponentRead.map((line) => <p key={line}>{line}</p>)}</div> : null}
    {explanation.risks.length ? <div className="ai-live-coach__risks"><h3>行动前留意</h3>{explanation.risks.map((line) => <p key={line}>{line}</p>)}</div> : null}
    <strong className="ai-live-coach__recommendation">{explanation.recommendationRestatement}</strong>
  </section>;
}
