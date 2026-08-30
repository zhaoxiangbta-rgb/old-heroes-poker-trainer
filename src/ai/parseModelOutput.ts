import type {
  AiHandReviewV1,
  AiLiveExplanationV1,
  AiLiveFactPackV1,
  AiReviewFactPackV1,
} from "./types";

function unwrapJson(raw: string) {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (text.length > 12_000) throw new Error("模型输出过长");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("模型未返回有效 JSON");
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("模型输出结构错误");
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 800) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label}格式错误`);
  return value.trim();
}

function textList(value: unknown, label: string, maxItems = 6) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label}格式错误`);
  return value.map((item) => text(item, label, 320));
}

function textualParts(value: AiLiveExplanationV1 | AiHandReviewV1) {
  if ("currentHand" in value) {
    return [value.currentHand, ...value.reasoning, ...value.opponentRead, ...value.risks, value.recommendationRestatement];
  }
  return [value.summary, ...value.streets.map((street) => street.analysis), value.turningPoint, value.keyLesson];
}

function verifyNumbers(value: AiLiveExplanationV1 | AiHandReviewV1, allowed: readonly string[]) {
  const allowedSet = new Set(allowed.map((number) => number.replace(/^0+(?=\d)/, "")));
  const numbers = textualParts(value).join(" ").match(/\d+(?:\.\d+)?/g) ?? [];
  const invented = numbers.find((number) => !allowedSet.has(number.replace(/^0+(?=\d)/, "")));
  if (invented) throw new Error(`包含未经本地确认的数字：${invented}`);
}

function verifyCards(value: AiLiveExplanationV1, facts: AiLiveFactPackV1) {
  const known = new Set([...facts.heroHole, ...facts.board].map((card) => card.toLowerCase()));
  const mentioned = textualParts(value).join(" ").match(/(?:10|[2-9TJQKA])[shdc]/gi) ?? [];
  if (mentioned.some((card) => !known.has(card.toLowerCase()))) throw new Error("模型声称了未知底牌");
}

export function parseAiLiveOutput(raw: string, facts: AiLiveFactPackV1): AiLiveExplanationV1 {
  const data = object(unwrapJson(raw));
  if (data.version !== 1) throw new Error("模型输出版本不兼容");
  if (data.stateHash !== facts.stateHash) throw new Error("模型分析状态已过期");
  const parsed: AiLiveExplanationV1 = {
    version: 1,
    stateHash: facts.stateHash,
    currentHand: text(data.currentHand, "当前牌型"),
    reasoning: textList(data.reasoning, "分析理由"),
    opponentRead: textList(data.opponentRead, "对手范围"),
    risks: textList(data.risks, "风险提示"),
    recommendationRestatement: text(data.recommendationRestatement, "推荐动作"),
  };
  if (parsed.currentHand !== facts.hero.currentHand) throw new Error("当前牌型与本地事实冲突");
  if (!parsed.recommendationRestatement.includes(facts.recommendation.label)) throw new Error("推荐动作冲突");
  verifyNumbers(parsed, facts.allowedNumbers);
  verifyCards(parsed, facts);
  return parsed;
}

export function parseAiReviewOutput(raw: string, facts: AiReviewFactPackV1): AiHandReviewV1 {
  const data = object(unwrapJson(raw));
  if (data.version !== 1) throw new Error("模型输出版本不兼容");
  if (data.stateHash !== facts.stateHash) throw new Error("模型分析状态已过期");
  if (!Array.isArray(data.streets) || data.streets.length !== facts.streets.length) throw new Error("逐街复盘结构错误");
  const streets = data.streets.map((item) => {
    const street = object(item);
    const name = text(street.street, "街道", 16) as AiHandReviewV1["streets"][number]["street"];
    return { street: name, analysis: text(street.analysis, "逐街分析", 1200) };
  });
  const expected = facts.streets.map((street) => street.street);
  if (streets.some((street, index) => street.street !== expected[index])) throw new Error("逐街顺序与本地牌局不一致");
  for (const [index, street] of streets.entries()) {
    const required = facts.streets[index].recommended.split("→").at(-1)?.trim();
    if (required && !street.analysis.includes(required)) throw new Error(`逐街推荐动作冲突：${street.street}`);
  }
  const parsed: AiHandReviewV1 = {
    version: 1,
    stateHash: facts.stateHash,
    summary: text(data.summary, "整手结论", 1200),
    streets,
    turningPoint: text(data.turningPoint, "关键转折", 1200),
    keyLesson: text(data.keyLesson, "训练规则", 1200),
  };
  verifyNumbers(parsed, facts.allowedNumbers);
  return parsed;
}
