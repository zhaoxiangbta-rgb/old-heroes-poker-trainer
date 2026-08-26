import { invoke } from "@tauri-apps/api/core";
import type { LanServiceClient, LanStatus } from "./types";

export function createNativeLanService(): LanServiceClient {
  return {
    status: () => invoke<LanStatus>("get_lan_mobile_status"),
    start: () => invoke<LanStatus>("start_lan_mobile"),
    stop: () => invoke<void>("stop_lan_mobile"),
    rotate: () => invoke<LanStatus>("rotate_lan_mobile_token"),
  };
}
