import { describe, expect, it } from "vitest";
import type { PostflopHandBucket } from "./postflopHandBucket";
import type { HeadsUpPostflopNode } from "./postflopNode";
import { lookupPostflopBlueprint } from "./postflopBlueprint";
import { resolveHeadsUpPostflop } from "./postflopResolver";
import { replayFixture } from "./replayFixtures";

const node: HeadsUpPostflopNode = {
  street: "turn",
  potType: "srp",
  inPosition: true,
  initiative: false,
  line: "facing-bet",
  facingFraction: 2,
  textureCluster: "pftex1:turn:premium:unpaired:two-tone:disconnected",
  nodeId: "extreme-overbet",
};

const bucket: PostflopHandBucket = {
  tier: "strong-draw",
  made: "high-card",
  drawClass: "flush-draw",
  nutPotential: 0.55,
  blockerScore: 0.35,
  cleanOuts: 9,
  equity: 0.44,
  publicMadeHand: false,
  bucketId: "nut-draw",
};

describe("bounded heads-up postflop resolver", () => {
  it("reweights an extreme overbet deterministically without removing every continue", () => {
    const request = replayFixture("turn-overbet-nut-flush-draw");
    const base = lookupPostflopBlueprint(node, bucket, request.state);
    const first = resolveHeadsUpPostflop(base, request, node, bucket);
    const replay = resolveHeadsUpPostflop(base, request, node, bucket);

    expect(first).toEqual(replay);
    expect(first.source).toBe("blueprint+resolver");
    expect(first.actions.some((action) => action.action === "call" && action.frequency > 0)).toBe(true);
    expect(first.actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1, 10);
  });

  it("returns the available blueprint immediately when the budget is exhausted", () => {
    const request = replayFixture("turn-overbet-nut-flush-draw");
    request.deadlineMs = 1;
    const base = lookupPostflopBlueprint(node, bucket, request.state);
    expect(resolveHeadsUpPostflop(base, request, node, bucket)).toEqual(base);
  });
});
