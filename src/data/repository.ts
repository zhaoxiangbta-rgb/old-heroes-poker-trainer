import { isTauri } from "@tauri-apps/api/core";
import { createMemoryRepository } from "./memoryRepository";
import { createNativeRepository } from "./nativeRepository";
import type { DesktopRepository } from "./types";

export function createRepository(): DesktopRepository {
  return isTauri() ? createNativeRepository() : createMemoryRepository();
}

export type { DesktopRepository } from "./types";
