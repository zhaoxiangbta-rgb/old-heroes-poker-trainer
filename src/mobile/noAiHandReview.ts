import type { AiHandReviewRuntime } from "../ai/useAiHandReview";

const MOBILE_AI_DISABLED: AiHandReviewRuntime = {
  status: "not-started",
  retry() {},
};

export function useAiHandReview(): AiHandReviewRuntime {
  return MOBILE_AI_DISABLED;
}
