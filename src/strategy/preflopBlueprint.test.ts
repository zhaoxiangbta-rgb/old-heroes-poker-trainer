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
    limpers: spot === "isolate-limpers" ? 1 : 0,
    effectiveStackBb: stack,
    stack: { lower: stack, upper: stack, weight: 0 },
    inPosition: position === "BTN" || position === "CO",
    nodeId: `test:${spot}:${position}:${stack}`,
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

describe("preflop abstract blueprint", () => {
  it("normalizes every returned mix", () => {
    for (const spot of ["unopened", "facing-open", "blind-defense", "squeeze", "facing-3bet", "facing-4bet"] as const) {
      const mix = lookupPreflopBlueprint(node(spot, "BTN"), ["Ah", "Kd"]);
      expect(mix.actions.reduce((sum, item) => sum + item.frequency, 0)).toBeCloseTo(1, 10);
      expect(mix.actions.every((item) => item.frequency >= 0 && Number.isFinite(item.ev))).toBe(true);
    }
  });

  it("opens wider on the button than under the gun", () => {
    const hand: [Card, Card] = ["8h", "7h"];
    expect(frequency("unopened", "BTN", hand, ["raise"])).toBeGreaterThan(
      frequency("unopened", "UTG", hand, ["raise"]),
    );
  });

  it("keeps premiums and releases dominated trash versus early opens", () => {
    expect(frequency("unopened", "UTG", ["As", "Ad"], ["fold"])).toBeLessThan(0.01);
    expect(frequency("facing-open", "CO", ["As", "Ad"], ["fold"])).toBeLessThan(0.01);
    expect(frequency("facing-open", "CO", ["7h", "2c"], ["fold"])).toBeGreaterThan(0.95);
  });

  it("defends the big blind wider than a cold caller", () => {
    const hand: [Card, Card] = ["Kh", "Tc"];
    const defend = frequency("blind-defense", "BB", hand, ["call", "raise"]);
    const coldCall = frequency("facing-open", "CO", hand, ["call", "raise"]);
    expect(defend).toBeGreaterThan(coldCall);
  });

  it("does not mechanically call squeezes or continue a deep raise war", () => {
    expect(frequency("squeeze", "BTN", ["Ah", "Jc"], ["fold"])).toBeGreaterThan(0.4);
    expect(frequency("facing-4bet", "CO", ["Jh", "Th"], ["all-in", "call"])).toBeLessThan(0.35);
  });

  it("uses short-stack all-ins at the top of range", () => {
    expect(frequency("facing-3bet", "BTN", ["As", "Ad"], ["all-in"], 25)).toBeGreaterThan(0.5);
  });

  it("marks between-bucket lookup as interpolation", () => {
    const interpolated = node("facing-open", "BTN", 60);
    interpolated.effectiveStackBb = 80;
    interpolated.stack = { lower: 60, upper: 100, weight: 0.5 };
    expect(lookupPreflopBlueprint(interpolated, ["Qh", "Js"]).source).toBe("interpolated");
    expect(lookupPreflopBlueprint(node("facing-open", "BTN", 100), ["Qh", "Js"]).source).toBe("blueprint");
  });
});
