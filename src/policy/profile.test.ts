import { describe, expect, it } from "vitest";
import { STANDARD_PROFILE } from "./profile";

describe("policy profile boundary", () => {
  it("uses one neutral immutable profile in phase one", () => {
    expect(STANDARD_PROFILE.id).toBe("STANDARD");
    expect(STANDARD_PROFILE.aggression).toBe(1);
    expect(STANDARD_PROFILE.bluff).toBe(1);
    expect(Object.isFrozen(STANDARD_PROFILE)).toBe(true);
  });
});
