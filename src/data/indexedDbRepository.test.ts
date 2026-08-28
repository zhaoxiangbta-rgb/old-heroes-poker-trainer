// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { normalizeGameplaySettings } from "../ui/tableThemes";
import { createIndexedDbRepository } from "./indexedDbRepository";

describe("mobile IndexedDB repository", () => {
  it("deduplicates hands and isolates database names", async () => {
    const indexedDB = new IDBFactory();
    const first = createIndexedDbRepository({ databaseName: "phone-a", indexedDB });
    const hand = newGame(7);
    await first.saveHand(hand);
    await first.saveHand(hand);
    expect((await first.loadHands()).map((item) => item.seed)).toEqual([7]);
    const second = createIndexedDbRepository({ databaseName: "phone-b", indexedDB });
    expect(await second.loadHands()).toEqual([]);
  });

  it("round-trips a v7 document atomically with settings", async () => {
    const indexedDB = new IDBFactory();
    const source = createIndexedDbRepository({ databaseName: "source", indexedDB });
    await source.saveHand(newGame(9));
    await source.saveGameplaySettings(normalizeGameplaySettings({ tableProfileId: "loose-wild" }));
    const document = await source.exportDocument();

    const target = createIndexedDbRepository({ databaseName: "target", indexedDB });
    expect(await target.importDocument(document)).toEqual({ cancelled: false, imported: 1, skipped: 0, gameplaySettings: expect.objectContaining({ tableProfileId: "loose-wild" }) });
    expect((await target.loadHands())[0].seed).toBe(9);
  });

  it("never persists model credentials", async () => {
    const repository = createIndexedDbRepository({ databaseName: "safe", indexedDB: new IDBFactory() });
    await repository.saveApiKey("SENTINEL-MOBILE-SECRET");
    expect(await repository.hasApiKey()).toBe(false);
    expect(await repository.loadModelSettings()).toEqual({ baseUrl: "", model: "" });
  });

  it("restores hands and gameplay settings after the mobile app is recreated", async () => {
    const indexedDB = new IDBFactory();
    const firstLaunch = createIndexedDbRepository({ databaseName: "restart", indexedDB });
    await firstLaunch.saveHand(newGame(27));
    await firstLaunch.saveGameplaySettings(normalizeGameplaySettings({ tableProfileId: "friends" }));

    const secondLaunch = createIndexedDbRepository({ databaseName: "restart", indexedDB });
    expect((await secondLaunch.loadHands()).map((hand) => hand.seed)).toEqual([27]);
    expect((await secondLaunch.loadGameplaySettings()).tableProfileId).toBe("friends");
  });
});
