# 实用翻后抽象策略 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立考虑位置、主动权、牌面、范围优势、尺度响应和玩家画像的本地翻后策略，并让牌局中与整手复盘使用同一份、无重复的自然中文分析。

**Architecture:** 新增一组纯函数策略模块，把公开牌局先归纳为 `PostflopSituation`，再计算范围优势、尺度响应、标准策略和有限画像调整；实时洞察 worker 保存版本化 `DecisionAnalysisV2`，深度复盘复用相同事实和中文生成器，不在 React 渲染时重新计算。现有规则引擎继续校验所有金额，旧版洞察与复盘继续可读。

**Tech Stack:** TypeScript 5.8、React 19、Vitest、Testing Library、Web Worker、现有 52 张牌/范围/权益引擎、IndexedDB/SQLite 持久化、Tauri 2、Vite PWA。

## Global Constraints

- 完全离线；不依赖 Codex、Python、Node、网络或外接 AI 才能完成决策和解释。
- 本地规则引擎是下注合法性和结算的唯一事实源。
- 标准策略先生成，画像调整后生成；两者分别保存和展示。
- 不读取未摊牌对手底牌，不按本手输赢评价动作。
- 同一公开状态、范围、配置和种子必须完全可重放。
- 画像只调整候选动作频率和有限尺度，不允许把明显负 EV 动作变成主要建议。
- 对手范围分类互斥，概率合计误差小于 `1e-9`。
- 实时分析超过预算时确定性降级并降低置信度，不阻塞玩家行动。
- 旧牌局、旧洞察、旧复盘和旧随机种子继续可读。
- 不修改左侧牌桌、下注区和移动牌桌布局。

---

## File Structure

- Create `src/strategy/postflopSituation.ts`: 公开翻后局面的 IP/OOP、主动权、行动线、SPR 与牌面变化归类。
- Create `src/strategy/postflopSituation.test.ts`: 节点、领打、探测下注和街道变化回归。
- Create `src/strategy/rangeAdvantage.ts`: 双方范围权益、强价值密度、坚果优势和兑现修正。
- Create `src/strategy/rangeAdvantage.test.ts`: 互斥密度、位置兑现与确定性测试。
- Create `src/strategy/responseModel.ts`: 每个下注尺度的弃牌、较差跟注、较好继续、反加和继续范围权益。
- Create `src/strategy/responseModel.test.ts`: 尺度单调性、超池非机械弃牌和河牌强反加测试。
- Create `src/strategy/postflopBaselineV2.ts`: 标准单挑翻后候选动作、EV、意图与混合频率。
- Create `src/strategy/postflopBaselineV2.test.ts`: IP/OOP、领打、薄价值、诱导与合法尺寸回归。
- Modify `src/strategy/types.ts`: 增加 v2 局面、范围事实、标准动作和调整解释类型。
- Modify `src/strategy/engine.ts`: 接入 v2 标准策略和画像调整，保留安全回退。
- Modify `src/strategy/profileDeviation.ts`: 从通用频率乘数升级为有原因、有上限的调整结果。
- Modify `src/strategy/profileDeviation.test.ts`: 标准策略不变、调整受限及画像差异测试。
- Modify `src/strategy/behaviorRegression.test.ts`: 过牌链、超池必弃和反复加注回归。
- Modify `src/strategy/stressGate.test.ts`: v2 合法行动、筹码守恒和回退率门禁。
- Create `src/insights/plainLanguageAnalysis.ts`: 将结构化事实生成五章自然中文分析。
- Create `src/insights/plainLanguageAnalysis.test.ts`: 完整性、去重复、低置信度和确定性文案测试。
- Modify `src/insights/types.ts`: 增加版本化 `DecisionAnalysisV2`、标准策略与画像调整字段。
- Modify `src/insights/pre-action.worker.ts`: 在固定预算内生成并发送 v2 分析。
- Modify `src/insights/usePreActionInsights.ts`: 接收、缓存和持久化 v2 分析。
- Modify `src/insights/snapshot.ts`: 对新增公开输入和版本字段稳定哈希。
- Modify `src/components/PreActionInsights.tsx`: 改成五章顺序、自然中文且不重复。
- Modify `src/components/PreActionInsights.test.tsx`: 章节顺序、范围保留和重复文本测试。
- Modify `src/mobile/MobileInsightSummary.tsx`: 移动端复用同一分析，不创建第二套文案。
- Create `src/mobile/MobileInsightSummary.test.tsx`: 移动端复用与无重复文案测试。
- Modify `src/review/types.ts`: 深度复盘 v3 保存共享分析事实和审计记录，保留 v1/v2。
- Modify `src/review/deepReview.ts`: 用深度计算替换实时近似数字，再调用同一中文生成器。
- Modify `src/review/coachNarrative.ts`: 改为共享生成器的复盘适配层。
- Modify `src/components/DeepHandReview.tsx`: 复盘使用同样五章，加实际动作、偏差与下一次判断顺序。
- Modify `src/components/DeepHandReview.test.tsx`: 去重、旧版兼容和章节一致性测试。
- Modify `src/data/repository.test.ts`: 洞察 v2、复盘 v3 与旧数据往返测试。
- Modify `src/training.css`: 只调整右侧分析和复盘信息层级。
- Modify `src/mobile/mobile.css`: 只调整移动分析抽屉的阅读顺序和间距。

---

### Task 1: 建立统一翻后局面节点

**Files:**
- Create: `src/strategy/postflopSituation.ts`
- Create: `src/strategy/postflopSituation.test.ts`
- Modify: `src/strategy/types.ts`

**Interfaces:**
- Consumes: `PublicDecisionState`、`PostflopTexture`。
- Produces: `classifyPostflopSituation(state, texture): PostflopSituation`。

- [ ] **Step 1: 写入节点分类失败测试**

测试构造单挑 SRP 固定状态，覆盖：

```ts
expect(classifyPostflopSituation(oopFlop, texture)).toMatchObject({
  inPosition: false,
  initiative: false,
  line: "first-to-act",
  street: "flop",
});
expect(classifyPostflopSituation(turnAfterAggressorChecksBack, turnTexture).line)
  .toBe("probe");
expect(classifyPostflopSituation(turnLedIntoAggressor, turnTexture).line)
  .toBe("donk");
```

另测相同公开状态两次生成相同 `nodeId`，`spr` 使用双方有效筹码除以当前底池。

- [ ] **Step 2: 运行测试确认缺少模块**

Run: `npx vitest run src/strategy/postflopSituation.test.ts`

Expected: FAIL，找不到 `postflopSituation`。

- [ ] **Step 3: 定义 v2 类型与纯分类函数**

在 `types.ts` 增加：

```ts
export type PostflopLineV2 =
  | "first-to-act" | "checked-to" | "cbet" | "delayed-cbet"
  | "probe" | "donk" | "facing-bet" | "facing-raise";

export type PostflopSituation = {
  version: 2;
  street: "flop" | "turn" | "river";
  headsUp: boolean;
  inPosition: boolean;
  initiative: boolean;
  lastToAct: boolean;
  line: PostflopLineV2;
  potType: "limped" | "srp" | "3bp" | "4bp";
  spr: number;
  playersBehind: number;
  textureCluster: string;
  rangeShiftCard: boolean;
  nodeId: string;
};
```

`rangeShiftCard` 只依据公开牌面变化判断：公共牌成对、完成同花、完成四连顺、低牌/中牌使防守方两对和顺子密度上升时为 `true`。

- [ ] **Step 4: 运行节点测试和类型检查**

Run: `npx vitest run src/strategy/postflopSituation.test.ts src/strategy/postflopNode.test.ts && npx tsc -b --pretty false`

Expected: PASS。

- [ ] **Step 5: 提交节点层**

```bash
git add src/strategy/types.ts src/strategy/postflopSituation.ts src/strategy/postflopSituation.test.ts
git commit -m "feat: classify postflop situations v2"
```

---

### Task 2: 计算范围优势与权益兑现

**Files:**
- Create: `src/strategy/rangeAdvantage.ts`
- Create: `src/strategy/rangeAdvantage.test.ts`

**Interfaces:**
- Consumes: 英雄两张牌、公共牌、英雄加权范围、对手加权范围、`PostflopSituation`、固定 `sampleBudget`。
- Produces: `calculateRangeAdvantage(input): RangeAdvantageFacts`。

- [ ] **Step 1: 写入互斥密度和位置差异失败测试**

```ts
expect(facts.hero.strongDensity + facts.hero.mediumDensity
  + facts.hero.drawDensity + facts.hero.airDensity).toBeCloseTo(1, 10);
expect(facts.villain.strongDensity + facts.villain.mediumDensity
  + facts.villain.drawDensity + facts.villain.airDensity).toBeCloseTo(1, 10);
expect(ip.equityRealization).toBeGreaterThan(oop.equityRealization);
expect(replay).toEqual(first);
```

另测空范围返回低置信度而非 `NaN`。

- [ ] **Step 2: 运行测试确认缺少模块**

Run: `npx vitest run src/strategy/rangeAdvantage.test.ts`

Expected: FAIL，找不到 `rangeAdvantage`。

- [ ] **Step 3: 实现固定预算范围抽象**

定义：

```ts
export type RangeSideFacts = {
  equity: number;
  nutDensity: number;
  strongDensity: number;
  mediumDensity: number;
  drawDensity: number;
  airDensity: number;
  equityRealization: number;
};

export type RangeAdvantageFacts = {
  hero: RangeSideFacts;
  villain: RangeSideFacts;
  equityAdvantage: number;
  nutAdvantage: number;
  confidence: number;
  samples: number;
};
```

使用现有 `bestHand`、牌型特征和确定性加权代表组合；互斥顺序为强价值 → 中等成牌 → 听牌 → 空气。IP 兑现修正上限 `+0.06`，OOP 下限 `-0.06`，多人和高 SPR 进一步降低边缘牌兑现，不改变原始权益。

- [ ] **Step 4: 运行数学与性能测试**

Run: `npx vitest run src/strategy/rangeAdvantage.test.ts src/insights/performance.test.ts`

Expected: PASS，单节点固定预算计算不超过现有性能门。

- [ ] **Step 5: 提交范围优势层**

```bash
git add src/strategy/rangeAdvantage.ts src/strategy/rangeAdvantage.test.ts
git commit -m "feat: calculate postflop range advantage"
```

---

### Task 3: 建立尺度相关对手响应模型

**Files:**
- Create: `src/strategy/responseModel.ts`
- Create: `src/strategy/responseModel.test.ts`
- Modify: `src/insights/actionResponse.ts`
- Modify: `src/insights/actionResponse.test.ts`

**Interfaces:**
- Consumes: `PostflopSituation`、`RangeAdvantageFacts`、对手加权范围、合法下注尺度和可选玩家画像。
- Produces: `estimateScaleResponse(input): ScaleResponseFacts`。

- [ ] **Step 1: 写入尺度和范围响应失败测试**

固定河牌范围断言：

```ts
expect(pot.fold).toBeGreaterThan(half.fold);
expect(pot.worseCall).toBeLessThan(half.worseCall);
expect(overbet.fold).toBeLessThan(0.98);
expect(overbet.fold + overbet.worseCall + overbet.betterContinue + overbet.raise)
  .toBeCloseTo(1, 10);
expect(strongRiverRaise.betterContinue).toBeGreaterThan(weakRiverRaise.betterContinue);
```

另测松弱玩家比均衡玩家更宽跟注，紧凶玩家的反加率更高，但每项画像偏移不超过规格上限。

- [ ] **Step 2: 运行测试确认缺少模块**

Run: `npx vitest run src/strategy/responseModel.test.ts`

Expected: FAIL，找不到 `responseModel`。

- [ ] **Step 3: 实现互斥响应事实**

```ts
export type ScaleResponseFacts = {
  toAmount: number;
  potFraction: number;
  fold: number;
  worseCall: number;
  betterContinue: number;
  raise: number;
  equityWhenContinued: number;
  confidence: number;
};
```

逐组合计算对手相对英雄当前牌力/范围权益的类别，再按下注尺度、位置、牌面、河牌大额加注倾向和画像重新加权。最终四个响应分类互斥归一化，最低继续概率来自对手真实强牌密度，不允许超池直接得到 100% 弃牌。

- [ ] **Step 4: 让实时洞察复用响应模型**

`actionResponse.ts` 保留原导出接口，但内部把 `ScaleResponseFacts` 映射成现有 `fold/call/raise`：

```ts
call = response.worseCall + response.betterContinue;
raise = response.raise;
fold = response.fold;
```

`continuingRange` 保留公开摘要，不序列化未摊牌底牌。

- [ ] **Step 5: 运行响应、隐藏牌和性能测试**

Run: `npx vitest run src/strategy/responseModel.test.ts src/insights/actionResponse.test.ts src/insights/opponentRanges.test.ts src/insights/performance.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交响应模型**

```bash
git add src/strategy/responseModel.ts src/strategy/responseModel.test.ts src/insights/actionResponse.ts src/insights/actionResponse.test.ts
git commit -m "feat: model scale-aware opponent responses"
```

---

### Task 4: 生成标准单挑翻后策略

**Files:**
- Create: `src/strategy/postflopBaselineV2.ts`
- Create: `src/strategy/postflopBaselineV2.test.ts`
- Modify: `src/strategy/engine.ts`
- Modify: `src/strategy/engine.test.ts`
- Modify: `src/strategy/postflopResolver.ts`

**Interfaces:**
- Consumes: `StrategyRequest`、`PostflopSituation`、`PostflopHandBucket`、`RangeAdvantageFacts`、各尺度 `ScaleResponseFacts[]`。
- Produces: `buildPostflopBaselineV2(input): StrategyResult`，其中 `actions` 是标准策略。

- [ ] **Step 1: 写入位置、领打和薄价值失败测试**

覆盖：

```ts
expect(aggression(oopFlopNoInitiative)).toBeLessThan(aggression(ipCheckedTo));
expect(aggression(oopFlopNoInitiative)).toBeLessThan(0.35);
expect(aggression(turnRangeShift)).toBeGreaterThan(aggression(turnBlank));
expect(thinValue.actions.some((action) => action.intent === "value")).toBe(true);
expect(noWorseCalls.actions.every((action) => action.intent !== "value" || action.frequency < 0.1)).toBe(true);
```

另测坚果包含下注与诱导过牌两类动作；所有 `toAmount` 均位于 `minRaiseTo..maxRaiseTo`。

- [ ] **Step 2: 运行测试确认缺少模块或行为失败**

Run: `npx vitest run src/strategy/postflopBaselineV2.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现候选 EV 与意图分类**

对过牌、跟注和每个合法尺度分别计算：

```ts
betEv = fold * pot
  + worseCall * evWhenCalledByWorse
  + betterContinue * evWhenCalledByBetter
  + raise * evFacingRaise;
```

意图规则：

- `value`: 更差跟注贡献为正且大于被更好继续/反加损失。
- `protection`: 当前领先但主要收益来自让有显著权益的弱范围弃牌。
- `semi-bluff`: 当前落后但有可靠改善牌和弃牌率。
- `bluff`: 无足够摊牌价值，收益主要来自弃牌。
- `pot-control`: 过牌/跟注保留权益且避免负面范围响应。
- `induce`: 强价值牌过牌后对手下注收益高于立即下注的一部分混合频率。

- [ ] **Step 4: 实现位置和行动线频率先验**

翻牌 OOP 无主动权的主动下注总频率上限 `0.35`；若非范围转移牌，`donk` 上限 `0.18`。转河牌 `rangeShiftCard && nutAdvantage > 0.08` 时允许提高领打频率。IP 被过牌到、延迟持续下注和探测节点提高权益兑现与薄价值权重，但仍由响应 EV 决定最终排序。

- [ ] **Step 5: 接入单挑翻后引擎**

`engine.ts` 的单挑翻后路径改为：局面 → 手牌桶 → 范围优势 → 响应模型 → v2 baseline → 现有 resolver。预算不足或范围为空时才回退现有 v1 蓝图，并在 `explanationFacts.fallback` 中写明原因。

- [ ] **Step 6: 运行单挑策略回归**

Run: `npx vitest run src/strategy/postflopBaselineV2.test.ts src/strategy/engine.test.ts src/strategy/postflopRegression.test.ts src/strategy/postflopResolver.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交标准策略**

```bash
git add src/strategy/postflopBaselineV2.ts src/strategy/postflopBaselineV2.test.ts src/strategy/engine.ts src/strategy/engine.test.ts src/strategy/postflopResolver.ts
git commit -m "feat: add position-aware postflop baseline"
```

---

### Task 5: 分离标准策略与画像调整

**Files:**
- Modify: `src/strategy/types.ts`
- Modify: `src/strategy/profileDeviation.ts`
- Modify: `src/strategy/profileDeviation.test.ts`
- Modify: `src/strategy/engine.ts`
- Modify: `src/strategy/behaviorRegression.test.ts`

**Interfaces:**
- Consumes: 标准 `StrategyAction[]`、牌局风格、`HandPlayerProfile`、`PostflopSituation`。
- Produces: `ExploitAdjustmentFacts` 和最终 `StrategyResult.actions`，同时保留 `StrategyResult.baselineActions`。

- [ ] **Step 1: 写入双轨输出失败测试**

```ts
expect(result.baselineActions).toEqual(balanced.actions);
expect(result.adjustment?.reasons.length).toBeGreaterThan(0);
expect(maxFrequencyShift(result)).toBeLessThanOrEqual(0.15);
expect(result.actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1, 10);
```

另测朋友局增加较差牌跟注后的价值下注倾向但降低纯诈唬；河牌低诈唬画像面对大额下注不会增加英雄跟注建议。

- [ ] **Step 2: 运行测试确认类型或断言失败**

Run: `npx vitest run src/strategy/profileDeviation.test.ts`

Expected: FAIL，因为结果没有 `baselineActions` 和 `adjustment`。

- [ ] **Step 3: 增加双轨结构**

```ts
export type ExploitAdjustmentFacts = {
  profileId: string;
  frequencyShiftMax: number;
  sizingShift: "smaller" | "same" | "larger";
  reasons: string[];
  confidence: number;
};

export type StrategyResult = {
  actions: StrategyAction[];
  baselineActions?: StrategyAction[];
  adjustment?: ExploitAdjustmentFacts;
  // 保留现有字段
};
```

`applyBoundedDeviation` 必须先复制标准动作，再输出调整动作；只调整已经存在的合法候选。若某动作标准 EV 比最佳动作低超过 `max(2, pot * 0.12)`，画像不得把它提升为最高频动作。

- [ ] **Step 4: 增加机械行为回归**

在 `behaviorRegression.test.ts` 固定三个场景：

- 三次过牌后，后位仍有非零探测下注但不是 100%。
- 1.25 倍底池下注时，强牌和合适听牌仍有继续范围。
- 面对一次加注后，非坚果范围的再次加注频率低于跟注或弃牌，连续三次加注不会成为确定动作链。

- [ ] **Step 5: 运行画像和行为测试**

Run: `npx vitest run src/strategy/profileDeviation.test.ts src/strategy/behaviorRegression.test.ts src/strategy/engine.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交双轨策略**

```bash
git add src/strategy/types.ts src/strategy/profileDeviation.ts src/strategy/profileDeviation.test.ts src/strategy/engine.ts src/strategy/behaviorRegression.test.ts
git commit -m "feat: separate baseline and exploit strategy"
```

---

### Task 6: 生成共享的自然中文分析事实

**Files:**
- Create: `src/insights/plainLanguageAnalysis.ts`
- Create: `src/insights/plainLanguageAnalysis.test.ts`
- Modify: `src/insights/types.ts`
- Modify: `src/insights/pre-action.worker.ts`
- Modify: `src/insights/usePreActionInsights.ts`
- Modify: `src/insights/snapshot.ts`
- Modify: `src/insights/snapshot.test.ts`
- Modify: `src/data/repository.test.ts`

**Interfaces:**
- Consumes: 精确牌路、英雄范围位置、对手互斥范围、标准策略、画像调整、尺度响应和置信度。
- Produces: `buildPlainLanguageAnalysis(facts): DecisionAnalysisV2`。

- [ ] **Step 1: 写入五章完整性与去重复失败测试**

```ts
expect(analysis.sections.map((section) => section.kind)).toEqual([
  "situation", "ranges", "baseline", "adjustment", "watch",
]);
expect(analysis.sections.find((item) => item.kind === "ranges")?.text)
  .toMatch(/你的.*范围.*对手.*%/);
expect(allText.match(/有效组合/g)).toBeNull();
expect(allText.match(/所需胜率/g)?.length ?? 0).toBeLessThanOrEqual(1);
expect(buildPlainLanguageAnalysis(facts)).toEqual(buildPlainLanguageAnalysis(facts));
```

低置信度 fixture 断言包含“信息有限，以下范围仅作方向判断”，且百分比取整，不出现伪精确小数。

- [ ] **Step 2: 运行测试确认缺少模块**

Run: `npx vitest run src/insights/plainLanguageAnalysis.test.ts`

Expected: FAIL。

- [ ] **Step 3: 定义版本化分析结构**

```ts
export type AnalysisSectionKind =
  | "situation" | "ranges" | "baseline" | "adjustment" | "watch";

export type DecisionAnalysisV2 = {
  schemaVersion: 2;
  sections: Array<{ kind: AnalysisSectionKind; title: string; text: string }>;
  heroRange: { label: string; percentile: number | null };
  opponentBuckets: OpponentRangeBuckets;
  baseline: StrategyAction[];
  adjusted: StrategyAction[];
  adjustment?: ExploitAdjustmentFacts;
  confidence: number;
  audit: { strategyVersion: string; sampleBudget: number; seed: number };
};
```

中文生成器只消费结构化事实，按固定模板连接句子。必要数字只在影响动作的句子中出现；英雄范围和对手范围不可省略。

- [ ] **Step 4: 在 worker 中生成分析**

`pre-action.worker.ts` 在范围与响应完成后调用本地策略引擎和中文生成器。worker 事件新增：

```ts
{ type: "analysis-completed"; requestId: string; key: InsightTaskKey;
  analysis: DecisionAnalysisV2 }
```

超时但已有范围时生成低置信度五章分析；完全失败时保留现有失败状态，不阻塞按钮。

- [ ] **Step 5: 持久化与旧版兼容**

`PersistedPreActionInsight` 改成 v1/v2 联合类型。v2 保存 `analysis`，但不保存对手未摊牌具体组合。仓库测试分别往返 v1 和 v2，并断言导出 JSON 不包含 fixture 的隐藏底牌。

- [ ] **Step 6: 运行生成器、worker 和持久化测试**

Run: `npx vitest run src/insights/plainLanguageAnalysis.test.ts src/insights/snapshot.test.ts src/insights/usePreActionInsights.test.tsx src/data/repository.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交共享分析层**

```bash
git add src/insights/plainLanguageAnalysis.ts src/insights/plainLanguageAnalysis.test.ts src/insights/types.ts src/insights/pre-action.worker.ts src/insights/usePreActionInsights.ts src/insights/snapshot.ts src/insights/snapshot.test.ts src/data/repository.test.ts
git commit -m "feat: build shared plain-language analysis"
```

---

### Task 7: 重构牌局中右侧分析为单一顺畅结构

**Files:**
- Modify: `src/components/PreActionInsights.tsx`
- Modify: `src/components/PreActionInsights.test.tsx`
- Modify: `src/mobile/MobileInsightSummary.tsx`
- Create: `src/mobile/MobileInsightSummary.test.tsx`
- Modify: `src/training.css`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Consumes: `PreActionInsightState.analysis?: DecisionAnalysisV2`。
- Produces: 桌面与移动共用的五章中文分析视图。

- [ ] **Step 1: 写入章节顺序和去重复组件测试**

渲染 v2 fixture，断言五个标题按 DOM 顺序出现；英雄范围和对手范围均可见；“标准打法”和“面对这名玩家的调整”分别存在；页面中“权益”“所需胜率”和同一推荐动作不重复出现。另渲染 v1 fixture，断言旧范围仍可查看。

- [ ] **Step 2: 运行测试确认当前组件失败**

Run: `npx vitest run src/components/PreActionInsights.test.tsx`

Expected: FAIL，因为当前组件仍按“成牌路径”和“对手范围与反应”分散展示。

- [ ] **Step 3: 实现五章渲染**

组件只遍历 `analysis.sections`，不自行拼第二套策略结论。`ranges` 章节下允许展开各对手，但展开内容只补充个人差异，不重复总范围。审计信息不在主要区域展示。

v1 数据走一个兼容适配函数生成相同五章顺序；无法补齐的章节写“旧记录未保存这项分析”，不删除旧事实。

- [ ] **Step 4: 让移动端复用同一组件**

`MobileInsightSummary` 继续渲染 `PreActionInsights`，只控制抽屉展开状态，不复制标题或文案。CSS 使用单列自然流，禁止固定高度截断范围内容。

- [ ] **Step 5: 运行桌面与移动组件测试**

Run: `npx vitest run src/components/PreActionInsights.test.tsx src/mobile/MobileInsightSummary.test.tsx src/App.test.tsx`

Expected: PASS。

- [ ] **Step 6: 提交实时分析界面**

```bash
git add src/components/PreActionInsights.tsx src/components/PreActionInsights.test.tsx src/mobile/MobileInsightSummary.tsx src/mobile/MobileInsightSummary.test.tsx src/training.css src/mobile/mobile.css
git commit -m "feat: streamline live poker analysis"
```

---

### Task 8: 让整手复盘复用五章分析

**Files:**
- Modify: `src/review/types.ts`
- Modify: `src/review/deepReview.ts`
- Modify: `src/review/deepReview.test.ts`
- Modify: `src/review/coachNarrative.ts`
- Modify: `src/review/coachNarrative.test.ts`
- Modify: `src/components/DeepHandReview.tsx`
- Modify: `src/components/DeepHandReview.test.tsx`
- Modify: `src/App.deepReview.test.tsx`
- Modify: `src/data/repository.test.ts`

**Interfaces:**
- Consumes: 深度节点计算结果、`DecisionAnalysisV2` 生成器、实际动作和训练标签。
- Produces: `DeepHandReviewV3`，每个决策包含 `analysis: DecisionAnalysisV2` 和复盘差异字段。

- [ ] **Step 1: 写入 v3 与界面去重复失败测试**

```ts
expect(review.version).toBe(3);
expect(review.decisions[0].analysis.sections).toHaveLength(5);
expect(review.decisions[0].analysis.sections[1].kind).toBe("ranges");
expect(JSON.stringify(review)).not.toContain(hiddenHole);
```

组件测试断言五章只出现一次，并显示“你实际选择”“标准建议”“针对调整”“下次先看”；不再同时渲染教练摘要、六张卡、核心规则和专业数据四套重复区域。

- [ ] **Step 2: 运行测试确认 v3 不存在**

Run: `npx vitest run src/review/deepReview.test.ts src/components/DeepHandReview.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 定义 v3 兼容联合类型**

```ts
export type DeepDecisionReviewV3 = DeepDecisionReviewV2 & {
  analysis: DecisionAnalysisV2;
  reviewDifference: {
    actualText: string;
    baselineText: string;
    exploitText: string;
    habitLabel?: string;
    nextTimeFirstCheck: string;
  };
};

export type DeepHandReviewV3 = Omit<DeepHandReviewV2, "version" | "decisions"> & {
  version: 3;
  decisions: DeepDecisionReviewV3[];
};
```

联合类型继续接受 v1/v2。旧版重新精算生成 v3。

- [ ] **Step 4: 深度计算复用中文生成器**

`deepReview.ts` 用精确/确定性深度计算覆盖实时近似的权益、范围和响应事实，然后调用 `buildPlainLanguageAnalysis`。不得在 React 组件内重新计算范围或 EV。

- [ ] **Step 5: 重构复盘视图**

每个决策只渲染：决策标题 → 五章分析 → 实际与标准差异 → 训练标签/下次先看 → 底部审计记录。v1/v2 通过适配器保留全部旧内容，但整理到同样顺序，不显示重复章节。

- [ ] **Step 6: 运行复盘、生命周期和持久化测试**

Run: `npx vitest run src/review src/components/DeepHandReview.test.tsx src/App.deepReview.test.tsx src/data/repository.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交统一复盘**

```bash
git add src/review/types.ts src/review/deepReview.ts src/review/deepReview.test.ts src/review/coachNarrative.ts src/review/coachNarrative.test.ts src/components/DeepHandReview.tsx src/components/DeepHandReview.test.tsx src/App.deepReview.test.tsx src/data/repository.test.ts
git commit -m "feat: unify live and post-hand coaching"
```

---

### Task 9: 压力、性能与双端交付验证

**Files:**
- Modify: `src/strategy/stressGate.test.ts`
- Modify: `src/strategy/multiwayRegression.test.ts`
- Modify: `src/insights/performance.test.ts`

**Interfaces:**
- Consumes: 完整 v2 策略、v2 实时分析和 v3 复盘。
- Produces: 可重复的发布门结果和生产构建。

- [ ] **Step 1: 增加发布门失败断言**

压力测试记录 1,000 手中的：非法策略动作、规则回退、连续三次以上同一双方再加注、全桌翻后全过比例和超池后非空继续比例。断言：

```ts
expect(illegalActions).toBe(0);
expect(chipConservationFailures).toBe(0);
expect(unexplainedFallbacks).toBe(0);
expect(reRaiseLoops).toBe(0);
expect(overbetContinueSamples).toBeGreaterThan(0);
```

- [ ] **Step 2: 运行新增发布门确认能捕捉旧行为或通过新实现**

Run: `RELEASE_STRESS=1 npx vitest run src/strategy/stressGate.test.ts --no-file-parallelism`

Expected: PASS；若失败，只修策略原因，不放宽规则合法性和筹码守恒断言。

- [ ] **Step 3: 运行全量验证**

Run:

```bash
npm test
npm run test:strategy
npm run test:performance
npm run build
npm run verify:mobile-bundle
npm run verify:desktop-data
```

Expected:

- 全部 Vitest 测试通过。
- 1,000 手压力批次全部合法结算并保持筹码守恒。
- 实时分析性能门通过，玩家行动不被 worker 阻塞。
- 桌面与移动生产构建成功。
- 移动 PWA 预缓存完整，不包含私密姓名或密钥。
- 桌面数据契约通过。

- [ ] **Step 4: 检查提交边界**

Run: `git status --short && git diff --check`

Expected: 只剩用户原有的两份 2026-08-26 文档改动，不包含未提交的策略、UI 或构建产物。

- [ ] **Step 5: 提交发布门更新**

```bash
git add src/strategy/stressGate.test.ts src/strategy/multiwayRegression.test.ts src/insights/performance.test.ts
git commit -m "test: gate practical strategy v2 release"
```
