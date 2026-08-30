// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newGame } from "./game";
import { formatReceipt, useGamePlayback } from "./useGamePlayback";
import { buildPreActionInsightInput, preActionInsightHash } from "../insights/snapshot";
import type { PreActionInsightState } from "../insights/types";

describe("useGamePlayback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("animates the initial hand before unlocking the hero", () => {
    const initial = newGame(42);
    const { result } = renderHook(() =>
      useGamePlayback(initial, { animateInitialDeal: true }),
    );

    expect(result.current.phase).toBe("dealing-hole");
    expect(result.current.busy).toBe(true);
    for (let index = 0; index < initial.players.length * 2; index += 1)
      act(() => vi.advanceTimersByTime(240));
    expect(result.current.phase).toBe("hero-turn");
    expect(result.current.busy).toBe(false);
  });

  it("keeps controls locked until a replacement hand finishes dealing", () => {
    const { result } = renderHook(() => useGamePlayback(newGame(42)));

    act(() => result.current.replaceGame(newGame(99), { animateDeal: true }));
    expect(result.current.phase).toBe("dealing-hole");
    expect(result.current.busy).toBe(true);
    for (let index = 0; index < 12; index += 1)
      act(() => vi.advanceTimersByTime(240));
    expect(result.current.phase).toBe("hero-turn");
    expect(result.current.busy).toBe(false);
  });

  it("locks synchronously so a rapid second click cannot submit again", () => {
    const initial = newGame(42);
    const { result } = renderHook(() => useGamePlayback(initial));
    let first = false;
    let second = true;
    act(() => {
      first = result.current.submit({ type: "call" });
      second = result.current.submit({ type: "call" });
    });
    expect([first, second]).toEqual([true, false]);
    expect(result.current.busy).toBe(true);
    expect(result.current.receipt).toBe(`✓ 跟注 ${initial.legal.callAmount}`);
    expect(result.current.receipt).not.toContain("已提交");
    expect(result.current.game.log).toHaveLength(initial.log.length);
    expect(result.current.game.assessments).toHaveLength(0);
  });

  it("captures the hero input without calculating assessment during submit", () => {
    const initial = newGame(42);
    const { result } = renderHook(() => useGamePlayback(initial));
    act(() => result.current.submit({ type: "call" }));
    expect(result.current.receipt).toBe(`✓ 跟注 ${initial.legal.callAmount}`);
    expect(result.current.phase).toBe("submitting");
    expect(result.current.game.assessments).toHaveLength(0);
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.game.assessments).toHaveLength(0);
    expect(result.current.game.reviewDecisionInputs).toHaveLength(1);
    expect(result.current.game.reviewDecisionInputs[0].actual).toEqual({ type: "call" });
  });

  it("captures only a matching completed pre-action insight without full ranges", () => {
    const initial = newGame(142);
    const input = buildPreActionInsightInput(initial);
    const insight: PreActionInsightState = {
      key: { handNo: initial.handNo, seed: initial.seed, street: initial.street, logIndex: initial.log.length, stateHash: preActionInsightHash(input) },
      status: "ready",
      ranges: [{ seat: 1, playerId: "friend-01", comboCount: 2, buckets: { strongValue: 0.2, madeHand: 0.3, strongDraw: 0.1, weakDraw: 0.1, air: 0.3 }, changes: [], confidence: 0.6, ranges: [{ cards: ["Ah", "Kh"], weight: 1, label: "AKs", history: [] }] }],
      responses: [],
      confidence: 0.6,
    };
    const { result } = renderHook(() => useGamePlayback(initial));
    act(() => result.current.submit({ type: "call" }, insight));
    act(() => vi.advanceTimersByTime(0));
    const saved = result.current.game.reviewDecisionInputs[0].preActionInsight!;
    expect(saved.key.stateHash).toBe(insight.key!.stateHash);
    expect(saved.rangeSummaries?.[0]).not.toHaveProperty("ranges");
    expect(JSON.stringify(saved)).not.toContain("Ah");
  });

  it("persists v2 plain-language analysis without opponent hidden combos", () => {
    const initial = newGame(143);
    const input = buildPreActionInsightInput(initial);
    const insight: PreActionInsightState = {
      key: { handNo: initial.handNo, seed: initial.seed, street: initial.street, logIndex: initial.log.length, stateHash: preActionInsightHash(input) },
      status: "ready",
      ranges: [{ seat: 1, playerId: "friend-01", comboCount: 2, buckets: { strongValue: 0.2, madeHand: 0.3, strongDraw: 0.1, weakDraw: 0.1, air: 0.3 }, changes: [], confidence: 0.6, ranges: [{ cards: ["Ah", "Kh"], weight: 1, label: "AKs", history: [] }] }],
      analysis: {
        schemaVersion: 2,
        sections: ["situation", "ranges", "baseline", "adjustment", "watch"].map((kind) => ({ kind: kind as "situation", title: kind, text: kind })),
        heroRange: { label: "QJs", percentile: 0.2 },
        opponentBuckets: { strongValue: 0.2, madeHand: 0.3, strongDraw: 0.1, weakDraw: 0.1, air: 0.3 },
        baseline: [], adjusted: [], confidence: 0.6,
        audit: { strategyVersion: "v2", sampleBudget: 384, seed: initial.seed },
      },
      confidence: 0.6,
    };
    const { result } = renderHook(() => useGamePlayback(initial));
    act(() => result.current.submit({ type: "call" }, insight));
    act(() => vi.advanceTimersByTime(0));
    const saved = result.current.game.reviewDecisionInputs[0].preActionInsight!;
    expect(saved.schemaVersion).toBe(2);
    expect(saved).toHaveProperty("analysis.schemaVersion", 2);
    expect(JSON.stringify(saved)).not.toContain("Ah");
  });

  it("preserves one identical decision snapshot through every playback frame", () => {
    const initial = newGame(42);
    const { result } = renderHook(() => useGamePlayback(initial));
    act(() => result.current.submit({ type: "call" }));
    act(() => vi.advanceTimersByTime(0));
    const snapshot = result.current.game.reviewDecisionInputs[0];
    expect(snapshot).toBeDefined();
    act(() => vi.runAllTimers());
    expect(result.current.game.reviewDecisionInputs).toEqual([snapshot]);
  });

  it("keeps the previous chip effect alive as the next opponent starts thinking", () => {
    const initial = newGame(42);
    const { result } = renderHook(() => useGamePlayback(initial));
    act(() => result.current.submit({ type: "call" }));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(80));
    const actionFrame = result.current.frame!;
    expect(actionFrame.effect).toBe("chips");
    act(() =>
      vi.advanceTimersByTime(actionFrame.durationMs - actionFrame.overlapMs),
    );
    expect(result.current.phase).toBe("bot-thinking");
    expect(
      result.current.visualTokens.some((token) => token.effect === "chips"),
    ).toBe(true);
  });

  it("keeps a fold visual visible after the action queue has already advanced", () => {
    const initial = newGame(42);
    const { result } = renderHook(() => useGamePlayback(initial));

    act(() => result.current.submit({ type: "fold" }));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(20));
    expect(
      result.current.visualTokens.some((token) => token.effect === "fold"),
    ).toBe(true);

    act(() => vi.advanceTimersByTime(500));
    expect(
      result.current.visualTokens.some((token) => token.effect === "fold"),
    ).toBe(true);
  });

  it("formats concise receipts for every hero action", () => {
    const game = newGame(42);
    expect(formatReceipt(game, { type: "call" })).toBe(
      `✓ 跟注 ${game.legal.callAmount}`,
    );
    expect(formatReceipt(game, { type: "fold" })).toBe("✓ 弃牌");
    expect(formatReceipt(game, { type: "raise", to: 12 })).toBe(
      "✓ 加注到 12",
    );
  });

  it("reveals one opponent action per elapsed playback frame", () => {
    const initial = newGame(42);
    const { result } = renderHook(() => useGamePlayback(initial));
    act(() => result.current.submit({ type: "call" }));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(80));
    const afterHero = result.current.game.log.length;
    expect(afterHero).toBe(initial.log.length + 1);
    expect(result.current.phase).toBe("animating-chips");
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.phase).toBe("bot-thinking");
    expect(result.current.game.log).toHaveLength(afterHero);
    act(() => vi.advanceTimersByTime(750));
    expect(result.current.phase).toBe("animating-chips");
    expect(result.current.game.log).toHaveLength(afterHero + 1);
  });

  it("cancels an old queue when a different hand replaces it", () => {
    const initial = newGame(42);
    const replacement = newGame(99);
    const { result } = renderHook(() => useGamePlayback(initial));
    act(() => result.current.submit({ type: "call" }));
    act(() => result.current.replaceGame(replacement));
    act(() => vi.runAllTimers());
    expect(result.current.game.seed).toBe(99);
    expect(result.current.game.log).toEqual(replacement.log);
    expect(result.current.busy).toBe(false);
    expect(result.current.phase).toBe("hero-turn");
  });
});
