import { describe, expect, it } from "vitest";
import type { AiLiveFactPackV1, AiReviewFactPackV1 } from "./types";
import { parseAiLiveOutput, parseAiReviewOutput } from "./parseModelOutput";

const liveFacts: AiLiveFactPackV1 = {
  version: 1, kind: "live", stateHash: "state-44", handNo: 1, street: "flop",
  position: "庄位", heroHole: ["Jh", "2d"], board: ["Ac", "4s", "4h"],
  pot: 6, price: { callAmount: 2, pot: 6, callFractionOfPot: "33.3%" },
  hero: { currentHand: "公共牌一对，底牌未改善", privateContribution: false, upgrades: [] },
  opponents: [{ playerId: "friend-02", name: "北辰", actionLine: "下注到2", buckets: [{ label: "强价值", probability: "31%" }], confidence: "72%" }],
  recommendation: { key: "fold", label: "弃牌" },
  allowedNumbers: ["1", "2", "4", "6", "31", "33.3", "44", "72"],
};

describe("AI output guard", () => {
  it("accepts a matching live JSON object and strips a markdown fence", () => {
    const raw = "```json\n" + JSON.stringify({
      version: 1, stateHash: "state-44", currentHand: "公共牌一对，底牌未改善",
      reasoning: ["跟注价格是底池的33.3%，但你没有私有对子。"],
      opponentRead: ["对手强价值约31%。"], risks: ["不要把公共牌对子当成自己命中。"],
      recommendationRestatement: "建议弃牌。",
    }) + "\n```";
    expect(parseAiLiveOutput(raw, liveFacts)).toMatchObject({ stateHash: "state-44", currentHand: "公共牌一对，底牌未改善" });
  });

  it("rejects invented numbers, changed actions, exact hidden cards and stale state", () => {
    const base = {
      version: 1, stateHash: "state-44", currentHand: "公共牌一对，底牌未改善",
      reasoning: ["价格33.3%"], opponentRead: ["对手有强价值"], risks: [], recommendationRestatement: "建议弃牌",
    };
    expect(() => parseAiLiveOutput(JSON.stringify({ ...base, reasoning: ["你有89%胜率"] }), liveFacts)).toThrow("未经本地确认的数字");
    expect(() => parseAiLiveOutput(JSON.stringify({ ...base, recommendationRestatement: "建议加注" }), liveFacts)).toThrow("推荐动作冲突");
    expect(() => parseAiLiveOutput(JSON.stringify({ ...base, opponentRead: ["对手持有KsQs"] }), liveFacts)).toThrow("未知底牌");
    expect(() => parseAiLiveOutput(JSON.stringify({ ...base, stateHash: "old" }), liveFacts)).toThrow("状态已过期");
  });

  it("accepts a concise street-ordered whole-hand review", () => {
    const facts: AiReviewFactPackV1 = {
      version: 1, kind: "review", stateHash: "review-1", handNo: 1, seed: 7,
      tableProfile: "普通朋友局",
      heroHole: ["Th", "8h"],
      playerProfiles: [{ playerId: "friend-02", name: "北辰", style: "紧弱" }],
      conclusionFacts: ["河牌应弃牌"],
      streets: [{ street: "river", board: ["Jh", "9h", "7c", "Qd", "3h"], actionLine: ["对手加注到130"], actual: "跟注", recommended: "弃牌", facts: ["所需胜率27.3%"], decisions: [{ position: "庄位", heroHand: "J高同花", privateContribution: true, equity: "18.0%", requiredEquity: "27.3%", pot: 130, playersBehind: 0, opponentBuckets: [], opponentResponses: [], recommendationReasons: ["权益不足"], changeConditions: [], betterHandClasses: ["同花"], betterHandExamples: ["同花：Ah 2h"] }] }],
      recommendationKeys: ["river:fold"], allowedNumbers: ["1", "3", "7", "9", "27.3", "130"],
    };
    const raw = JSON.stringify({ version: 1, stateHash: "review-1", summary: "河牌应弃牌。", streets: [{ street: "river", analysis: "你是J高同花，需要27.3%胜率，本地权益不足，建议弃牌。" }], turningPoint: "河牌面对加注到130。", keyLesson: "被动局大加注优先尊重价值范围。" });
    expect(parseAiReviewOutput(raw, facts).streets).toHaveLength(1);
    const invented = JSON.stringify({ version: 1, stateHash: "review-1", summary: "河牌应弃牌。", streets: [{ street: "river", analysis: "你是J高同花，对手的顶对或更好占比很高，建议弃牌。" }], turningPoint: "河牌。", keyLesson: "尊重加注。" });
    expect(() => parseAiReviewOutput(invented, facts)).toThrow("未经本地确认的牌型");
  });
});
