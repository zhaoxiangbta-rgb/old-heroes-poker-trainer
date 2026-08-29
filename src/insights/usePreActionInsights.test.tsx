// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { newGame, type GameState } from "../game/game";
import {
  usePreActionInsights,
  type InsightWorkerLike,
  type InsightWorkerEvent,
  type InsightWorkerRequest,
} from "./usePreActionInsights";

class FakeWorker implements InsightWorkerLike {
  onmessage: ((event: MessageEvent<InsightWorkerEvent>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: InsightWorkerRequest[] = [];
  terminate = vi.fn();
  postMessage(message: InsightWorkerRequest) { this.posted.push(message); }
  emit(data: InsightWorkerEvent) { this.onmessage?.({ data } as MessageEvent<InsightWorkerEvent>); }
}

function postflopGame(seed = 42): GameState {
  const game = newGame(seed);
  const known = new Set(game.players.flatMap((player) => player.hole));
  game.board = ["2c", "3d", "4h"].filter((card) => !known.has(card));
  while (game.board.length < 3) {
    const card = ["5s", "6c", "7d", "8h"].find((candidate) => !known.has(candidate) && !game.board.includes(candidate));
    game.board.push(card!);
  }
  game.street = "flop";
  return game;
}

describe("usePreActionInsights", () => {
  it("accepts exact facts first and range facts second", () => {
    const worker = new FakeWorker();
    const { result } = renderHook(() => usePreActionInsights(postflopGame(), true, () => worker));
    const start = worker.posted.find((message) => message.type === "start")!;
    expect(result.current.state.status).toBe("calculating-exact");
    act(() => worker.emit({
      type: "exact-completed",
      requestId: start.requestId,
      key: start.key,
      exact: { precision: "exact", handClasses: [], exclusiveNextTotal: 1, exclusiveRiverTotal: 1, absoluteNuts: 0, tiedNuts: 0, nearNuts: 0, outs: [], elapsedMs: 20 },
    }));
    expect(result.current.state.status).toBe("calculating-ranges");
    expect(result.current.state.exact?.precision).toBe("exact");
    act(() => worker.emit({
      type: "ranges-completed",
      requestId: start.requestId,
      key: start.key,
      ranges: [],
      responses: [],
      confidence: 0.7,
    }));
    expect(result.current.state.status).toBe("ready");
  });

  it("rejects stale events after the decision key changes", () => {
    const workers = [new FakeWorker(), new FakeWorker()];
    let index = 0;
    const firstGame = postflopGame(7);
    const { result, rerender } = renderHook(
      ({ game }) => usePreActionInsights(game, true, () => workers[index++]),
      { initialProps: { game: firstGame } },
    );
    const oldStart = workers[0].posted.find((message) => message.type === "start")!;
    const nextGame = structuredClone(firstGame);
    nextGame.log.push({
      street: "flop",
      actor: "青禾",
      actorSeat: 1,
      action: "过牌",
      kind: "check",
      amount: 0,
      toAmount: 0,
      potAfter: nextGame.pot,
    });
    rerender({ game: nextGame });
    act(() => workers[0].emit({ type: "failed", requestId: oldStart.requestId, key: oldStart.key, message: "old" }));
    expect(result.current.state.error).not.toBe("old");
    expect(result.current.state.key?.logIndex).toBe(nextGame.log.length);
  });

  it("cancels without blocking the game and terminates the worker", () => {
    const worker = new FakeWorker();
    const { result } = renderHook(() => usePreActionInsights(postflopGame(9), true, () => worker));
    act(() => result.current.cancel());
    expect(result.current.state.status).toBe("idle");
    expect(worker.terminate).toHaveBeenCalled();
  });
});
