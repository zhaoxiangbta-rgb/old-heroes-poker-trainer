#!/usr/bin/env node
const endpoint = process.env.LOCAL_AI_URL ?? "http://192.168.120.86:8081/v1/chat/completions";
const model = process.env.LOCAL_AI_MODEL ?? "Qwen3.5-9B-Q8";

const prompts = {
  live: `你是中文德州扑克现场教练的解释层。facts 是唯一事实源。不得重新算牌，不得改变推荐动作、尺寸、EV、权益、概率或位置，不得猜测未摊牌底牌。必须只输出一个 JSON 对象，并原样回传 version 和 stateHash。严格输出结构：{"version":1,"stateHash":"原值","currentHand":"必须原样复制 facts.hero.currentHand","reasoning":["中文字符串"],"opponentRead":["中文字符串"],"risks":["中文字符串"],"recommendationRestatement":"必须包含 facts.recommendation.label"}。reasoning、opponentRead、risks 只能是简短中文字符串数组；禁止额外字段。`,
  review: `你是中文德州扑克整手复盘教练的解释层。facts 是唯一事实源。你只负责把本地计算组织成清晰的逐街复盘，不得改变任何数值、推荐、范围或牌局事实，不得猜测未摊牌底牌。必须只输出一个 JSON 对象，并原样回传 version 和 stateHash。严格输出结构：{"version":1,"stateHash":"原值","summary":"中文字符串","streets":[{"street":"原街道","analysis":"中文字符串，不能是数组或对象"}],"turningPoint":"中文字符串","keyLesson":"中文字符串"}。streets 必须与 facts.streets 同顺序、同数量；每个 analysis 必须是单个字符串，禁止数组、嵌套对象和额外字段。`,
};

async function generate(kind, facts, maxTokens) {
  const started = Date.now();
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: prompts[kind] }, { role: "user", content: JSON.stringify(facts) }], temperature: 0.1, max_tokens: maxTokens, response_format: { type: "json_object" } }), signal: AbortSignal.timeout(kind === "live" ? 8_000 : 35_000) });
  if (!response.ok) throw new Error(`${kind} HTTP ${response.status}`);
  const envelope = await response.json();
  const content = envelope?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error(`${kind} 缺少 assistant content`);
  return { parsed: JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")), elapsedMs: Date.now() - started };
}

function check(condition, message) { if (!condition) throw new Error(message); }

const liveFacts = { version: 1, kind: "live", stateHash: "contract-public-pair", handNo: 1, street: "flop", position: "庄位", heroHole: ["Jh", "2d"], board: ["Ac", "4s", "4h"], pot: 6, price: { callAmount: 2, pot: 6, callFractionOfPot: "33.3%" }, hero: { currentHand: "公共牌一对，底牌未改善", privateContribution: false, upgrades: [] }, opponents: [{ playerId: "friend-02", name: "北辰", actionLine: "下注到2", buckets: [{ label: "强价值", probability: "31%" }, { label: "空气", probability: "45%" }], confidence: "72%" }], recommendation: { key: "fold", label: "弃牌" }, allowedNumbers: ["1", "2", "4", "6", "31", "33.3", "45", "72"] };
const live = await generate("live", liveFacts, 500);
check(live.parsed.stateHash === liveFacts.stateHash, "live stateHash 被改变");
check(live.parsed.currentHand === liveFacts.hero.currentHand, "live 把公共牌对说成了私有成牌");
check(Array.isArray(live.parsed.reasoning) && live.parsed.reasoning.every((item) => typeof item === "string"), "live reasoning 结构错误");
check(String(live.parsed.recommendationRestatement).includes("弃牌"), "live 改变了推荐动作");

const reviewFacts = { version: 1, kind: "review", stateHash: "contract-review-1", handNo: 1, seed: 7, conclusionFacts: ["河牌应弃牌", "河牌面对大加注", "河牌弃牌", "大加注尊重强价值"], streets: [{ street: "flop", board: ["Jh", "9h", "7c"], actionLine: ["对手下注到10"], actual: "跟注", recommended: "跟注", facts: ["跟注价格好"] }, { street: "river", board: ["Jh", "9h", "7c", "Qd", "3h"], actionLine: ["对手加注到130"], actual: "跟注", recommended: "弃牌", facts: ["所需胜率27.3%"] }], recommendationKeys: ["flop:跟注", "river:弃牌"], allowedNumbers: ["1", "3", "7", "9", "10", "27.3", "130"] };
const review = await generate("review", reviewFacts, 1200);
check(review.parsed.stateHash === reviewFacts.stateHash, "review stateHash 被改变");
check(Array.isArray(review.parsed.streets) && review.parsed.streets.length === 2, "review 街道数量错误");
check(review.parsed.streets.every((street, index) => street.street === reviewFacts.streets[index].street && typeof street.analysis === "string"), "review 结构或顺序错误");
check(review.parsed.streets[1].analysis.includes("弃牌"), "review 河牌推荐丢失");

console.log(JSON.stringify({ ok: true, endpoint, model, liveMs: live.elapsedMs, reviewMs: review.elapsedMs }, null, 2));
