import { useCallback, useEffect, useRef, useState } from "react";
import { captureHeroDecision } from "../review/capture";
import { isHeroTurn, normalizeGameState, type GameAction, type GameState } from "./game";
import { buildPreActionInsightInput, preActionInsightHash } from "../insights/snapshot";
import type { PersistedPreActionInsight, PreActionInsightState } from "../insights/types";
import {
  planInitialDeal,
  planAfterHero,
  type PlaybackFrame,
  type PlaybackPhase,
  type VisualEffectKind,
} from "./playback";

type PlaybackOptions = { animateInitialDeal?: boolean };
type ReplaceOptions = { animateDeal?: boolean };

export type VisualToken = {
  id: number;
  effect: VisualEffectKind;
  actorSeat?: number;
  action?: PlaybackFrame["action"];
  expiresAt: number;
};

export function formatReceipt(state: GameState, action: GameAction) {
  if (action.type === "fold") return "✓ 弃牌";
  if (action.type === "check") return "✓ 过牌";
  if (action.type === "call") return `✓ 跟注 ${state.legal.callAmount}`;
  if (action.to === state.legal.maxRaiseTo) return `✓ 全下 ${action.to}`;
  return state.currentBet === 0
    ? `✓ 下注到 ${action.to}`
    : `✓ 加注到 ${action.to}`;
}

function persistableInsight(game: GameState, state?: PreActionInsightState): PersistedPreActionInsight | undefined {
  if (!state?.key || (!state.exact && !state.ranges?.length && !state.responses?.length)) return;
  const input = buildPreActionInsightInput(game);
  if (
    state.key.handNo !== input.handNo || state.key.seed !== input.seed ||
    state.key.street !== input.street || state.key.logIndex !== input.logIndex ||
    state.key.stateHash !== preActionInsightHash(input)
  ) return;
  const common = {
    key: structuredClone(state.key),
    sampleSeed: game.seed,
    sampleBudget: 384,
    exact: state.exact ? structuredClone(state.exact) : undefined,
    rangeSummaries: state.ranges?.map((range) => {
      const summary = { ...range };
      delete (summary as Partial<typeof range>).ranges;
      return structuredClone(summary);
    }),
    responses: state.responses ? structuredClone(state.responses) : undefined,
    confidence: state.confidence,
  };
  if (state.analysis) {
    return {
      schemaVersion: 2,
      calculatorVersion: "pre-action-analysis-v2",
      rangeModelVersion: "public-range-v2",
      ...common,
      analysis: structuredClone(state.analysis),
    };
  }
  return {
    schemaVersion: 1,
    calculatorVersion: "pre-action-exact-v1",
    rangeModelVersion: "public-range-v1",
    ...common,
  };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useGamePlayback(
  initialState: GameState,
  options: PlaybackOptions = {},
) {
  const [initialFrames] = useState(() =>
    options.animateInitialDeal
      ? planInitialDeal(initialState, 0, prefersReducedMotion())
      : [],
  );
  const [game, setGame] = useState(initialState);
  const [frame, setFrame] = useState<PlaybackFrame | undefined>(initialFrames[0]);
  const [phase, setPhase] = useState<PlaybackPhase>(
    initialFrames[0]?.phase ?? (isHeroTurn(initialState) ? "hero-turn" : "hand-complete"),
  );
  const [busy, setBusy] = useState(initialFrames.length > 0);
  const [receipt, setReceipt] = useState("");
  const [visualTokens, setVisualTokens] = useState<VisualToken[]>([]);
  const lockedRef = useRef(initialFrames.length > 0);
  const actionIdRef = useRef(0);
  const generationRef = useRef(0);
  const framesRef = useRef<PlaybackFrame[]>(initialFrames);
  const frameIndexRef = useRef(initialFrames.length ? 0 : -1);
  const timersRef = useRef(new Set<number>());

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, []);

  useEffect(() => {
    if (!frame) return;
    if (frame.phase === "hero-turn") {
      lockedRef.current = false;
      setBusy(false);
      return;
    }
    if (frame.phase === "hand-complete") {
      setBusy(false);
      return;
    }
    const generation = generationRef.current;
    if (frame.effect !== "receipt") {
      const visualDuration = frame.effect === "chips"
        ? Math.max(frame.durationMs, 340)
        : frame.effect === "fold"
          ? Math.max(frame.durationMs, 620)
        : frame.effect === "all-in"
          ? Math.max(frame.durationMs, 520)
          : frame.durationMs;
      const token: VisualToken = {
        id: frame.id,
        effect: frame.effect,
        actorSeat: frame.actorSeat,
        action: frame.action,
        expiresAt: Date.now() + visualDuration,
      };
      setVisualTokens((current) => [
        ...current.filter((item) => item.id !== token.id),
        token,
      ]);
      schedule(() => {
        if (generation !== generationRef.current) return;
        setVisualTokens((current) =>
          current.filter((item) => item.id !== token.id),
        );
      }, visualDuration);
    }
    const timer = schedule(() => {
      if (generation !== generationRef.current) return;
      const nextIndex = frameIndexRef.current + 1;
      const next = framesRef.current[nextIndex];
      if (!next) return;
      frameIndexRef.current = nextIndex;
      setFrame(next);
      setPhase(next.phase);
      setGame(next.state);
    }, Math.max(0, frame.durationMs - frame.overlapMs));
    const timers = timersRef.current;
    return () => {
      window.clearTimeout(timer);
      timers.delete(timer);
    };
  }, [frame, schedule]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      generationRef.current += 1;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const startFrames = useCallback((frames: PlaybackFrame[]) => {
    generationRef.current += 1;
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
    framesRef.current = frames;
    frameIndexRef.current = 0;
    lockedRef.current = true;
    const first = frames[0];
    setFrame(first);
    setGame(first.state);
    setPhase(first.phase);
    setReceipt("");
    setVisualTokens([]);
    setBusy(true);
  }, []);

  const submit = useCallback(
    (action: GameAction, insightState?: PreActionInsightState) => {
      if (lockedRef.current || !isHeroTurn(game)) return false;
      lockedRef.current = true;
      setBusy(true);
      setReceipt(formatReceipt(game, action));
      setPhase("submitting");
      const generation = generationRef.current;
      schedule(() => {
        if (generation !== generationRef.current) return;
        try {
          const assessedGame = structuredClone(game);
          assessedGame.reviewDecisionInputs.push({
            ...captureHeroDecision(game),
            actual: structuredClone(action),
            preActionInsight: persistableInsight(game, insightState),
          });
          const frames = planAfterHero(
            assessedGame,
            action,
            ++actionIdRef.current,
            prefersReducedMotion(),
          );
          framesRef.current = frames;
          frameIndexRef.current = 0;
          const first = frames[0];
          setFrame(first);
          setPhase(first.phase);
          setGame(first.state);
        } catch {
          lockedRef.current = false;
          setBusy(false);
          setPhase("hero-turn");
          setReceipt("动作处理失败，请重试");
        }
      }, 0);
      return true;
    },
    [game, schedule],
  );

  const replaceGame = useCallback((next: GameState, replaceOptions: ReplaceOptions = {}) => {
    next = normalizeGameState(next);
    if (replaceOptions.animateDeal) {
      startFrames(
        planInitialDeal(next, ++actionIdRef.current, prefersReducedMotion()),
      );
      return;
    }
    generationRef.current += 1;
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
    framesRef.current = [];
    frameIndexRef.current = -1;
    lockedRef.current = false;
    setFrame(undefined);
    setGame(next);
    setReceipt("");
    setVisualTokens([]);
    setBusy(false);
    setPhase(isHeroTurn(next) ? "hero-turn" : "hand-complete");
  }, [startFrames]);

  return {
    game,
    phase,
    frame,
    receipt,
    busy,
    visualTokens,
    recentActions: game.log.slice(-3),
    submit,
    replaceGame,
  };
}
