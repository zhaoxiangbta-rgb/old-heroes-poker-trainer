import { describe, expect, it } from "vitest";
import { act, newGame } from "../game/game";
import { createLocalStrategyEngine } from "./engine";
import { buildRangeLedger, snapshotRangeLedger } from "./rangeLedger";
import { replayFixture } from "./replayFixtures";

describe.runIf(__STRATEGY_STRESS_ENABLED__)("strategy release stress batch", () => {
  it.each([6, 2])("settles 1,000 legal %i-player hands with conserved chips", (playerCount) => {
    const failures: string[] = [];
    let decisions = 0;
    const lastSeed = __STRATEGY_STRESS_FIRST_SEED__ + 999;
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
      decisions += state.strategyDecisions.length;
    }
    expect(failures).toEqual([]);
    expect(decisions).toBeGreaterThanOrEqual(500);
  }, 30_000);

  it("resolves sampled multiway postflop nodes without an unexplained fallback", () => {
    const input = replayFixture("four-way-three-checks-to-button", __STRATEGY_STRESS_FIRST_SEED__);
    input.ranges = snapshotRangeLedger(buildRangeLedger(input.state));
    const failures: string[] = [];
    for (let offset = 0; offset < 6; offset += 1) {
      const request = structuredClone(input);
      request.state.seed += offset;
      const result = createLocalStrategyEngine().decide(request);
      if (result.strategyVersion !== "multiway-resolver-v1" || result.source !== "multiway-resolver") {
        failures.push(`${request.state.seed}:${result.source}/${result.strategyVersion}`);
      }
      if (!result.actions.length || result.actions.some((action) =>
        !Number.isFinite(action.ev) || !Number.isFinite(action.frequency)
      )) failures.push(`${request.state.seed}:非法策略数值`);
    }
    expect(failures).toEqual([]);
  }, 30_000);
});
