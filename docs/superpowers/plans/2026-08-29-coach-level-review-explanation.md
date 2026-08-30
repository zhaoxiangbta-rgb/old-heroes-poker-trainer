# 教练级复盘解释 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把整手复盘从专业计算报表改成包含牌力层级、对手范围概率、行动含义、后续牌路、动作比较和结论变化条件的离线教练式分析。

**Architecture:** 继续以现有深度精算和实时洞察为唯一事实源，在 `src/review` 内新增纯函数事实汇总与中文解释层；精算过程一次生成版本化 `CoachDecisionFacts`，React 组件只负责分层展示，不在渲染时重新计算权益。旧版复盘保持可读，v2 结果新增教练事实，专业数据折叠展示。

**Tech Stack:** React 19、TypeScript 5.8、Vitest、Testing Library、现有本地范围/权益/牌型引擎、Tauri 2、IndexedDB/SQLite 现有持久化路径。

## Global Constraints

- 完全离线；不依赖 Codex、Python、Node、网络或外接 AI 才能生成完整复盘。
- 本地规则、范围和 EV 引擎是唯一事实源；可选语言模型不得覆盖本地结论。
- 不读取未摊牌对手真实底牌，不按本手输赢改变评价。
- 概率均明确为本地模型估计；互斥范围、行动反应和终局牌型内部合计误差小于 `1e-9`。
- 解释层不得重复运行昂贵权益计算，必须消费精算过程已经生成的结构化事实。
- 桌面、移动端、历史牌局和 JSON 导入后的复盘语义一致。
- 不修改左侧牌桌和下注区布局。

---

## File Structure

- Create `src/review/coachFacts.ts`: 牌力百分位、范围分类、行动反应、身后联合风险和牌路事实的纯函数。
- Create `src/review/coachFacts.test.ts`: 数学、互斥概率、隐藏牌隔离和三条语义测试。
- Create `src/review/coachNarrative.ts`: 只消费 `CoachDecisionFacts` 的确定性中文解释模板。
- Create `src/review/coachNarrative.test.ts`: 教学文案、边界情况和确定性测试。
- Modify `src/review/types.ts`: 新增 v2 教练事实类型，同时保留 v1 读取类型。
- Modify `src/review/deepReview.ts`: 在现有范围与节点计算过程中生成事实和解释，不重复计算节点 EV。
- Modify `src/insights/types.ts`: 为互斥终局牌型增加明确的语义字段。
- Modify `src/insights/runoutProjection.ts`: 标注当前牌型、至少保持牌型和互斥终局分布。
- Modify `src/components/PreActionInsights.tsx`: 修正“已成三条却显示三条概率”的文案。
- Modify `src/components/PreActionInsights.test.tsx`: 验证“仍为三条/至少三条”的显示。
- Modify `src/components/DeepHandReview.tsx`: 教练结论、六张教学卡片和专业依据折叠区。
- Modify `src/components/DeepHandReview.test.tsx`: 验证默认层、展开层和旧版兼容。
- Modify `src/training.css`: 桌面复盘卡片、概率条和折叠区样式。
- Modify `src/mobile/mobile.css`: iPhone 14 Pro Max 纵向布局及触控可读性。
- Modify `src/game/game.ts`: 读取 v1/v2 深度复盘并保留旧数据重算入口。
- Modify `src/data/repository.test.ts`: v2 持久化和旧版读取回归。
- Modify `src/App.deepReview.test.tsx`: 完成、重新精算和历史恢复的 v2 回归。

---

### Task 1: 定义 v2 教练事实与旧版兼容边界

**Files:**
- Modify: `src/review/types.ts`
- Modify: `src/game/game.ts`
- Test: `src/data/repository.test.ts`

**Interfaces:**
- Consumes: 现有 `DeepDecisionReview`、`PersistedPreActionInsight` 和 `ReviewPrecision`。
- Produces: `CoachDecisionFacts`、`OpponentBucketFact`、`RunoutFact`、`DeepDecisionReviewV1`、`DeepDecisionReviewV2`、`DeepHandReviewV1`、`DeepHandReviewV2`、联合类型 `DeepHandReview`。

- [ ] **Step 1: 写入 v2 序列化失败测试**

在 `src/data/repository.test.ts` 构造一手 `version: 2` 的已完成复盘，加入一个最小 `coach` 对象，保存并读取后断言：

```ts
expect(rows[0].deepReview).toMatchObject({
  version: 2,
  decisions: [{
    coach: {
      madeHandLabel: "顶对",
      opponentBuckets: expect.any(Array),
      recommendationReasons: expect.any(Array),
    },
  }],
});
```

同一测试再写入现有 `version: 1` 对象，并断言旧数据仍保留且 `deepReviewStatus === "completed"`。

- [ ] **Step 2: 运行测试确认类型或断言失败**

Run: `npx vitest run src/data/repository.test.ts`

Expected: FAIL，因为 `DeepHandReview` 只允许 `version: 1`，决策中没有 `coach`。

- [ ] **Step 3: 定义明确的版本化类型**

在 `src/review/types.ts` 增加：

```ts
export type OpponentBucketKind =
  | "strong-made" | "top-pair" | "medium-made"
  | "strong-draw" | "weak-draw" | "air"
  | "premium-pair" | "medium-pair" | "strong-ace"
  | "suited-connector" | "wide-call" | "weak-preflop";

export type CoachDecisionFacts = {
  madeHandLabel: string;
  heroRangePercentile: number | null;
  equityVsFullRange: number;
  equityVsContinueRange: number | null;
  opponentBuckets: Array<{ kind: OpponentBucketKind; probability: number }>;
  opponentResponses: Array<{ action: "fold" | "call" | "raise"; probability: number }>;
  atLeastOnePlayerBehindContinues: number | null;
  runoutSummary: Array<{ label: string; probability: number; mutuallyExclusive: boolean }>;
  recommendationReasons: string[];
  changeConditions: string[];
  confidence: number;
  narrative: string;
};
```

把原决策结构命名为 `DeepDecisionReviewV1`，新增 `DeepDecisionReviewV2 = DeepDecisionReviewV1 & { coach: CoachDecisionFacts }`。把原整手结构命名为 `DeepHandReviewV1`；新增 `DeepHandReviewV2`，固定 `version: 2` 且 `decisions: DeepDecisionReviewV2[]`；最后导出 `type DeepHandReview = DeepHandReviewV1 | DeepHandReviewV2`。`game.ts` 的恢复逻辑接受版本 1 和 2，只在状态哈希或状态非法时丢弃结果。

- [ ] **Step 4: 运行持久化与类型检查**

Run: `npx vitest run src/data/repository.test.ts && npx tsc -b --pretty false`

Expected: PASS。

- [ ] **Step 5: 提交版本边界**

```bash
git add src/review/types.ts src/game/game.ts src/data/repository.test.ts
git commit -m "feat: version coach review facts"
```

---

### Task 2: 修正实时“成牌路径”的互斥语义

**Files:**
- Modify: `src/insights/types.ts`
- Modify: `src/insights/runoutProjection.ts`
- Modify: `src/insights/runoutProjection.test.ts`
- Modify: `src/components/PreActionInsights.tsx`
- Modify: `src/components/PreActionInsights.test.tsx`

**Interfaces:**
- Consumes: `calculateExactProjection(input, opponentRanges, cancelled?)`。
- Produces: `ExactProjection.currentHand`、`ExactProjection.atLeastCurrentByRiver`，以及明确标记为互斥的 `handClasses`。

- [ ] **Step 1: 写入翻牌三条的精确语义测试**

在 `src/insights/runoutProjection.test.ts` 使用英雄 `9h 9d`、翻牌 `9c 3s 2h`，断言：

```ts
expect(result.currentHand.name).toBe("三条");
expect(result.atLeastCurrentByRiver).toBe(1);
expect(result.handClasses.find((item) => item.name === "三条")?.byRiver)
  .toBeCloseTo(720 / 1081, 10);
expect(result.handClasses.reduce((sum, item) => sum + item.byRiver, 0)).toBeCloseTo(1, 10);
```

在组件测试断言页面包含“当前已成三条”“到河牌至少保持三条 100.0%”“仍为三条 66.6%”，且不再单独显示含义不明的“三条 到河牌 66.6%”。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/insights/runoutProjection.test.ts src/components/PreActionInsights.test.tsx`

Expected: FAIL，因为当前投影没有 `currentHand` 和 `atLeastCurrentByRiver`。

- [ ] **Step 3: 增加当前牌型与累计下限**

在 `runoutProjection.ts` 用 `bestHand([...heroHole, ...board])` 得到当前牌型。`atLeastCurrentByRiver` 等于终局分布中 `category >= currentHand.category` 的概率和。保持 `handClasses` 为互斥最终类别，不改变现有枚举结果。

在 `PreActionInsights.tsx`：

- 标题改为“后续牌型变化（精确）”。
- 顶部显示“当前已成{牌型}”。
- 显示“到河牌至少保持{牌型} {百分比}”。
- 当前类别写“仍为{牌型}”，更高类别写“升级为{牌型}”，更低类别仅在确实可能出现时写“变为{牌型}”。

- [ ] **Step 4: 运行精确投影与组件测试**

Run: `npx vitest run src/insights/runoutProjection.test.ts src/components/PreActionInsights.test.tsx src/insights/performance.test.ts`

Expected: PASS，且性能门禁不退化。

- [ ] **Step 5: 提交语义修正**

```bash
git add src/insights/types.ts src/insights/runoutProjection.ts src/insights/runoutProjection.test.ts src/components/PreActionInsights.tsx src/components/PreActionInsights.test.tsx
git commit -m "fix: clarify exclusive runout probabilities"
```

---

### Task 3: 生成牌力、范围类别和反应概率事实

**Files:**
- Create: `src/review/coachFacts.ts`
- Create: `src/review/coachFacts.test.ts`
- Modify: `src/review/deepReview.ts`

**Interfaces:**
- Consumes: `DeepDecisionInput`、英雄合理范围、`rangesBySeat`、`DeepNodeCalculation`、推荐动作和可选 `PersistedPreActionInsight`。
- Produces: `buildCoachFacts(input: CoachFactInput): Omit<CoachDecisionFacts, "narrative">`。

- [ ] **Step 1: 写入范围分类与归一化失败测试**

覆盖以下固定场景：

```ts
const facts = buildCoachFacts(fixture);
expect(facts.opponentBuckets.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
expect(facts.opponentResponses.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
expect(facts.heroRangePercentile).toBeGreaterThanOrEqual(0);
expect(facts.heroRangePercentile).toBeLessThanOrEqual(1);
expect(facts.equityVsFullRange).toBe(fixture.calculation.equity);
```

另测两名身后玩家继续率分别为 `0.2`、`0.3` 时，联合风险为 `1 - 0.8 * 0.7 = 0.44`；空范围不得产生 `NaN`；序列化结果不得包含 fixture 中未摊牌底牌字符串。

- [ ] **Step 2: 运行测试确认模块不存在**

Run: `npx vitest run src/review/coachFacts.test.ts`

Expected: FAIL，找不到 `coachFacts` 模块。

- [ ] **Step 3: 实现互斥范围桶**

在 `coachFacts.ts` 创建纯函数：

```ts
export function normalizeBuckets(weights: Record<OpponentBucketKind, number>):
  Array<{ kind: OpponentBucketKind; probability: number }>;

export function combinedContinueRisk(probabilities: readonly number[]): number;

export function buildCoachFacts(input: CoachFactInput):
  Omit<CoachDecisionFacts, "narrative">;
```

翻后按以下优先顺序只归入一个桶：两对及以上 → 顶对/超对 → 其他成对牌 → 强听牌 → 弱听牌 → 空气。使用组合权重求和后统一归一化；不得让同一组合同时进入“顶对”和“强听牌”。翻前使用 `premium-pair`、`medium-pair`、`strong-ace`、`suited-connector`、`wide-call`、`weak-preflop` 六个互斥桶，不调用 `bestHand`。

- [ ] **Step 4: 计算英雄范围位置和继续范围权益**

英雄合理范围用与对手相同的公开行动线和位置范围模型生成，移除已知牌冲突；`heroRangePercentile` 是该范围中不强于英雄当前手牌的权重比例。

优先复用该决策快照中的 `preActionInsight.responses` 得到弃牌/跟注/加注概率和继续范围摘要。缺少实时快照时，按深度范围权重和现有策略反应函数生成；不能用常数补齐。`equityVsContinueRange` 只在存在合法下注/加注且继续范围非空时计算，否则为 `null`。

- [ ] **Step 5: 把事实生成接入深度精算循环**

在 `deepReview.ts` 已经得到 `rangesBySeat`、`calculation`、`recommended` 和 `outs` 后调用 `buildCoachFacts`。把函数所需的中间统计随同当前决策保存，禁止重新调用 `calculateHeadsUpNode`、`calculateMultiwayNode` 或 `calculatePreflopNode`。

- [ ] **Step 6: 运行数学、泄漏和确定性测试**

Run: `npx vitest run src/review/coachFacts.test.ts src/review/deepReview.test.ts`

Expected: PASS；相同输入两次生成的概率、排序和百分位完全一致。

- [ ] **Step 7: 提交事实层**

```bash
git add src/review/coachFacts.ts src/review/coachFacts.test.ts src/review/deepReview.ts
git commit -m "feat: derive coach review facts"
```

---

### Task 4: 生成确定性的教练中文解释

**Files:**
- Create: `src/review/coachNarrative.ts`
- Create: `src/review/coachNarrative.test.ts`
- Modify: `src/review/deepReview.ts`

**Interfaces:**
- Consumes: `CoachDecisionFacts`（除 `narrative`）、决策点合法动作与推荐动作。
- Produces: `buildCoachNarrative(input: CoachNarrativeInput): { narrative: string; recommendationReasons: string[]; changeConditions: string[] }`。

- [ ] **Step 1: 写入教练解释失败测试**

使用固定事实断言解释同时出现牌型、范围比例、权益、价格、身后风险和动作原因：

```ts
expect(result.narrative).toContain("顶对中等踢脚");
expect(result.narrative).toContain("两对及以上约 18%");
expect(result.narrative).toContain("预计权益 36.7%");
expect(result.narrative).toContain("只需要约 18.8%");
expect(result.narrative).toContain("身后还有 2 人");
expect(result.changeConditions.length).toBeGreaterThan(0);
```

另测：河牌不出现补牌句；低置信度使用“倾向于”；已成三条使用“至少保持三条”，不出现“击中三条”；相同输入文本完全一致。

- [ ] **Step 2: 运行测试确认模块不存在**

Run: `npx vitest run src/review/coachNarrative.test.ts`

Expected: FAIL，找不到 `coachNarrative` 模块。

- [ ] **Step 3: 实现五段式本地模板**

实现固定顺序：当前牌力 → 对手范围 → 价格与人数 → 动作比较 → 推荐和变化条件。百分比统一通过一个 `formatPercent(value, digits)` 函数格式化；低于 55% 置信度使用“粗略估计”，55% 至 75% 使用“倾向估计”，高于 75% 使用“较有把握地估计”。

每条解释至少引用牌力、范围、价格或人数中的三个具体事实。禁止生成没有量化支撑的独立句子“有一定摊牌价值”“范围较宽”“需要谨慎”。

- [ ] **Step 4: 接入精算结果但不接入模型调用**

`deepReview.ts` 在 `buildCoachFacts` 后调用一次 `buildCoachNarrative`，将返回的 `narrative`、`recommendationReasons` 和 `changeConditions` 写入 v2 决策。不得从设置中读取 API Key，也不得调用网络。

- [ ] **Step 5: 运行模板与深度复盘测试**

Run: `npx vitest run src/review/coachNarrative.test.ts src/review/deepReview.test.ts`

Expected: PASS，且隐藏底牌泄漏测试继续通过。

- [ ] **Step 6: 提交解释层**

```bash
git add src/review/coachNarrative.ts src/review/coachNarrative.test.ts src/review/deepReview.ts
git commit -m "feat: explain reviews with local coach narrative"
```

---

### Task 5: 重构复盘界面为三层教学信息

**Files:**
- Modify: `src/components/DeepHandReview.tsx`
- Modify: `src/components/DeepHandReview.test.tsx`
- Modify: `src/training.css`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Consumes: `DeepHandReview` v1/v2 联合类型。
- Produces: v2 教练结论、六张教学卡片、可展开专业依据；v1 继续显示旧版复盘并提供重算提示。

- [ ] **Step 1: 写入 v2 默认显示和专业折叠测试**

把组件 fixture 升级为 v2，并断言：

```ts
expect(screen.getByText(/顶对中等踢脚/)).toBeTruthy();
expect(screen.getByText("你的牌力")).toBeTruthy();
expect(screen.getByText("对手可能有什么牌")).toBeTruthy();
expect(screen.getByText("对手这次行动代表什么")).toBeTruthy();
expect(screen.getByText("后续牌路")).toBeTruthy();
expect(screen.getByText("动作比较")).toBeTruthy();
expect(screen.getByText("什么情况会改变结论")).toBeTruthy();
expect(screen.queryByText(/确定性模拟 · 样本/)).toBeNull();
```

点击“查看专业计算依据”后，断言出现“有效组合”“样本 20000”“覆盖率 100%”。另加 v1 fixture，断言出现“旧版复盘”和“使用当前版本重新精算”，组件不崩溃。

- [ ] **Step 2: 运行组件测试确认失败**

Run: `npx vitest run src/components/DeepHandReview.test.tsx`

Expected: FAIL，因为当前组件只展示“范围变化”和“赔率与补牌”。

- [ ] **Step 3: 拆分小型展示组件**

在同一文件内建立职责清晰的内部组件：

```tsx
function CoachSummary({ decision }: { decision: DeepDecisionReviewV2 }) {
  return <p className="coach-summary">{decision.coach.narrative}</p>;
}

function ProbabilityBar({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100);
  return <div className="coach-probability"><span>{label}</span><meter min="0" max="1" value={value} /><b>{percent}%</b></div>;
}

function TeachingCards({ decision }: { decision: DeepDecisionReviewV2 }) {
  return <div className="coach-card-grid" aria-label="教练分析">{decision.coach.opponentBuckets.map((bucket) =>
    <ProbabilityBar key={bucket.kind} label={bucket.kind} value={bucket.probability} />
  )}</div>;
}

function TechnicalDetails({ decision }: { decision: DeepDecisionReviewV1 | DeepDecisionReviewV2 }) {
  return <details><summary>查看专业计算依据</summary><p>权益 {(decision.equity * 100).toFixed(1)}%</p></details>;
}
```

`TechnicalDetails` 使用原生 `<details>`，默认关闭。范围组合、精确权益、所需胜率、SPR、补牌、计算方法、样本和覆盖率只放在这里。每个术语旁增加一行短解释，例如“所需胜率：这次跟注至少需要达到的胜率”。

- [ ] **Step 4: 实现桌面样式**

在 `training.css` 使用当前黑金做旧视觉，不改变牌桌和下注区：教练结论占满复盘宽度；六张卡片采用 `repeat(2, minmax(0, 1fr))`；概率条同时显示名称、百分比和宽度；不使用只靠红绿区分的状态。

- [ ] **Step 5: 实现移动纵向样式**

在 `mobile.css` 将教学卡片改为单列；正文不低于 `14px`，按钮和 `<summary>` 最小触控高度 `44px`；长范围名称可换行，页面横向不得溢出。不得缩放整个桌面复盘来适配手机。

- [ ] **Step 6: 运行组件和移动回归**

Run: `npx vitest run src/components/DeepHandReview.test.tsx src/App.deepReview.test.tsx`

Expected: PASS。

Run: `npm run build && npm run verify:mobile-bundle`

Expected: PASS，移动离线 bundle 能加载新组件与样式。

- [ ] **Step 7: 提交界面分层**

```bash
git add src/components/DeepHandReview.tsx src/components/DeepHandReview.test.tsx src/training.css src/mobile/mobile.css
git commit -m "feat: present coach-level hand reviews"
```

---

### Task 6: 完成生命周期、性能与全量回归

**Files:**
- Modify: `src/App.deepReview.test.tsx`
- Modify: `src/review/deepReview.test.ts`
- Modify: `src/review/useDeepReview.test.tsx`
- Modify: `src/data/repository.test.ts`

**Interfaces:**
- Consumes: 完整 v2 深度复盘管线。
- Produces: 可重复、可取消、可持久化、可在桌面和移动端离线打开的交付状态。

- [ ] **Step 1: 增加完整生命周期测试**

覆盖：完成后存储 v2；取消不保存半成品；旧版打开后可重新精算为 v2；同一手相同输入两次得到相同教练概率和文本；JSON 往返不丢 `coach`；未摊牌底牌不出现在序列化文本中。

具体断言：

```ts
expect(stored[0].deepReview?.version).toBe(2);
expect(stored[0].deepReview?.decisions[0]).toHaveProperty("coach.narrative");
expect(JSON.stringify(stored[0].deepReview)).not.toContain(hiddenHole);
expect(replay.decisions.map((item) => item.coach))
  .toEqual(first.decisions.map((item) => item.coach));
```

- [ ] **Step 2: 运行定向测试并修复真实失败**

Run: `npx vitest run src/review src/components/DeepHandReview.test.tsx src/App.deepReview.test.tsx src/data/repository.test.ts`

Expected: PASS。若失败，只修复与 v2 数据、解释或兼容直接相关的问题，不改牌桌布局和策略预算。

- [ ] **Step 3: 运行全量单元与策略回归**

Run: `npm test`

Expected: PASS。

Run: `npm run test:strategy`

Expected: PASS，现有合法下注和 EV 策略回归不变。

- [ ] **Step 4: 运行性能、构建和离线验证**

Run: `npm run test:performance`

Expected: PASS，牌局实时洞察预算不退化。

Run: `npm run build && npm run verify:mobile-bundle && npm run verify:desktop-data`

Expected: PASS，桌面和移动产物均包含 v2 复盘代码，且不包含私有姓名或密钥。

- [ ] **Step 5: 检查工作区边界并提交回归**

Run: `git status --short`

Expected: 只出现本计划触及文件；用户原有的两份 2026-08-26 文档改动仍保持未暂存。

```bash
git add src/App.deepReview.test.tsx src/review/deepReview.test.ts src/review/useDeepReview.test.tsx src/data/repository.test.ts
git commit -m "test: verify coach review lifecycle"
```

---

## Final Verification Checklist

- [ ] `9h 9d` 在 `9c 3s 2h` 上显示“当前已成三条”“至少保持三条 100%”“仍为三条 66.6%”。
- [ ] 每个 v2 决策默认出现具体牌力、范围类别概率、权益与所需胜率、身后风险、推荐理由和变化条件。
- [ ] 专业组合数、SPR、样本和覆盖率默认折叠，展开后有中文解释。
- [ ] 范围桶和反应概率分别合计 100%，多人身后风险使用联合概率。
- [ ] 没有未摊牌底牌泄漏，没有网络依赖，相同输入输出一致。
- [ ] v1 历史复盘可打开并可重新精算为 v2。
- [ ] 全量测试、策略测试、性能门禁、桌面构建和移动 bundle 验证全部通过。
