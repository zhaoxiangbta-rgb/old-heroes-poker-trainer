// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../data/memoryRepository";
import { newGame } from "../game/game";
import type { PreActionInsightState } from "../insights/types";
import { useAiLiveCoach } from "./useAiLiveCoach";

afterEach(cleanup);

function readyInsight(hash = "state-1"): PreActionInsightState {
  return {
    status: "ready", key: { handNo: 1, seed: 1, street: "flop", logIndex: 1, stateHash: hash },
    liveCoach: { schemaVersion: 1, strategy: { label: "V4", version: "v4", degraded: false }, hero: { currentHand: "高牌", upgrades: [], upgradeSummary: "无" }, opponents: [], confidence: 0.7 },
    analysis: { schemaVersion: 2, sections: [], heroRange: { label: "底部", percentile: 0.2 }, opponentBuckets: { strongValue: 0, madeHand: 0, strongDraw: 0, weakDraw: 0, air: 1 }, baseline: [], adjusted: [{ action: "fold", frequency: 1, ev: 0, intent: "pot-control" }], confidence: 0.7, audit: { strategyVersion: "v4", sampleBudget: 1, seed: 1 } },
  };
}

function nativeRepository() {
  const repository = createMemoryRepository();
  Object.defineProperty(repository, "mode", { value: "native" });
  return repository;
}

describe("useAiLiveCoach", () => {
  it("does not request when AI is disabled", () => {
    const repository = nativeRepository();
    const generate = vi.spyOn(repository, "generateAiExplanation");
    const game = newGame(1); game.street = "flop"; game.board = ["2c", "7d", "Jh"];
    const { result } = renderHook(() => useAiLiveCoach({ repository, settings: { baseUrl: "x", model: "x", enabled: false }, game, insight: readyInsight(), active: true }));
    expect(result.current.status).toBe("idle");
    expect(generate).not.toHaveBeenCalled();
  });

  it("shows loading without blocking and accepts a guarded response", async () => {
    const repository = nativeRepository();
    let resolve!: (value: { content: string; model: string; elapsedMs: number }) => void;
    vi.spyOn(repository, "generateAiExplanation").mockReturnValue(new Promise((done) => { resolve = done; }));
    const game = newGame(1); game.street = "flop"; game.board = ["2c", "7d", "Jh"];
    const insight = readyInsight();
    const { result } = renderHook(() => useAiLiveCoach({ repository, settings: { baseUrl: "x", model: "qwen", enabled: true }, game, insight, active: true }));
    expect(result.current.status).toBe("loading");
    const facts = result.current.facts!;
    act(() => resolve({ model: "qwen", elapsedMs: 100, content: JSON.stringify({ version: 1, stateHash: facts.stateHash, currentHand: facts.hero.currentHand, reasoning: ["当前是高牌"], opponentRead: [], risks: [], recommendationRestatement: "建议弃牌" }) }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});
