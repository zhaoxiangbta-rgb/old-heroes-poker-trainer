// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createMemoryRepository } from "./data/memoryRepository";
import { newGame, normalizeGameState, type GameState } from "./game/game";
import { captureHeroDecision } from "./review/capture";
import { deepReviewStateHash } from "./review/stateHash";
import type { DeepHandReview, DeepReviewInput } from "./review/types";

const harness = vi.hoisted(() => ({
  game: undefined as GameState | undefined,
  replaceGame: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  completed: undefined as ((review: DeepHandReview) => void) | undefined,
  status: "calculating" as const,
}));

vi.mock("./game/useGamePlayback", () => ({
  useGamePlayback: () => ({
    game: harness.game!,
    phase: "hand-complete",
    frame: undefined,
    receipt: "",
    busy: true,
    visualTokens: [],
    recentActions: [],
    submit: vi.fn(),
    replaceGame: harness.replaceGame,
  }),
}));

vi.mock("./review/useDeepReview", () => ({
  useDeepReview: ({ onCompleted }: { onCompleted(review: DeepHandReview): void }) => {
    harness.completed = onCompleted;
    return {
      status: harness.status,
      progress: { stage: "ranges", completed: 2, total: 8 },
      error: "",
      start: harness.start,
      cancel: harness.cancel,
    };
  },
}));

vi.mock("./game/sound", async () => {
  const actual = await vi.importActual<typeof import("./game/sound")>("./game/sound");
  return {
    ...actual,
    createSoundPlayer: () => ({ play: vi.fn(), setEnabled: vi.fn(), dispose: vi.fn() }),
  };
});

function settledGame() {
  const live = newGame(31415);
  const snapshot = captureHeroDecision(live);
  snapshot.actual = live.legal.canCheck ? { type: "check" } : { type: "call" };
  live.reviewDecisionInputs = [snapshot];
  live.phase = "review";
  live.pending = [];
  live.toAct = -1;
  live.result = { reason: "fold", winners: [live.heroSeat], summary: "你赢得 3 筹码" };
  return normalizeGameState(live);
}

function completedReview(game: GameState): DeepHandReview {
  const input: DeepReviewInput = {
    handNo: game.handNo,
    seed: game.seed,
    strategyVersion: game.strategyVersion,
    calculatorVersion: "deep-review-v1",
    decisions: game.reviewDecisionInputs,
  };
  return {
    version: 1,
    status: "completed",
    handNo: game.handNo,
    seed: game.seed,
    stateHash: deepReviewStateHash(input),
    strategyVersion: game.strategyVersion,
    calculatorVersion: "deep-review-v1",
    completedAt: "2026-08-28T00:00:00.000Z",
    summary: {
      grade: "良好",
      totalNormalizedEvLoss: 0,
      strongestPoint: "按范围决策",
      priorityCorrection: "保持当前思路",
      confidence: 1,
      precision: "exact",
    },
    decisions: [],
  };
}

describe("App deep review lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    harness.game = settledGame();
    harness.replaceGame.mockReset();
    harness.start.mockReset();
    harness.cancel.mockReset();
    harness.completed = undefined;
  });

  afterEach(() => cleanup());

  it("automatically starts after saving and hides every partial review", async () => {
    render(<App repository={createMemoryRepository()} />);
    await waitFor(() => expect(harness.start).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText("正在精算").length).toBeGreaterThan(0);
    expect(screen.getByText("重建逐街范围")).toBeVisible();
    expect(screen.queryByText("行动时间线")).not.toBeInTheDocument();
    expect(screen.queryByText("摔牌明细")).not.toBeInTheDocument();
  });

  it("cancels without producing scored assessments", async () => {
    const repository = createMemoryRepository();
    render(<App repository={repository} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "取消精算" })).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "取消精算" }));
    expect(harness.cancel).toHaveBeenCalled();
    expect(harness.replaceGame).toHaveBeenCalledWith(expect.objectContaining({
      deepReviewStatus: "cancelled",
      assessments: [],
    }));
  });

  it("persists a completed result as the only scored review source", async () => {
    const repository = createMemoryRepository();
    render(<App repository={repository} />);
    await waitFor(() => expect(harness.start).toHaveBeenCalledTimes(1));
    harness.completed!(completedReview(harness.game!));
    await waitFor(async () => {
      const stored = await repository.loadHands();
      expect(stored[0]?.deepReviewStatus).toBe("completed");
    });
    expect(harness.replaceGame).toHaveBeenCalledWith(expect.objectContaining({
      deepReviewStatus: "completed",
      deepReview: expect.objectContaining({ status: "completed" }),
      assessments: [],
    }));
  });
});
