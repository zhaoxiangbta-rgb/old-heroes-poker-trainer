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

  it("replaces the same hand after deep review state changes", async () => {
    const repository = createMemoryRepository();
    const first = completed(7);
    await repository.saveHand(first);

    const reviewed = structuredClone(first);
    reviewed.deepReviewStatus = "cancelled";
    await repository.replaceHand(reviewed);

    const rows = await repository.loadHands();
    expect(rows).toHaveLength(1);
    expect(rows[0].deepReviewStatus).toBe("cancelled");
  });

  it("round-trips coach review v2 while preserving legacy v1 reviews", async () => {
    const repository = createMemoryRepository();
    const reviewed = completed(8);
    reviewed.deepReviewStatus = "completed";
    reviewed.deepReview = {
      version: 2,
      status: "completed",
      handNo: reviewed.handNo,
      seed: reviewed.seed,
      stateHash: "coach-v2",
      strategyVersion: reviewed.strategyVersion,
      calculatorVersion: "deep-review-v2",
      completedAt: "2026-08-29T00:00:00.000Z",
      summary: {
        grade: "良好",
        totalNormalizedEvLoss: 0,
        strongestPoint: "范围判断清楚",
        priorityCorrection: "保持当前思路",
        confidence: 1,
        precision: "exact",
      },
      decisions: [{
        id: "1:0", logIndex: 0, street: "flop", position: "BTN", pot: 20,
        spr: 6, activePlayers: 2, playersBehind: 0,
        actual: { type: "call" }, recommended: { type: "call" }, candidates: [],
        normalizedEvLoss: 0, equity: 0.6, requiredEquity: 0.25,
        cleanOuts: 2, dirtyOuts: 0, ranges: {}, precision: "exact",
        samples: 1081, coverage: 1, confidence: 1, tags: [], correctThinking: [],
        corrections: [], coreRule: "按范围决策。",
        coach: {
          madeHandLabel: "顶对", heroRangePercentile: 0.68,
          equityVsFullRange: 0.6, equityVsContinueRange: 0.48,
          opponentBuckets: [{ kind: "top-pair", probability: 1 }],
          opponentResponses: [{ action: "call", probability: 1 }],
          atLeastOnePlayerBehindContinues: null, runoutSummary: [],
          recommendationReasons: ["跟注价格合适"], changeConditions: ["对手改为大额下注"],
          confidence: 1, narrative: "你的顶对领先对手大部分范围。",
        },
      }],
    };
    await repository.saveHand(reviewed);
    expect((await repository.loadHands())[0].deepReview).toMatchObject({
      version: 2,
      decisions: [{ coach: { madeHandLabel: "顶对" } }],
    });

    const legacy = completed(9);
    legacy.deepReviewStatus = "completed";
    legacy.deepReview = {
      ...reviewed.deepReview,
      version: 1,
      handNo: legacy.handNo,
      seed: legacy.seed,
      decisions: reviewed.deepReview.decisions.map((decision) => {
        const { coach, ...legacyDecision } = decision;
        void coach;
        return legacyDecision;
      }),
    };
    await repository.saveHand(legacy);
    const rows = await repository.loadHands();
    expect(rows.find((row) => row.seed === 9)?.deepReview?.version).toBe(1);
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
