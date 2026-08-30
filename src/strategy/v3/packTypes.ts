import type { Position } from "../../game/game";
import type { PreflopStackBucket, PreflopSpot } from "../types";

export type StrategyPackKind = "desktop" | "mobile";

export type StrategyProvenance =
  | "expert-baseline-v3"
  | "validated-reference"
  | "local-solve"
  | "interpolated-v3";

export type PackedAction = {
  kind: "fold" | "check" | "call" | "raise" | "all-in";
  sizeCode: number;
  frequencyQ: number;
  evMilliBb?: number;
};

export type PackedPreflopHand = {
  hand: string;
  source: StrategyProvenance;
  actions: PackedAction[];
};

export type PackedPreflopNode = {
  id: string;
  spot: PreflopSpot;
  position: Position;
  stack: PreflopStackBucket;
  hands: PackedPreflopHand[];
};

export type PackedPostflopNode = {
  id: string;
  [key: string]: unknown;
};

export type StrategyPackPayloadV3 = {
  preflop: { nodes: PackedPreflopNode[] };
  postflop: { nodes: PackedPostflopNode[] };
};

export type StrategyPackSource = StrategyPackPayloadV3 & {
  strategyVersion: string;
  sourceVersion: string;
  compilerVersion: string;
  packKind: StrategyPackKind;
  minimumAppVersion: string;
};

export type StrategyPackManifestV3 = {
  schemaVersion: 3;
  strategyVersion: string;
  sourceVersion: string;
  compilerVersion: string;
  packKind: StrategyPackKind;
  nodeCount: number;
  sha256: string;
  minimumAppVersion: string;
};

export type PackExpectation = {
  schemaVersion: 3;
  appVersion: string;
  packKind: StrategyPackKind;
};

export type LoadedStrategyPack = StrategyPackPayloadV3 & {
  manifest: StrategyPackManifestV3;
};
