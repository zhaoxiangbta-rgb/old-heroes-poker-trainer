import type { AiLiveCoachState } from "../ai/useAiLiveCoach";

const MOBILE_AI_DISABLED: AiLiveCoachState = { status: "idle" };

export function useAiLiveCoach(): AiLiveCoachState {
  return MOBILE_AI_DISABLED;
}
