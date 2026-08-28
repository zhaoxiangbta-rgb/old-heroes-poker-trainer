import type { PolicyAction, PolicyCandidate, PolicyIntent } from "../policy/types";

export type WeaknessTag =
  | "overcalling"
  | "squeeze-call-too-wide"
  | "multiway-top-pair"
  | "slow-play-strong-hand"
  | "bet-means-nuts"
  | "missed-worse-calls"
  | "river-value-bluff-confusion"
  | "dirty-outs"
  | "players-behind";

export const WEAKNESS_DEFINITIONS: Record<
  WeaknessTag,
  { name: string; description: string }
> = {
  overcalling: { name: "平跟过多", description: "识别低质量跟注与可盈利的加注、弃牌。" },
  "squeeze-call-too-wide": { name: "面对挤压跟注过宽", description: "在 squeeze 底池中收紧被支配的继续范围。" },
  "multiway-top-pair": { name: "多人池高估顶对", description: "根据人数和压力调整单对的价值。" },
  "slow-play-strong-hand": { name: "强牌慢打", description: "在有价值和保护需求时及时建池。" },
  "bet-means-nuts": { name: "把下注等同坚果", description: "不把普通下注误读为只有最强牌。" },
  "missed-worse-calls": { name: "忽略更差跟注范围", description: "识别河牌薄价值和合理尺寸。" },
  "river-value-bluff-confusion": { name: "河牌价值/诈唬混淆", description: "明确下注是为了更差跟注还是更好弃牌。" },
  "dirty-outs": { name: "脏补牌判断", description: "排除会帮助对手或带来反向隐含赔率的补牌。" },
  "players-behind": { name: "忽略身后玩家", description: "把未行动玩家的跟注和加注风险纳入决策。" },
};

export type TrainingTarget =
  | { mode: "none" }
  | { mode: "automatic" | "manual"; tag: WeaknessTag };

export type AssessmentSeverity = "good" | "review" | "major";
export type AssessmentStatus = "ready" | "failed";

export type DecisionAssessment = {
  id: string;
  handNo: number;
  logIndex: number;
  street: "preflop" | "flop" | "turn" | "river";
  actual: PolicyAction;
  recommended: PolicyAction;
  candidates: PolicyCandidate[];
  normalizedEvLoss: number;
  severity: AssessmentSeverity;
  intent: PolicyIntent;
  tags: WeaknessTag[];
  coreRules: string[];
  facts: Record<string, unknown>;
  scored: boolean;
};
