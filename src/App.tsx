import { useEffect, useMemo, useRef, useState } from "react";
import "./ledger.css";
import {
  streetName,
  bankrollsForNextHand,
  type GameAction,
  type GameState,
  type Player,
} from "./game/game";
import { newActionGame, nextActionHand } from "./game/actionDealing";
import { useGamePlayback } from "./game/useGamePlayback";
import { isNoActionPlayback } from "./game/playback";
import { PokerTable } from "./components/PokerTable";
import { MobilePokerTable } from "./mobile/MobilePokerTable";
import { ActionControls } from "./components/ActionControls";
import { MobileFloatingControls } from "./mobile/MobileFloatingControls";
import { MobileInsightSummary } from "./mobile/MobileInsightSummary";
import { HistoryPage } from "./components/HistoryPage";
import { SettingsPage } from "./components/SettingsPage";
import { SpecialTrainingPage } from "./components/SpecialTrainingPage";
import { WeaknessReportPage } from "./components/WeaknessReportPage";
import { DeepHandReviewView } from "./components/DeepHandReview";
import { DeepReviewProgress } from "./components/DeepReviewProgress";
import { ResizableWorkspace } from "./components/ResizableWorkspace";
import { createSoundPlayer, soundCueForPlayback } from "./game/sound";
import type { DecisionFacts } from "./engine/analysis";
import { useDeferredDecisionFacts } from "./game/useDeferredDecisionFacts";
import { usePreActionInsights } from "./insights/usePreActionInsights";
import { PreActionInsights } from "./components/PreActionInsights";
import { AiLiveCoach } from "./components/AiLiveCoach";
import { createRepository, type DesktopRepository } from "./data/repository";
import type { GameplaySettings, ModelSettings } from "./data/types";
import { normalizeGameplaySettings } from "./ui/tableThemes";
import { TABLE_PROFILES } from "./policy/tableProfiles";
import { summarizeWeaknesses } from "./training/curriculum";
import { newTargetedGame } from "./training/targetedScenario";
import { WEAKNESS_DEFINITIONS, type TrainingTarget, type WeaknessTag } from "./training/types";
import { APP_VERSION_LABEL, STRATEGY_ENGINE_LABEL, STRATEGY_ENGINE_VERSION } from "./appVersion";
import { useDeepReview } from "./review/useDeepReview";
import { assessmentFromDeepDecision } from "./training/assessment";
import type { DeepReviewStatus } from "./review/types";
import { useAiLiveCoach } from "./ai/useAiLiveCoach";
import { useAiHandReview } from "./ai/useAiHandReview";
import "./training.css";
import "./app-version.css";
import "./pre-action-insights.css";
const nav = ["继续训练", "专项训练", "弱点报告", "历史牌局", "设置"] as const;
type Page = (typeof nav)[number];
const SUIT_SYMBOL: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};
function renderShowdownCard(card: string, key: string) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const redSuit = suit === "h" || suit === "d";
  return (
    <span
      className={`card face-up ${redSuit ? "suit-red" : "suit-black"}`}
      data-card-kind="face-up"
      key={key}
    >
      {rank}
      <small className={`suit-symbol ${redSuit ? "suit-red" : "suit-black"}`}>
        {SUIT_SYMBOL[suit] ?? suit}
      </small>
    </span>
  );
}
function readSoundPreference() {
  try { return localStorage.getItem("poker-sound") !== "off"; }
  catch { return true; }
}
function saveSoundPreference(enabled: boolean) {
  try { localStorage.setItem("poker-sound", enabled ? "on" : "off"); }
  catch { /* Safari can block storage; retain the in-memory preference. */ }
}
export default function App({ repository: suppliedRepository, mobile = false }: { repository?: DesktopRepository; mobile?: boolean } = {}) {
  const [page, setPage] = useState<Page>("继续训练"),
    [initialGame] = useState(() => newActionGame(Date.now() >>> 0)),
    [soundEnabled, setSoundEnabled] = useState(readSoundPreference),
    [repository] = useState(() => suppliedRepository ?? createRepository()),
    [history, setHistory] = useState<GameState[]>([]),
    [historyLoading, setHistoryLoading] = useState(true),
    [modelSettings, setModelSettings] = useState<ModelSettings>({ baseUrl: "", model: "", enabled: false }),
    [gameplaySettings, setGameplaySettings] = useState<GameplaySettings>(() => normalizeGameplaySettings({})),
    [storageNotice, setStorageNotice] = useState(""),
    [reviewReadyKey, setReviewReadyKey] = useState(""),
    [reviewRuntimeKey, setReviewRuntimeKey] = useState("");
  const savedHands = useRef(new Set<string>());
  const autoReviewHands = useRef(new Set<string>());
  const sound = useRef(createSoundPlayer({ enabled: soundEnabled }));
  const { game, phase, frame, receipt, busy, visualTokens, recentActions, submit: playAction, replaceGame } =
    useGamePlayback(initialGame, { animateInitialDeal: !mobile });
  const showdownPlayback = phase === "showdown";
  const noActionPlayback = isNoActionPlayback(phase);
  const handComplete = game.phase === "review" && phase === "hand-complete";
  const facts = useDeferredDecisionFacts(game, phase === "hero-turn");
  const preActionInsights = usePreActionInsights(game, phase === "hero-turn");
  const aiLiveCoach = useAiLiveCoach({
    repository,
    settings: modelSettings,
    game,
    insight: preActionInsights.state,
    active: phase === "hero-turn",
  });
  const weaknessSummaries = useMemo(() => summarizeWeaknesses(history), [history]);
  const handKey = `${game.seed}:${game.handNo}`;
  const deepReviewInput = useMemo(() => ({
    handNo: game.handNo,
    seed: game.seed,
    strategyVersion: STRATEGY_ENGINE_VERSION,
    calculatorVersion: "deep-review-v4",
    decisions: game.reviewDecisionInputs,
  }), [game.handNo, game.reviewDecisionInputs, game.seed]);
  const {
    status: deepReviewRuntimeStatus,
    progress: deepReviewProgress,
    error: deepReviewRuntimeError,
    start: launchDeepReview,
    cancel: stopDeepReview,
  } = useDeepReview({
    input: deepReviewInput,
    onCompleted: (review) => {
      if (review.seed !== game.seed || review.handNo !== game.handNo) return;
      const reviewed = structuredClone(game);
      reviewed.deepReview = review;
      reviewed.deepReviewStatus = "completed";
      reviewed.deepReviewError = undefined;
      reviewed.assessments = review.decisions.map((decision) =>
        assessmentFromDeepDecision(reviewed.handNo, decision),
      );
      reviewed.assessmentStatus = "ready";
      replaceGame(reviewed);
      void repository
        .replaceHand(reviewed)
        .catch(() => repository.saveHand(reviewed))
        .then(() => repository.loadHands())
        .then((stored) => {
          setHistory(stored);
          setStorageNotice("");
        })
        .catch(() => setStorageNotice("精算结果未保存"));
    },
  });
  const visibleReviewStatus: DeepReviewStatus = game.deepReview
    ? "completed"
    : reviewRuntimeKey === handKey && deepReviewRuntimeStatus !== "not-started"
      ? deepReviewRuntimeStatus
      : game.deepReviewStatus;
  const aiHandReview = useAiHandReview({
    repository,
    settings: modelSettings,
    game,
    localReview: game.deepReview,
    onCompleted: (review) => {
      if (review.stateHash !== game.deepReview?.stateHash) return;
      const reviewed = structuredClone(game);
      reviewed.aiReview = review;
      reviewed.aiReviewStatus = "completed";
      reviewed.aiReviewError = undefined;
      replaceGame(reviewed);
      void repository.replaceHand(reviewed).catch(() => setStorageNotice("AI 复盘未保存"));
    },
  });
  useEffect(() => { sound.current.setEnabled(soundEnabled); saveSoundPreference(soundEnabled); }, [soundEnabled]);
  useEffect(() => () => sound.current.dispose(), []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [stored, gameplay, model] = await Promise.all([
          repository.loadHands(),
          repository.loadGameplaySettings(),
          repository.loadModelSettings(),
        ]);
        if (active) {
          setHistory(stored);
          setGameplaySettings(gameplay);
          setModelSettings(model);
          if (
            initialGame.tableProfileId !== gameplay.tableProfileId ||
            JSON.stringify(initialGame.playerProfiles) !==
              JSON.stringify(gameplay.playerProfiles)
          ) {
            replaceGame(
              newActionGame(initialGame.seed, initialGame.handNo, undefined, undefined, {
                tableProfileId: gameplay.tableProfileId,
                playerProfiles: gameplay.playerProfiles,
              }),
              { animateDeal: true },
            );
          }
        }
      } catch {
        if (active) setStorageNotice("读取历史牌局失败，当前训练仍可继续");
      } finally {
        if (active) setHistoryLoading(false);
      }
    })();
    return () => { active = false; };
  }, [initialGame, replaceGame, repository]);
  useEffect(() => {
    if (!frame) return;
    const cue = soundCueForPlayback(frame.effect, frame.actionKind);
    if (cue) sound.current.play(cue);
  }, [frame]);
  useEffect(() => {
    if (game.phase !== "review") return;
    const key = `${game.seed}:${game.handNo}`;
    if (savedHands.current.has(key)) return;
    savedHands.current.add(key);
    void repository
      .saveHand(game)
      .then(() => repository.loadHands())
      .then((stored) => {
        setHistory(stored);
        setStorageNotice("");
        setReviewReadyKey(key);
      })
      .catch(() => {
        setStorageNotice("本手未保存");
        setReviewReadyKey(key);
      });
  }, [game, repository]);
  useEffect(() => {
    if (!handComplete || reviewReadyKey !== handKey || game.deepReview) return;
    if (game.deepReviewStatus !== "not-started" || autoReviewHands.current.has(handKey)) return;
    autoReviewHands.current.add(handKey);
    setReviewRuntimeKey(handKey);
    launchDeepReview();
  }, [game.deepReview, game.deepReviewStatus, handComplete, handKey, launchDeepReview, reviewReadyKey]);
  const submit = (a: GameAction) => {
    sound.current.play("confirm");
    playAction(a, preActionInsights.state);
  };
  const refreshHistory = async () => {
    const stored = await repository.loadHands();
    setHistory(stored);
  };
  const startTrainingHand = (target: TrainingTarget) => {
    stopDeepReview();
    setReviewRuntimeKey("");
    setReviewReadyKey("");
    if (target.mode === "none") {
      replaceGame(
        nextActionHand(game, {
          tableProfileId: gameplaySettings.tableProfileId,
          playerProfiles: gameplaySettings.playerProfiles,
        }),
        { animateDeal: true },
      );
    } else {
      const generated = newTargetedGame(
        (Date.now() + game.handNo) >>> 0,
        gameplaySettings.tableProfileId,
        target,
        undefined,
        undefined,
        {
          playerProfiles: gameplaySettings.playerProfiles,
          ...bankrollsForNextHand(game, gameplaySettings.playerProfiles),
        },
      ).game;
      generated.handNo = game.handNo + 1;
      replaceGame(generated, { animateDeal: true });
    }
    setPage("继续训练");
  };
  const startSpecialty = (tag: WeaknessTag) =>
    startTrainingHand({ mode: "manual", tag });
  const updateTeachingPanelWidth = (teachingPanelWidth: number) => {
    const next = normalizeGameplaySettings({ ...gameplaySettings, teachingPanelWidth });
    setGameplaySettings(next);
    void repository.saveGameplaySettings(next).catch(() => {
      setStorageNotice("分析区宽度未保存");
    });
  };
  const startDeepReview = () => {
    setReviewRuntimeKey(handKey);
    launchDeepReview();
  };
  const cancelDeepReview = () => {
    stopDeepReview();
    const cancelled = structuredClone(game);
    cancelled.deepReview = undefined;
    cancelled.deepReviewStatus = "cancelled";
    cancelled.deepReviewError = undefined;
    replaceGame(cancelled);
    void repository.replaceHand(cancelled).catch(() => {
      setStorageNotice("精算取消状态未保存");
    });
  };
  return (
    <main className={game.phase === "review" ? "review-mode" : undefined}>
      <Header page={page} setPage={setPage} mode={repository.mode} mobile={mobile} />
      {storageNotice ? <div className="storage-notice" role="status">{storageNotice}</div> : null}
      {page === "继续训练" ? (
        <ResizableWorkspace
          panelWidth={gameplaySettings.teachingPanelWidth}
          onPanelWidthChange={updateTeachingPanelWidth}
        >
          <section className={mobile ? `mobile-game-stage${phase === "hero-turn" ? " has-action-dock" : ""}` : "desktop-game-stage"}>
            <div className="round">
              <span>
                第 {game.handNo} 手 · 种子 {game.seed}
              </span>
              <span className="profile-badge">{TABLE_PROFILES[game.tableProfileId].name}</span>
              {game.trainingTarget.mode !== "none" ? (
                <span className="target-badge">{game.trainingTarget.mode === "manual" ? "专项" : "自动"}·{WEAKNESS_DEFINITIONS[game.trainingTarget.tag].name}</span>
              ) : null}
              <b>
                {streetName(game.street)} ·{" "}
                {game.players.filter((p) => !p.folded).length} 人存活
              </b>
              <span className="turn">
                {showdownPlayback
                  ? "摊牌中"
                  : phase === "dealing-hole"
                    ? "发底牌中"
                  : phase === "hero-turn"
                  ? "轮到你行动"
                  : phase === "bot-thinking"
                    ? "群友行动中"
                    : handComplete
                      ? visibleReviewStatus === "calculating" ? "正在精算" : "整手复盘"
                      : game.phase === "review"
                        ? "结算中"
                      : "动作播放中"}
              </span>
              {mobile && phase === "hero-turn" ? <MobileInsightSummary state={preActionInsights.state} game={game} /> : null}
            </div>
            {mobile ? (
              <MobilePokerTable game={game} phase={phase} frame={frame} visualTokens={visualTokens} recentActions={recentActions} themeId={gameplaySettings.tableThemeId} />
            ) : (
              <PokerTable game={game} phase={phase} frame={frame} visualTokens={visualTokens} recentActions={recentActions} themeId={gameplaySettings.tableThemeId} />
            )}
            {game.phase === "playing" && !noActionPlayback ? (
              mobile ? (
                phase === "hero-turn" ? <MobileFloatingControls game={game} busy={busy} receipt={receipt} onAction={submit} /> : null
              ) : (
                <ActionControls game={game} busy={busy} receipt={receipt} onAction={submit} />
              )
            ) : handComplete ? (
              <div className="next">
                <strong>{game.result?.summary}</strong>
                {visibleReviewStatus === "calculating" ? <span>正在后台精算…</span> : null}
              </div>
            ) : (
              <div className="next">
                <strong>
                  {showdownPlayback
                    ? "摊牌亮牌中…"
                    : phase === "dealing-hole"
                      ? "正在发底牌…"
                    : phase === "dealing"
                      ? "正在发下一街…"
                      : "正在结算筹码…"}
                </strong>
              </div>
            )}
          </section>
          <Teaching
            game={game}
            facts={facts}
            insightState={preActionInsights.state}
            aiLiveCoach={aiLiveCoach}
            showPreActionInsights={!mobile}
            phase={phase}
            reviewStatus={visibleReviewStatus}
            reviewProgress={deepReviewProgress}
            reviewError={deepReviewRuntimeError || game.deepReviewError || ""}
            onCancelReview={cancelDeepReview}
            onRetryReview={startDeepReview}
            onNextHand={() => startTrainingHand({ mode: "none" })}
            aiReviewRuntime={aiHandReview}
          />
        </ResizableWorkspace>
      ) : page === "历史牌局" ? (
        <HistoryPage
          repository={repository}
          hands={history}
          loading={historyLoading}
          onRefresh={refreshHistory}
          onGameplaySettingsImported={setGameplaySettings}
          onOpen={(g) => {
            replaceGame(g);
            setPage("继续训练");
          }}
        />
      ) : page === "专项训练" ? (
        <SpecialTrainingPage summaries={weaknessSummaries} onStart={startSpecialty} />
      ) : page === "弱点报告" ? (
        <WeaknessReportPage summaries={weaknessSummaries} hands={history} onTrain={startSpecialty} onOpenHand={(hand) => { replaceGame(hand); setPage("继续训练"); }} />
      ) : page === "设置" ? (
        <SettingsPage repository={repository} soundEnabled={soundEnabled} currentHandProfileId={game.tableProfileId} onGameplaySettingsChange={setGameplaySettings} onModelSettingsChange={setModelSettings} setSoundEnabled={setSoundEnabled} hideModel={mobile} />
      ) : null}
      <footer>
        规则引擎 v0.2 · 本地事实优先 <span>虚拟筹码 · 不涉及真钱</span>
      </footer>
    </main>
  );
}
export function SessionLedger({ players }: { players: Player[] }) {
  return <div className="session-ledger" data-testid="session-ledger">{players.map((player) => {
    const profit = player.stack - player.buyIn;
    return <div className="ledger-row" data-testid={`ledger-player-${player.seat}`} key={player.name}><b>{player.name}</b><span>当前 {player.stack}</span><span>买入 {player.buyIn}</span><span>补码 {player.rebuys}</span><strong className={profit > 0 ? "profit-win" : profit < 0 ? "profit-loss" : ""}>盈亏 {profit > 0 ? "+" : ""}{profit}</strong></div>;
  })}</div>;
}
function Header({ page, setPage, mode, mobile = false }: { page: Page; setPage: (p: Page) => void; mode: DesktopRepository["mode"]; mobile?: boolean }) {
  return (
    <header>
      <div className="brand">
        <span>♠</span>
        <div>
          <b>老英雄牌局</b>
          <small>OLD HEROES POKER</small>
        </div>
      </div>
      <nav aria-label={mobile ? "移动导航" : "主导航"}>
        {nav.map((n) => (
          <button
            className={page === n ? "active" : ""}
            onClick={() => setPage(n)}
            key={n}
          >
            {n}
          </button>
        ))}
      </nav>
      <div className="status">
        <i />
        <span className="status-label">{mode === "native" ? "桌面本地数据" : mode === "mobile" ? "手机本地保存" : "开发预览 · 数据不持久"}</span>
        <span className="strategy-version">{STRATEGY_ENGINE_LABEL}</span>
        <span className="app-version">{APP_VERSION_LABEL}</span>
      </div>
    </header>
  );
}
function Teaching({
  game,
  facts,
  insightState,
  aiLiveCoach,
  showPreActionInsights,
  phase,
  reviewStatus,
  reviewProgress,
  reviewError,
  onCancelReview,
  onRetryReview,
  onNextHand,
  aiReviewRuntime,
}: {
  game: GameState;
  facts?: DecisionFacts;
  insightState: ReturnType<typeof usePreActionInsights>["state"];
  aiLiveCoach: ReturnType<typeof useAiLiveCoach>;
  showPreActionInsights: boolean;
  phase: ReturnType<typeof useGamePlayback>["phase"];
  reviewStatus: DeepReviewStatus;
  reviewProgress: ReturnType<typeof useDeepReview>["progress"];
  reviewError: string;
  onCancelReview(): void;
  onRetryReview(): void;
  onNextHand(): void;
  aiReviewRuntime: ReturnType<typeof useAiHandReview>;
}) {
  if (isNoActionPlayback(phase)) return null;
  if (game.phase === "review") {
    if (reviewStatus === "calculating") {
      return (
        <aside>
          <DeepReviewProgress
            status={reviewStatus}
            progress={reviewProgress}
            error={reviewError}
            onCancel={onCancelReview}
            onRetry={onRetryReview}
            onNextHand={onNextHand}
          />
        </aside>
      );
    }
    if (reviewStatus !== "completed" || !game.deepReview) {
      return (
        <aside>
          <DeepReviewProgress
            status={reviewStatus}
            progress={reviewProgress}
            error={reviewError}
            onCancel={onCancelReview}
            onRetry={onRetryReview}
            onNextHand={onNextHand}
          />
          <ReviewShowdown game={game} />
          <h3>本次运行总账</h3>
          <SessionLedger players={game.players} />
        </aside>
      );
    }
    return (
      <aside>
        <DeepHandReviewView game={game} review={game.deepReview} aiReview={aiReviewRuntime.review ?? game.aiReview} aiStatus={aiReviewRuntime.status} aiError={aiReviewRuntime.error} onRetryAi={aiReviewRuntime.retry} onRecalculate={onRetryReview} onNextHand={onNextHand} />
        <ReviewShowdown game={game} />
        <h3>本次运行总账</h3>
        <SessionLedger players={game.players} />
      </aside>
    );
  }
  if (game.board.length >= 3 && showPreActionInsights) {
    return (
      <aside>
        <p className="eyebrow">实时规则事实 · 不揭示未来牌</p>
        {insightState.analysis ? null : <h2>正在整理当前决策…</h2>}
        <AiLiveCoach state={aiLiveCoach} />
        <PreActionInsights state={insightState} game={game} aiPrimary={aiLiveCoach.status === "ready"} />
      </aside>
    );
  }
  return (
    <aside>
      <p className="eyebrow">实时规则事实 · 不揭示未来牌</p>
      <h2>当前决策</h2>
      <div className="situation">
        <span>{game.legal.callAmount ? "面对下注" : "可以过牌"}</span>
        <strong>{game.legal.callAmount || "CHECK"}</strong>
        <small>
          底池 {game.pot} ·{" "}
          {facts
            ? `需胜率 ${(facts.requiredEquity * 100).toFixed(1)}%`
            : game.board.length >= 3
              ? "胜率与 EV 后台计算中…"
              : "翻前按位置与行动线建模"}
        </small>
      </div>
      {facts ? (
        <>
          <h3>本地 EV 比较</h3>
          <div className="ev">
            {facts.alternatives.map((a) => (
              <span
                className={a === facts.recommended ? "best" : ""}
                key={a.action}
              >
                {a.action}
                <b>
                  {a.ev >= 0 ? "+" : ""}
                  {a.ev.toFixed(1)}
                </b>
              </span>
            ))}
          </div>
          <p>
            推荐：<b>{facts.recommended.action}</b> · {facts.recommended.intent}
          </p>
        </>
      ) : game.board.length < 3 ? (
        <>
          <h3>翻前思考清单</h3>
          <ul>
            <li>位置、入池人数和身后挤压风险</li>
            <li>朋友局跟注范围偏宽，但大尺寸再加注偏强</li>
            <li>不要为了“看翻牌”无条件平跟</li>
          </ul>
        </>
      ) : (
        <div className="ev" role="status">正在后台枚举胜率与 EV，操作按钮仍可立即使用。</div>
      )}
      {showPreActionInsights ? <><AiLiveCoach state={aiLiveCoach} /><PreActionInsights state={insightState} game={game} aiPrimary={aiLiveCoach.status === "ready"} /></> : null}
    </aside>
  );
}
function ReviewShowdown({ game }: { game: GameState }) {
  const showdown = game.result?.showdown ?? [];
  const pots = game.result?.pots ?? [];
  const playerBySeat = new Map(game.players.map((player) => [player.seat, player]));
  const foldedPlayers = game.players.filter((player) => player.folded);

  return (
    <>
      <h3>摊牌明细</h3>
      {showdown.length ? (
        <div className="showdown-review">
          {showdown.map((entry) => {
            const player = playerBySeat.get(entry.seat);
            if (!player) return null;
            return (
              <article className="showdown-entry" key={entry.seat}>
                <div className="showdown-entry-head">
                  <b>{player.name}</b>
                  <span>{entry.handName}</span>
                </div>
                <div className="showdown-row">
                  <span className="showdown-label">底牌</span>
                  <div className="showdown-cards">
                    {player.hole.map((card, index) =>
                      renderShowdownCard(card, `${entry.seat}-hole-${index}`),
                    )}
                  </div>
                  <code>{player.hole.join(" ")}</code>
                </div>
                <div className="showdown-row">
                  <span className="showdown-label">最佳五张</span>
                  <div className="showdown-cards">
                    {entry.bestCards.map((card, index) =>
                      renderShowdownCard(card, `${entry.seat}-best-${index}`),
                    )}
                  </div>
                  <code>{entry.bestCards.join(" ")}</code>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p>本手没有摊牌明细。</p>
      )}
      {foldedPlayers.length ? (
        <div className="showdown-folded">
          {foldedPlayers.map((player) => (
            <p key={player.seat}>{player.name}：弃牌，只保留范围</p>
          ))}
        </div>
      ) : null}
      {pots.length ? (
        <>
          <h3>底池归属</h3>
          <div className="showdown-pots">
            {pots.map((pot, index) => {
              const winnerNames = pot.winners
                .map((seat) => playerBySeat.get(seat)?.name)
                .filter((name): name is string => Boolean(name));
              return (
                <article className="pot-result" data-testid="pot-result" key={`${pot.label}-${index}`}>
                  <div className="pot-result-head">
                    <b>{pot.label}</b>
                    <strong>{pot.amount}</strong>
                  </div>
                  <p>{winnerNames.join("、")}{pot.winners.length > 1 ? " 平分" : ""}</p>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}
