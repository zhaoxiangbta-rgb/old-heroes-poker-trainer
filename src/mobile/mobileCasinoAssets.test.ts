import { describe, expect, it } from "vitest";
import { MOBILE_PORTRAITS, mobilePortraitFor } from "./mobileCasinoAssets";

describe("mobile casino assets", () => {
  it("provides six stable local portraits", () => {
    expect(MOBILE_PORTRAITS).toHaveLength(6);
    expect(new Set(MOBILE_PORTRAITS).size).toBe(6);
    expect(mobilePortraitFor("same-id", 3)).toBe(mobilePortraitFor("same-id", 0));
    expect(mobilePortraitFor("other-id", 3)).toMatch(/^\/assets\/mobile-casino\/avatars\//);
  });
});
