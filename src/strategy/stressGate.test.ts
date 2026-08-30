import { describe, expect, it } from "vitest";
import { act, newGame } from "../game/game";
import { createLocalStrategyEngine } from "./engine";
import { buildRangeLedger, snapshotRangeLedger } from "./rangeLedger";
import { replayFixture } from "./replayFixtures";
import type { StrategyResult } from "./types";

function auditResult(result: StrategyResult) {
  const total = result.actions.reduce((sum, action) => sum + action.frequency, 0);
  expect(total).toBeCloseTo(1, 8);
  expect(result.actions.length).toBeGreaterThan(0);
  expect(result.actions.every((action) =>
    Number.isFinite(action.frequency) && action.frequency > 0 && Number.isFinite(action.ev)
  )).toBe(true);
  if (result.source === "safe-fallback") {
    expect(result.degradation?.reason ?? result.explanationFacts.fallback).toBeTruthy();
  }
}

describe.runIf(__STRATEGY_STRESS_ENABLED__)("strategy release stress batch", () => {
  it.each([6, 2])(`settles ${__STRATEGY_STRESS_HANDS__.toLocaleString()} legal %i-player hands with conserved chips`, (playerCount) => {
    const failures: string[] = [];
    let decisions = 0;
    const lastSeed = __STRATEGY_STRESS_FIRST_SEED__ + __STRATEGY_STRESS_HANDS__ - 1;
    for (let seed = __STRATEGY_STRESS_FIRST_SEED__; seed <= lastSeed; seed += 1) {
      let state = newGame(seed, 1, Array(playerCount).fill(2));
      if (state.phase === "playing") {
        state = act(
          state,
          state.legal.canCall
            ? { type: "call" }
            : state.legal.canFold
              ? { type: "fold" }
              : { type: "check" },
        );
      }
      const total = state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot;
      if (state.phase !== "review") failures.push(`未结束: ${seed}/${playerCount}`);
      if (total !== playerCount * 2) failures.push(`筹码不守恒: ${seed}/${playerCount}`);
      if (state.policyDecisions.some((record) => record.decision.facts.fallback))
        failures.push(`策略降级: ${seed}/${playerCount}`);
      if (state.strategyDecisions.some((record) =>
        record.street === "preflop" && record.result.source === "safe-fallback"
      )) failures.push(`翻前蓝图降级: ${seed}/${playerCount}`);
      if (playerCount === 2 && state.strategyDecisions.some((record) =>
        record.street !== "preflop" && record.result.source === "safe-fallback"
      )) failures.push(`单挑翻后蓝图降级: ${seed}/${playerCount}`);
      for (const record of state.strategyDecisions) {
        auditResult(record.result);
        if (record.street === "preflop") {
          expect(record.result.strategyVersion).toBe("strategy-v4.0.0");
          expect(record.result.source).toContain("strategy-pack-v3");
        }
      }
      decisions += state.strategyDecisions.length;
    }
    expect(failures).toEqual([]);
    expect(decisions).toBeGreaterThanOrEqual(Math.floor(__STRATEGY_STRESS_HANDS__ / 2));
  }, Math.max(30_000, __STRATEGY_STRESS_HANDS__ * 40));

  it("resolves sampled multiway postflop nodes without an unexplained fallback", () => {
    const input = replayFixture("four-way-three-checks-to-button", __STRATEGY_STRESS_FIRST_SEED__);
    input.ranges = snapshotRangeLedger(buildRangeLedger(input.state));
    const failures: string[] = [];
    for (let offset = 0; offset < 6; offset += 1) {
      const request = structuredClone(input);
      request.state.seed += offset;
      const result = createLocalStrategyEngine().decide(request);
      auditResult(result);
      if (result.strategyVersion !== "strategy-v4.0.0" || result.source !== "multiway-resolver") {
        failures.push(`${request.state.seed}:${result.source}/${result.strategyVersion}`);
      }
      if (!result.actions.length || result.actions.some((action) =>
        !Number.isFinite(action.ev) || !Number.isFinite(action.frequency)
      )) failures.push(`${request.state.seed}:非法策略数值`);
    }
    expect(failures).toEqual([]);
  }, 30_000);
});
