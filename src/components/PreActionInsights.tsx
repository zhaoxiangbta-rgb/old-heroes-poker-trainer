import { useState } from "react";
import type { GameState } from "../game/game";
import type { OpponentActionResponse, PreActionInsightState } from "../insights/types";

function percent(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

function responseLabel(response: OpponentActionResponse) {
  return response.heroAction.type === "raise" ? `你下注到 ${response.heroAction.to}` : response.heroAction.type;
}

export function PreActionInsights({ state, game }: { state: PreActionInsightState; game: GameState }) {
  const [expanded, setExpanded] = useState(false);
  const exact = state.exact;
  const ranges = state.ranges ?? [];
  const relevantClasses = exact?.handClasses
    .filter((item) => item.nextCard >= 0.005 || item.byRiver >= 0.005)
    .sort((first, second) => second.byRiver - first.byRiver)
    .slice(0, 5) ?? [];
  const dirtyOuts = exact?.outs.filter((out) => out.classification === "dirty") ?? [];

  return (
    <section className="pre-action-insights" aria-label="下注前分析">
      {game.board.length >= 3 ? (
        <>
          <div className="pre-action-insights__heading">
            <h3>成牌路径（精确）</h3>
            {state.status === "calculating-exact" ? <span>正在枚举…</span> : exact ? <span>{Math.round(exact.elapsedMs)} ms</span> : null}
          </div>
          {exact ? (
            <>
              <div className="pre-action-insights__paths">
                {relevantClasses.map((item) => (
                  <article key={item.category}>
                    <b>{item.name}</b>
                    <span>下张 {percent(item.nextCard, 1)}</span>
                    <strong>到河牌 {percent(item.byRiver, 1)}</strong>
                  </article>
                ))}
              </div>
              <div className="pre-action-insights__facts">
                <span>独占坚果 {percent(exact.absoluteNuts, 1)}</span>
                <span>平分坚果 {percent(exact.tiedNuts, 1)}</span>
                <span>接近坚果 {percent(exact.nearNuts, 1)}</span>
                <span className={dirtyOuts.length ? "risk" : ""}>脏补牌 {dirtyOuts.length} 张
                </span>
              </div>
              {dirtyOuts.length ? (
                <p className="pre-action-insights__warning">
                  {dirtyOuts.slice(0, 5).map((out) => out.card).join("、")} 会改善牌型，但仍可能被更高成牌反超。
                </p>
              ) : null}
            </>
          ) : state.status === "failed" ? <p>精确成牌路径暂不可用。</p> : null}
        </>
      ) : null}

      <div className="pre-action-insights__heading">
        <h3>对手范围与反应（估计）</h3>
        {state.confidence !== undefined ? <span>置信 {percent(state.confidence)}</span> : null}
      </div>
      {state.status === "calculating-exact" || state.status === "calculating-ranges" ? (
        <p className="pre-action-insights__loading">正在估计对手范围…</p>
      ) : state.status === "failed" || state.status === "partial" ? (
        <p className="pre-action-insights__warning">范围估计暂不可用，不影响你继续行动。</p>
      ) : null}
      {ranges.length ? (
        <>
          <button className="pre-action-insights__toggle" type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "收起对手范围" : "查看对手范围"}
          </button>
          {expanded ? (
            <div className="pre-action-insights__opponents">
              {ranges.map((range) => {
                const player = game.players.find((candidate) => candidate.seat === range.seat);
                const responses = state.responses?.filter((response) => response.seat === range.seat) ?? [];
                return (
                  <article key={range.seat}>
                    <header><b>{player?.name ?? range.playerId}</b><span>范围估计 · {range.comboCount} 组合</span></header>
                    <div className="pre-action-insights__buckets">
                      <span>强价值 {percent(range.buckets.strongValue)}</span>
                      <span>成牌 {percent(range.buckets.madeHand)}</span>
                      <span>强听牌 {percent(range.buckets.strongDraw)}</span>
                      <span>空气 {percent(range.buckets.air)}</span>
                    </div>
                    {range.changes.length ? <small>{range.changes.join(" → ")}</small> : <small>仅按位置与牌局风格建模</small>}
                    {responses.slice(0, 4).map((response) => (
                      <p key={responseLabel(response)}>
                        {responseLabel(response)}：弃牌 {percent(response.fold)} · 跟注 {percent(response.call)} · 加注 {percent(response.raise)}
                      </p>
                    ))}
                  </article>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
