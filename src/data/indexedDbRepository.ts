import { normalizeGameState, type GameState } from "../game/game";
import { normalizeGameplaySettings } from "../ui/tableThemes";
import { decodeTrainingExport, encodeTrainingExport, handKey } from "./exportDocument";
import type { GameplaySettings, ImportHandsResult, MobileRepository } from "./types";

export type IndexedDbRepositoryOptions = { databaseName?: string; indexedDB?: IDBFactory };
const DATABASE_VERSION = 1;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("手机存储不可用"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("手机存储写入失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("手机存储写入已取消"));
  });
}

export function createIndexedDbRepository({
  databaseName = "old-heroes-mobile-v1",
  indexedDB = window.indexedDB,
}: IndexedDbRepositoryOptions = {}): MobileRepository {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("hands"))
        request.result.createObjectStore("hands", { keyPath: "key" });
      if (!request.result.objectStoreNames.contains("settings"))
        request.result.createObjectStore("settings");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("手机存储不可用"));
  });

  const loadHands = async () => {
    const db = await open();
    try {
      const rows = await requestResult<Array<{ key: string; savedAt: number; hand: GameState }>>(
        db.transaction("hands").objectStore("hands").getAll(),
      );
      return rows.sort((a, b) => b.savedAt - a.savedAt)
        .map((row) => normalizeGameState(structuredClone(row.hand)));
    } finally { db.close(); }
  };

  const loadGameplaySettings = async () => {
    const db = await open();
    try {
      const value = await requestResult<Partial<GameplaySettings> | undefined>(
        db.transaction("settings").objectStore("settings").get("gameplay"),
      );
      return normalizeGameplaySettings(value ?? {});
    } finally { db.close(); }
  };

  const repository: MobileRepository = {
    mode: "mobile",
    loadHands,
    async saveHand(hand) {
      const db = await open();
      try {
        const tx = db.transaction("hands", "readwrite");
        const store = tx.objectStore("hands");
        if (!await requestResult(store.get(handKey(hand))))
          store.put({ key: handKey(hand), savedAt: Date.now(), hand: normalizeGameState(structuredClone(hand)) });
        await transactionDone(tx);
      } finally { db.close(); }
    },
    async replaceHand(hand) {
      const db = await open();
      try {
        const tx = db.transaction("hands", "readwrite");
        const store = tx.objectStore("hands");
        const key = handKey(hand);
        const current = await requestResult<{ key: string; savedAt: number; hand: GameState } | undefined>(store.get(key));
        if (!current) {
          tx.abort();
          throw new Error("待更新牌局不存在");
        }
        store.put({ key, savedAt: current.savedAt, hand: normalizeGameState(structuredClone(hand)) });
        await transactionDone(tx);
      } finally { db.close(); }
    },
    async clearHands() {
      const db = await open();
      try { const tx = db.transaction("hands", "readwrite"); tx.objectStore("hands").clear(); await transactionDone(tx); }
      finally { db.close(); }
    },
    loadGameplaySettings,
    async saveGameplaySettings(settings) {
      const db = await open();
      try { const tx = db.transaction("settings", "readwrite"); tx.objectStore("settings").put(normalizeGameplaySettings(settings), "gameplay"); await transactionDone(tx); }
      finally { db.close(); }
    },
    async exportDocument() { return encodeTrainingExport({ hands: await loadHands(), gameplaySettings: await loadGameplaySettings() }); },
    async importDocument(json): Promise<ImportHandsResult> {
      const document = decodeTrainingExport(json);
      const db = await open();
      let imported = 0, skipped = 0;
      try {
        const tx = db.transaction(["hands", "settings"], "readwrite");
        const hands = tx.objectStore("hands");
        for (const hand of document.hands) {
          if (await requestResult(hands.get(handKey(hand)))) skipped += 1;
          else { hands.put({ key: handKey(hand), savedAt: Date.now() + imported, hand }); imported += 1; }
        }
        tx.objectStore("settings").put(document.gameplaySettings, "gameplay");
        await transactionDone(tx);
      } finally { db.close(); }
      return { cancelled: false, imported, skipped, gameplaySettings: document.gameplaySettings };
    },
    async exportHands() {
      const hands = await loadHands();
      const json = encodeTrainingExport({ hands, gameplaySettings: await loadGameplaySettings() });
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `老英雄牌局-手机备份-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return { cancelled: false, count: hands.length };
    },
    async importHands() {
      const file = await new Promise<File | undefined>((resolve) => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = "application/json,.json";
        input.onchange = () => resolve(input.files?.[0]);
        input.click();
      });
      if (!file) return { cancelled: true, imported: 0, skipped: 0 };
      return repository.importDocument(await file.text());
    },
    async loadModelSettings() { return { baseUrl: "", model: "" }; },
    async saveModelSettings() {},
    async hasApiKey() { return false; },
    async saveApiKey() {},
    async testModelConnection() { throw new Error("移动版完全离线"); },
  };
  return repository;
}
