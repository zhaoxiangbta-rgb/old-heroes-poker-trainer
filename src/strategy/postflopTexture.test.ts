import { describe, expect, it } from "vitest";
import { classifyPostflopTexture } from "./postflopTexture";

describe("postflop board texture", () => {
  it("collapses suit-permuted boards into the same strategic texture", () => {
    const first = classifyPostflopTexture(["Ah", "Kd", "2c"]);
    const permuted = classifyPostflopTexture(["As", "Kh", "2d"]);

    expect(first.canonicalBoard).toEqual(["Aa", "Kb", "2c"]);
    expect(permuted.canonicalBoard).toEqual(first.canonicalBoard);
    expect(permuted.clusterId).toBe(first.clusterId);
  });

  it("separates monotone, paired and highly connected textures", () => {
    const rainbow = classifyPostflopTexture(["Ah", "Kd", "2c"]);
    const monotone = classifyPostflopTexture(["Ah", "Kh", "2h"]);
    const paired = classifyPostflopTexture(["Ah", "Ad", "2c"]);
    const connected = classifyPostflopTexture(["9h", "8d", "7c", "6s"]);

    expect(monotone).toMatchObject({ monotone: true, twoTone: false });
    expect(paired.paired).toBe(true);
    expect(connected.connectedness).toBeGreaterThan(rainbow.connectedness);
    expect(new Set([
      rainbow.clusterId,
      monotone.clusterId,
      paired.clusterId,
      connected.clusterId,
    ])).toHaveLength(4);
  });

  it("tracks street and wetness without treating a dry ace-high flop as coordinated", () => {
    const dry = classifyPostflopTexture(["As", "7d", "2c"]);
    const wetTurn = classifyPostflopTexture(["9s", "8s", "7d", "6d"]);

    expect(dry).toMatchObject({ street: "flop", highCard: 14, paired: false });
    expect(wetTurn.street).toBe("turn");
    expect(wetTurn.wetness).toBeGreaterThan(dry.wetness);
  });

  it("rejects incomplete, oversized or duplicate public boards", () => {
    expect(() => classifyPostflopTexture(["Ah", "Kd"])).toThrow(/3 至 5/);
    expect(() => classifyPostflopTexture(["Ah", "Kd", "2c", "3s", "4h", "5d"])).toThrow(/3 至 5/);
    expect(() => classifyPostflopTexture(["Ah", "Kd", "Ah"])).toThrow(/重复/);
  });
});
