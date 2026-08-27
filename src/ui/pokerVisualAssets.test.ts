import { describe, expect, it } from "vitest";
import { POKER_CONTROL_ASSETS, playerPortraitFor, wagerChipFor } from "./pokerVisualAssets";

describe("shared poker visual assets", () => {
  it("keeps stable player identities and deterministic fallbacks", () => {
    expect(playerPortraitFor("friend-01", 5)).toBe("/assets/poker-visuals/avatars/player-01.png");
    expect(playerPortraitFor("unknown", 2)).toBe("/assets/poker-visuals/avatars/player-03.png");
  });

  it("exposes five wager colors and four action chips", () => {
    expect(new Set(Array.from({ length: 6 }, (_, seat) => wagerChipFor(seat))).size).toBe(5);
    expect(POKER_CONTROL_ASSETS.fold).toContain("/controls/fold.png");
    expect(POKER_CONTROL_ASSETS.check).toContain("/controls/check.png");
    expect(POKER_CONTROL_ASSETS.primary).toContain("/controls/primary.png");
    expect(POKER_CONTROL_ASSETS.allIn).toContain("/controls/all-in.png");
    expect(POKER_CONTROL_ASSETS.sizingPlaque).toContain("/controls/sizing-plaque.png");
  });
});
