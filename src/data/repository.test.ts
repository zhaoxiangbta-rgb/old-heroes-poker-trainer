// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../game/game";
import { createMemoryRepository } from "./memoryRepository";
import { normalizeGameplaySettings } from "../ui/tableThemes";
import { DEFAULT_PLAYER_PROFILES } from "../policy/playerProfiles";

function completed(seed: number, handNo = 1): GameState {
  const hand = newGame(seed);
  hand.handNo = handNo;
  hand.phase = "review";
  hand.result = { reason: "fold", winners: [0], summary: `牌局 ${seed}` };
  return hand;
}

describe("memory desktop repository", () => {
  it("is a non-persistent preview with idempotent newest-first hands", async () => {
    const repository = createMemoryRepository();
    expect(repository.mode).toBe("preview");
    expect(await repository.loadHands()).toEqual([]);

    await repository.saveHand(completed(1));
    await repository.saveHand(completed(2));
    await repository.saveHand(completed(1));
    expect((await repository.loadHands()).map((hand) => hand.seed)).toEqual([2, 1]);
  });

  it("clears hands without clearing settings and never stores the API key", async () => {
    const repository = createMemoryRepository();
    await repository.saveHand(completed(1));
    await repository.saveModelSettings({ baseUrl: "http://localhost:9000", model: "local" });
    await repository.saveApiKey("SENTINEL-DESKTOP-SECRET");
    expect(await repository.hasApiKey()).toBe(false);
    await repository.clearHands();
    expect(await repository.loadHands()).toEqual([]);
    expect(await repository.loadModelSettings()).toEqual({
      baseUrl: "http://localhost:9000",
      model: "local",
    });
    expect(JSON.stringify(repository)).not.toContain("SENTINEL-DESKTOP-SECRET");
  });

  it("round-trips gameplay settings separately and preserves them when history is cleared", async () => {
    const repository = createMemoryRepository();
    expect(await repository.loadGameplaySettings()).toEqual({
      tableProfileId: "balanced",
      tableThemeId: "classic-green",
      teachingPanelWidth: 350,
      playerProfiles: DEFAULT_PLAYER_PROFILES,
    });
    await repository.saveGameplaySettings(normalizeGameplaySettings({
      tableProfileId: "loose-wild",
      tableThemeId: "wine-red",
      teachingPanelWidth: 480,
    }));
    await repository.saveHand(completed(3));
    await repository.clearHands();
    expect(await repository.loadHands()).toEqual([]);
    expect(await repository.loadGameplaySettings()).toEqual({
      tableProfileId: "loose-wild",
      tableThemeId: "wine-red",
      teachingPanelWidth: 480,
      playerProfiles: DEFAULT_PLAYER_PROFILES,
    });
    expect(await repository.loadModelSettings()).toEqual({
      baseUrl: "http://127.0.0.1:8317",
      model: "gpt-local",
    });
  });

  it("normalizes unsupported themes and clamps teaching panel widths", () => {
    expect(normalizeGameplaySettings({
      tableProfileId: "balanced",
      tableThemeId: "neon" as never,
      teachingPanelWidth: 900,
    })).toEqual({
      tableProfileId: "balanced",
      tableThemeId: "classic-green",
      teachingPanelWidth: 520,
      playerProfiles: DEFAULT_PLAYER_PROFILES,
    });
  });

  it("round-trips renamed player profiles without exposing mutable storage", async () => {
    const repository = createMemoryRepository();
    const renamed = DEFAULT_PLAYER_PROFILES.map((profile) =>
      profile.playerId === "friend-01"
        ? { ...profile, displayName: "岚风" }
        : { ...profile },
    );
    await repository.saveGameplaySettings(
      normalizeGameplaySettings({ playerProfiles: renamed }),
    );
    const first = await repository.loadGameplaySettings();
    expect(first.playerProfiles).toEqual(renamed);
    first.playerProfiles[0].displayName = "被外部改坏";
    expect((await repository.loadGameplaySettings()).playerProfiles[0].displayName).toBe(
      "岚风",
    );
  });
});
