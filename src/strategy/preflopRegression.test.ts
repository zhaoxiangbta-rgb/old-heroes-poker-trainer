import { describe, expect, it } from "vitest";
import type { Card } from "../engine/cards";
import type { Position } from "../game/game";
import { lookupPreflopBlueprint } from "./preflopBlueprint";
import type { PreflopNode, PreflopSpot, PreflopStackBucket } from "./types";

function node(
  spot: PreflopSpot,
  position: Position,
  stack: PreflopStackBucket = 100,
  openerPosition: Position = "UTG",
): PreflopNode {
  return {
    spot,
    actingPosition: position,
    openerPosition,
    lastAggressorPosition: openerPosition,
    raiseCount: spot === "unopened" || spot === "isolate-limpers" ? 0 : 1,
    coldCallers: spot === "squeeze" ? 1 : 0,
    limpers: spot === "isolate-limpers" ? 2 : 0,
    effectiveStackBb: stack,
    stack: { lower: stack, upper: stack, weight: 0 },
    inPosition: position === "BTN" || position === "CO",
    nodeId: `regression:${spot}:${position}:${stack}`,
  };
}

function frequency(
  spot: PreflopSpot,
  position: Position,
  hole: [Card, Card],
  actions: string[],
  stack: PreflopStackBucket = 100,
) {
  return lookupPreflopBlueprint(node(spot, position, stack), hole).actions
    .filter((item) => actions.includes(item.action))
    .reduce((sum, item) => sum + item.frequency, 0);
}

describe("preflop real-play regression set", () => {
  it("does not make button opening as tight as under-the-gun", () => {
    const hand: [Card, Card] = ["8h", "7h"];
    expect(frequency("unopened", "BTN", hand, ["raise"])).toBeGreaterThan(0.5);
    expect(frequency("unopened", "UTG", hand, ["raise"])).toBeLessThan(0.2);
  });

  it("does not treat big-blind defense as an out-of-position cold call", () => {
    const hand: [Card, Card] = ["Kh", "Tc"];
    expect(frequency("blind-defense", "BB", hand, ["call", "raise"])).toBeGreaterThan(
      frequency("facing-open", "CO", hand, ["call", "raise"]) + 0.2,
    );
  });

  it("does not auto-call a squeeze or auto-reraise a deep four-bet", () => {
    expect(frequency("squeeze", "BTN", ["Ah", "Jc"], ["fold"])).toBeGreaterThan(0.4);
    expect(frequency("squeeze", "BTN", ["Kh", "Qc"], ["fold"])).toBeGreaterThan(0.4);
    expect(frequency("facing-4bet", "CO", ["Jh", "Th"], ["all-in"])).toBeLessThan(0.15);
  });

  it("uses short-stack premium jams and isolates limpers actively", () => {
    expect(frequency("facing-3bet", "BTN", ["As", "Ad"], ["all-in"], 25)).toBeGreaterThan(0.5);
    expect(frequency("isolate-limpers", "CO", ["Ah", "9h"], ["raise"])).toBeGreaterThan(0.7);
  });

  it("looks up 10,000 embedded nodes with sub-20ms median latency", () => {
    const durations: number[] = [];
    const target = node("facing-open", "BB");
    for (let index = 0; index < 10_000; index += 1) {
      const started = performance.now();
      lookupPreflopBlueprint(target, index % 2 ? ["Ah", "Jc"] : ["8h", "7h"]);
      durations.push(performance.now() - started);
    }
    durations.sort((first, second) => first - second);
    expect(durations[Math.floor(durations.length / 2)]).toBeLessThan(20);
  });
});
