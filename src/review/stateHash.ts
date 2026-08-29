import { sha256Hex } from "../strategy/sha256";
import type { DeepReviewInput } from "./types";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function deepReviewStateHash(input: DeepReviewInput): string {
  return sha256Hex(JSON.stringify(stableValue(input)));
}
