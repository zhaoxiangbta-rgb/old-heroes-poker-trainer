// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { newGame } from "./game";
import {
  useDeferredDecisionFacts,
  type DecisionFactsWorker,
} from "./useDeferredDecisionFacts";

describe("useDeferredDecisionFacts", () => {
  it("returns control before computing and accepts facts from a worker", () => {
    const posted: unknown[] = [];
    let emit: ((event: MessageEvent) => void) | null = null;
    const worker: DecisionFactsWorker = {
      postMessage: (message) => posted.push(message),
      terminate: vi.fn(),
      set onmessage(handler) { emit = handler; },
      get onmessage() { return emit; },
    };
    const factory = () => worker;
    const game = newGame(42);
    game.board = ["Ah", "7d", "2c"];
    const { result } = renderHook(() =>
      useDeferredDecisionFacts(game, true, factory),
    );
    expect(result.current).toBeUndefined();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toEqual(expect.objectContaining({
      streetBet: game.players[game.heroSeat].streetBet,
      canRaise: game.legal.canRaise,
      minRaiseTo: game.legal.minRaiseTo,
      maxRaiseTo: game.legal.maxRaiseTo,
    }));
    const facts = { equity: 0.5 } as never;
    act(() => emit?.({ data: { facts } } as MessageEvent));
    expect(result.current).toBe(facts);
  });

  it("does not start analysis outside a hero decision", () => {
    const factory = vi.fn();
    const game = newGame(42);
    renderHook(() => useDeferredDecisionFacts(game, false, factory));
    expect(factory).not.toHaveBeenCalled();
  });
});
