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
  if (state.liveCoach) {
    const coach = state.liveCoach;
    return (
      <section className="pre-action-insights pre-action-coach" aria-label="下注前分析">
        <header className="pre-action-coach__header">
          <div><span>现场判断</span><b>{coach.strategy.label} 策略</b></div>
          <span className={coach.strategy.degraded ? "is-degraded" : "is-ready"}>
            {coach.strategy.degraded ? "已降级" : "完整模式"}
          </span>
        </header>
        {coach.strategy.degraded ? <p className="pre-action-coach__warning">完整策略未能加载：{coach.strategy.reason ?? "未知原因"}。本次建议不用于评分。</p> : null}

        <article className="pre-action-coach__hero">
          <div><small>你的牌</small><strong>当前：{coach.hero.currentHand}</strong></div>
          <div className="pre-action-coach__upgrades">
            <small>{game.street === "river" ? "最终牌型" : "真正升级路径"}</small>
            {coach.hero.upgrades.length ? coach.hero.upgrades.map((upgrade) => (
              <span key={upgrade.category}>
                <b>{upgrade.name} {percent(upgrade.byRiver)}</b>
                {game.street !== "turn" ? <i>下一张 {percent(upgrade.nextCard)}</i> : null}
              </span>
            )) : <em>{coach.hero.upgradeSummary}</em>}
          </div>
        </article>

        <div className="pre-action-coach__opponent-heading">
          <b>对手可能有什么</b>
          <span>按位置、已发生行动和玩家风格估计</span>
        </div>
        {coach.opponents.length ? <div className="pre-action-coach__opponents">
          {coach.opponents.map((opponent) => {
            const player = game.players.find((candidate) => candidate.seat === opponent.seat);
            return (
              <article className={opponent.primary ? "is-primary" : ""} key={opponent.seat}>
                <header>
                  <b>{player?.name ?? opponent.playerId}</b>
                  {opponent.primary ? <span>主要施压者</span> : <span>范围估计</span>}
                </header>
                <small>最近：{opponent.actionLine}</small>
                <div className="pre-action-coach__buckets">
                  {opponent.buckets.map((bucket) => (
                    <span key={bucket.key}>{bucket.label} <b>{percent(bucket.probability)}</b></span>
                  ))}
                </div>
                <footer>可信度 {percent(opponent.confidence)} · {opponent.comboCount} 个有效组合</footer>
              </article>
            );
          })}
        </div> : <p className="pre-action-coach__empty">暂无可估计的存活对手范围。</p>}
      </section>
    );
  }
  if (state.analysis) {
    return (
      <section className="pre-action-insights pre-action-insights--v2" aria-label="下注前分析">
        <header className="pre-action-coach__header">
          <div><span>现场判断</span><b>{state.analysis.audit.displayVersion ?? state.analysis.audit.strategyVersion} 策略</b></div>
          <span className={state.analysis.audit.degraded ? "is-degraded" : "is-ready"}>{state.analysis.audit.degraded ? "已降级" : "完整模式"}</span>
        </header>
        {state.analysis.sections.map((section) => (
          <article className={`pre-action-analysis-section pre-action-analysis-section--${section.kind}`} key={section.kind}>
            <h3>{section.title}</h3>
            <p>{section.text}</p>
          </article>
        ))}
      </section>
    );
  }
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
            <h3>后续牌型变化（精确）</h3>
            {state.status === "calculating-exact" ? <span>正在枚举…</span> : exact ? <span>{Math.round(exact.elapsedMs)} ms</span> : null}
          </div>
          {exact ? (
            <>
              <p className="pre-action-insights__current">
                <b>当前已成{exact.currentHand.name}</b>
                <span>到河牌至少保持{exact.currentHand.name} {percent(exact.atLeastCurrentByRiver, 1)}</span>
              </p>
              <div className="pre-action-insights__paths">
                {relevantClasses.map((item) => (
                  <article key={item.category}>
                    <b>{item.category === exact.currentHand.category
                      ? `仍为${item.name}`
                      : item.category > exact.currentHand.category
                        ? `升级为${item.name}`
                        : `变为${item.name}`}</b>
                    <span>下一张发出后 {percent(item.nextCard, 1)}</span>
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
