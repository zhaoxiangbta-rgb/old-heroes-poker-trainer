#!/usr/bin/env node
const endpoint = process.env.LOCAL_AI_URL ?? "http://192.168.120.86:8081/v1/chat/completions";
const model = process.env.LOCAL_AI_MODEL ?? "Qwen3.5-9B-Q8";

const prompts = {
  live: `你是中文德州扑克现场教练的解释层。facts 是唯一事实源。不得重新算牌，不得改变推荐动作、尺寸、EV、权益、概率或位置，不得猜测未摊牌底牌。必须只输出一个 JSON 对象，并原样回传 version 和 stateHash。严格输出结构：{"version":1,"stateHash":"原值","currentHand":"必须原样复制 facts.hero.currentHand","reasoning":["中文字符串"],"opponentRead":["中文字符串"],"risks":["中文字符串"],"recommendationRestatement":"必须包含 facts.recommendation.label"}。reasoning、opponentRead、risks 只能是简短中文字符串数组；禁止额外字段。`,
  review: `你是中文德州扑克整手复盘教练的解释层。facts 是唯一事实源。你只负责把本地计算组织成清晰的逐街复盘，不得改变任何数值、推荐、范围或牌局事实，不得猜测未摊牌底牌。目标读者是初中级玩家，必须说人话，但不能删掉关键的范围、价格和行动逻辑。summary 先用两到四句概括整手主线、最大错误或亮点，不要写空泛评分。每个 analysis 必须结合该街行动线，说清：你当时是什么牌或听牌；什么更好牌能赢你；对手的人物风格和下注如何收窄对手范围；你的动作是否合理；本地推荐是什么以及为什么。若 facts 给了继续所需胜率、权益、对手范围概率或回应概率，必须把它们翻译成决策意义，不能只抄数字。只能把权益与继续所需胜率比较；禁止把“强价值占比”当成你的胜率。如果 facts 没有列出范围中的具体牌型，只能说强价值、中等摊牌价值或诈唬的占比，不得自行举例。turningPoint 解释关键转折和当时最容易被误导的地方。keyLesson 写成“下次再遇到……，先……，再……”的可执行规则。不要重复相同结论，不要使用“普通成牌”一类空洞标签，不要用未解释的术语。必须只输出一个 JSON 对象，并原样回传 version 和 stateHash。严格输出结构：{"version":1,"stateHash":"原值","summary":"中文字符串","streets":[{"street":"原街道","analysis":"中文字符串，不能是数组或对象"}],"turningPoint":"中文字符串","keyLesson":"中文字符串"}。streets 必须与 facts.streets 同顺序、同数量；每个 analysis 必须是单个字符串，禁止数组、嵌套对象和额外字段。`,
};
prompts.review = prompts.review.replace("若 facts", "每街必须优先采用 decisions 中的 heroHand 作为当前牌型，不得自行重新评牌，不得把同花、顺子、三条等改成高牌或未成牌。privateContribution 为 false 时，要明确说明成牌来自公共牌。若 facts");
prompts.review = prompts.review.replace("若 facts", "每个 analysis 必须原样包含该街 recommended 字段中的最终推荐动作，例如弃牌、跟注或加注到。若 facts");
prompts.review = prompts.review.replace("如果 facts 没有列出", "只能从 betterHandClasses 和 betterHandExamples 中举例哪些牌能赢你；这些全是对手可能的更好组合，不是你的成牌或听牌，也不是对手实际底牌。如果 facts 没有列出");
prompts.review = prompts.review.replace("如果 facts 没有列出", "严禁在强价值后自行补充括号示例。严禁声称 betterHandExamples 在对手范围中的占比高低。如果 heroHand 包含同花，analysis 不得出现未成同花、没有同花或并未击中同花。如果 facts 没有列出");
prompts.review += "如果 facts 包含 validationFeedback，必须修正上一次未通过本地事实审核的错误，不得删掉分析。";
prompts.review += "analysis 中禁止列举任何更好底牌或自行展开强价值的具体牌型，界面会单独展示本地精确依据。";
prompts.review = `你是中文德州扑克整手复盘教练。facts 是唯一事实源。只能解释，不得重新计算或改变任何事实。面向初中级玩家说人话。summary 用两到四句说整手主线、亮点和最大错误。streets 必须与 facts.streets 同顺序同数量。每个 analysis 必须原样写出 decisions 中的 heroHand 和该街 recommended 的最终动作，再解释行动线、权益与所需胜率、对手风格和范围占比的意义。只能把权益与所需胜率比较，不得把强价值占比当成胜率。analysis 禁止举任何具体更好底牌，禁止自行展开强价值的具体牌型；界面会单独展示这些本地依据。不得把 heroHand 中的同花、顺子、三条等改成未成牌。turningPoint 说关键转折。keyLesson 必须写成“下次再遇到……，先……，再……”。如有 validationFeedback，必须修正其指出的错误。只输出 JSON：{"version":1,"stateHash":"原值","summary":"中文字符串","streets":[{"street":"原街道","analysis":"中文字符串"}],"turningPoint":"中文字符串","keyLesson":"中文字符串"}。`;
prompts.review += "heroHand 不包含听牌时，不得把它称为你的听牌。";

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

const reviewFacts = { version: 1, kind: "review", stateHash: "contract-review-1", handNo: 1, seed: 7, tableProfile: "普通朋友局：入池和跟注偏宽，诈唬偏少，河牌大加注偏强", heroHole: ["Th", "8h"], playerProfiles: [{ playerId: "friend-02", name: "北辰", style: "紧弱，松紧36，进攻32，诈唬15" }], conclusionFacts: ["河牌应弃牌", "河牌面对大加注", "河牌弃牌", "大加注尊重强价值"], streets: [{ street: "flop", board: ["Jh", "9h", "7c"], actionLine: ["北辰下注到10"], actual: "跟注", recommended: "跟注", facts: ["顺子加同花组合听牌", "继续所需胜率25%", "权益58%"] }, { street: "river", board: ["Jh", "9h", "7c", "Qd", "3h"], actionLine: ["北辰加注到130"], actual: "跟注", recommended: "弃牌", facts: ["当前J高同花", "权益18%", "对手强价值62%", "对手空气或诈唬12%", "所需胜率27.3%"] }], recommendationKeys: ["flop:跟注", "river:弃牌"], allowedNumbers: ["1", "3", "7", "8", "9", "10", "12", "15", "18", "25", "27.3", "32", "36", "58", "62", "130"] };
reviewFacts.allowedNumbers.push("30");
reviewFacts.streets[0].decisions = [{ position: "庄位", heroHand: "顺子加同花组合听牌", privateContribution: true, equity: "58%", requiredEquity: "25%", pot: 30, playersBehind: 1, opponentBuckets: [], opponentResponses: [], recommendationReasons: ["跟注价格好"], changeConditions: [], betterHandClasses: ["一对", "两对", "三条"], betterHandExamples: ["一对：Js 2c"] }];
reviewFacts.streets[1].decisions = [{ position: "庄位", heroHand: "J高同花", privateContribution: true, equity: "18%", requiredEquity: "27.3%", pot: 130, playersBehind: 0, opponentBuckets: [{ label: "强价值", probability: "62%" }, { label: "空气或诈唬", probability: "12%" }], opponentResponses: [], recommendationReasons: ["权益低于所需胜率"], changeConditions: [], betterHandClasses: ["同花"], betterHandExamples: ["同花：Qh 2h", "同花：Kh 2h", "同花：Ah 2h"] }];
let review = await generate("review", reviewFacts, 2600);
const firstRiver = String(review.parsed.streets?.at(-1)?.analysis ?? "");
const firstInvalid = !firstRiver.includes("弃牌") || !firstRiver.includes("J 高同花") && !firstRiver.includes("J高同花") || /(顶对|两对|三条|顺子)/.test(firstRiver) || /(未成|没有|并未\S*)同花/.test(firstRiver) || firstRiver.includes("你的听牌");
if (firstInvalid) {
  reviewFacts.validationFeedback = "上一次输出丢失推荐动作、改变了 heroHand、举了 betterHandClasses 之外的牌型，或把河牌已成的 J 高同花误称为听牌。河牌 analysis 必须明确写“J高同花”，不得出现“你的听牌”。请严格修正。";
  review = await generate("review", reviewFacts, 2600);
}
if (!review.parsed.streets?.at(-1)?.analysis?.includes("弃牌")) console.error(JSON.stringify(review.parsed, null, 2));
if (review.parsed.streets?.at(-1)?.analysis?.includes("顶对或更好")) console.error(JSON.stringify(review.parsed, null, 2));
if (!review.parsed.streets?.at(-1)?.analysis?.includes("范围")) console.error(JSON.stringify(review.parsed, null, 2));
if (/(顶对|两对|三条|顺子)/.test(String(review.parsed.streets?.at(-1)?.analysis ?? ""))) console.error(JSON.stringify(review.parsed, null, 2));
check(review.parsed.stateHash === reviewFacts.stateHash, "review stateHash 被改变");
check(Array.isArray(review.parsed.streets) && review.parsed.streets.length === 2, "review 街道数量错误");
check(review.parsed.streets.every((street, index) => street.street === reviewFacts.streets[index].street && typeof street.analysis === "string"), "review 结构或顺序错误");
check(review.parsed.streets[1].analysis.includes("弃牌"), "review 河牌推荐丢失");
check(review.parsed.streets[1].analysis.includes("J 高同花") || review.parsed.streets[1].analysis.includes("J高同花"), "review 改变了本地牌型");
check(!review.parsed.streets[1].analysis.includes("顶对或更好"), "review 自行编造了范围牌型");
check(!review.parsed.streets[1].analysis.includes("QJ") && !review.parsed.streets[1].analysis.includes("Q9"), "review 自行编造了底牌示例");
check(!/(顶对|两对|三条|顺子)/.test(review.parsed.streets[1].analysis), "review 自行编造了更好牌类别");
check(!/(未成|没有|并未\S*)同花/.test(review.parsed.streets[1].analysis), "review 同花牌型自相矛盾");
check(!review.parsed.streets[1].analysis.includes("你的听牌"), "review 把河牌成牌误说成听牌");
check(review.parsed.streets[0].analysis.length >= 80, "review 翻牌分析过于简略");
check(review.parsed.streets[1].analysis.includes("范围"), "review 没有解释对手范围");
check(review.parsed.keyLesson.includes("下次再遇到"), "review 没有可执行的下次规则");

console.log(JSON.stringify({ ok: true, endpoint, model, liveMs: live.elapsedMs, reviewMs: review.elapsedMs, reviewPreview: { summary: review.parsed.summary, river: review.parsed.streets.at(-1)?.analysis, keyLesson: review.parsed.keyLesson } }, null, 2));
