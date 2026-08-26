export type LanStatus = {
  running: boolean;
  port: number;
  bootstrapUrl: string | null;
  fallbackUrls: string[];
  activeSessions: number;
  mdnsAvailable: boolean;
};

export interface LanServiceClient {
  status(): Promise<LanStatus>;
  start(): Promise<LanStatus>;
  stop(): Promise<void>;
  rotate(): Promise<LanStatus>;
}
