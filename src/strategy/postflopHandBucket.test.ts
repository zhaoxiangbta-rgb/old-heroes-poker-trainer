import { describe, expect, it } from "vitest";
import { buildWeightedRange, removeBlocked } from "../engine/ranges";
import { bucketPostflopHand } from "./postflopHandBucket";

describe("heads-up postflop hand buckets", () => {
  it("separates nut-like made hands, top pair and weak showdown value", () => {
    const range = removeBlocked(
      buildWeightedRange("AA,KK,QQ,AKs,AQo,76s"),
      ["Ah", "Ad", "Kh", "7c", "2s"],
    );
    const set = bucketPostflopHand(["Kc", "Ks"], ["Kh", "7c", "2s"], range);
    const topPair = bucketPostflopHand(["Kc", "Qd"], ["Kh", "7c", "2s"], range);
    const underPair = bucketPostflopHand(["6c", "6d"], ["Kh", "7c", "2s"], range);

    expect(set.tier).toMatch(/nuts|strong/);
    expect(topPair.tier).toBe("medium");
    expect(underPair.tier).toMatch(/showdown|weak/);
    expect(set.equity).toBeGreaterThan(topPair.equity);
  });

  it("distinguishes nut flush draws, weaker draws and air", () => {
    const board = ["Jh", "7h", "2c"];
    const range = removeBlocked(buildWeightedRange("AA,KK,QQ,AJ,JT,98s,76s"), board);
    const nutDraw = bucketPostflopHand(["Ah", "Qh"], board, range);
    const weakDraw = bucketPostflopHand(["9h", "8h"], board, range);
    const air = bucketPostflopHand(["4c", "3d"], board, range);

    expect(nutDraw.drawClass).toBe("flush-draw");
    expect(nutDraw.nutPotential).toBeGreaterThan(weakDraw.nutPotential);
    expect(weakDraw.cleanOuts).toBeGreaterThan(air.cleanOuts);
    expect(air.tier).toBe("air");
  });

  it("does not award a public river hand as private nuts", () => {
    const board = ["Ah", "Kd", "Qc", "Js", "Th"];
    const range = removeBlocked(buildWeightedRange("99,88,76s,A2s"), board);
    const bucket = bucketPostflopHand(["4c", "3d"], board, range);

    expect(bucket.publicMadeHand).toBe(true);
    expect(bucket.tier).not.toBe("nuts");
    expect(bucket.equity).toBeGreaterThan(0);
  });

  it("keeps suit-permuted hands in the same strategic bucket", () => {
    const first = bucketPostflopHand(
      ["Ah", "Qh"],
      ["Jh", "7h", "2c"],
      removeBlocked(buildWeightedRange("AA,KK,QQ,AJ,JT"), ["Ah", "Qh", "Jh", "7h", "2c"]),
    );
    const second = bucketPostflopHand(
      ["As", "Qs"],
      ["Js", "7s", "2d"],
      removeBlocked(buildWeightedRange("AA,KK,QQ,AJ,JT"), ["As", "Qs", "Js", "7s", "2d"]),
    );

    expect(second.bucketId).toBe(first.bucketId);
  });
});
