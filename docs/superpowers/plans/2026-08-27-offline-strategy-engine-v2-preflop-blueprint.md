# 离线策略引擎 V2 翻前蓝图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用可审计、版本化的六人桌翻前抽象蓝图替换翻前 `legacy-adapter-v1`，覆盖 25/40/60/100/150/200BB 的首入池、跟注、3-bet、挤压、4-bet、短码全下和盲战，同时保留翻后安全降级。

**Architecture:** 运行时先把公开行动线分类为稳定的翻前节点，再使用 169 手牌类、位置、有效筹码档位和已发生的加注/跟注人数查询紧凑蓝图。完全命中返回 `blueprint`，相邻筹码档位线性混合返回 `interpolated`；画像层只能在蓝图频率上做有界偏移。生成器输出确定性的策略包、清单和哈希，但本阶段明确称为“专家基线 + regret-matching 校准的抽象蓝图”，不冒充完整六人无限注 Solver。

**Tech Stack:** TypeScript 5.8、Vitest、Vite、Node.js 发布期生成脚本、现有 `StrategyResult`/`PublicDecisionState`/规则引擎。

## Global Constraints

- 决策输入只允许使用 `PublicDecisionState` 与独立范围快照，禁止读取未摊牌对手底牌。
- 规则引擎仍是合法动作、最小加注、有效筹码、全下和结算的唯一事实源。
- 策略包固定种子生成；相同配置必须得到相同 manifest 哈希。
- 翻前蓝图直接命中目标 20ms 内，插值目标 50ms 内。
- 非翻前节点继续使用 `legacy-adapter-v1`，并保持不计正式 V2 分。
- 公开构建不得包含本地私有玩家名称、API Key 或授权信息。
- 不修改现有两份未提交的移动布局草案。

---

### Task 1: 翻前节点分类器与标准尺寸

**Files:**
- Create: `src/strategy/preflopNode.ts`
- Create: `src/strategy/preflopNode.test.ts`
- Modify: `src/strategy/types.ts`

**Interfaces:**
- Produces: `classifyPreflopNode(state): PreflopNode`, `nearestStackBuckets(effectiveStackBb): StackInterpolation`, `recommendedRaiseTo(node, state): number`.
- `PreflopSpot` 固定为 `unopened | blind-defense | facing-open | squeeze | facing-3bet | facing-4bet | facing-all-in | isolate-limpers`。

- [ ] **Step 1: 写失败测试**

覆盖 BTN 首入池、BB 对单次开池、有人开池和跟注后的 squeeze、面对 3-bet/4-bet、40BB 与 100BB 之间插值，以及所有推荐尺寸落在 `legal.minRaiseTo...legal.maxRaiseTo`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/strategy/preflopNode.test.ts`

Expected: FAIL because the classifier API does not exist.

- [ ] **Step 3: 实现只读分类器**

按 `state.actions` 中翻前的 `raise/bet/all-in/call` 计数，不从底牌强度反推节点。有效筹码使用决策者与所有未弃牌对手的最大可争夺较小值除以大盲；档位固定为 `[25, 40, 60, 100, 150, 200]`。

- [ ] **Step 4: 实现合法尺寸**

首入池 2.5BB；位置内 3-bet 为开池额约 3 倍、位置外约 4 倍；每位冷跟者增加一个开池额；4-bet 约当前下注 2.25 倍；40BB 以下允许由蓝图选择全下。最终必须钳制到规则引擎合法区间。

- [ ] **Step 5: 运行测试并提交**

```bash
npx vitest run src/strategy/preflopNode.test.ts src/strategy/publicState.test.ts
git add src/strategy/types.ts src/strategy/preflopNode.ts src/strategy/preflopNode.test.ts
git commit -m "feat: classify preflop blueprint nodes"
```

---

### Task 2: 169 手牌抽象和版本化频率蓝图

**Files:**
- Create: `src/strategy/preflopHands.ts`
- Create: `src/strategy/preflopHands.test.ts`
- Create: `src/strategy/preflopBlueprint.ts`
- Create: `src/strategy/preflopBlueprint.test.ts`

**Interfaces:**
- Produces: `ALL_PREFLOP_HANDS`, `handPercentile(hand)`, `lookupPreflopBlueprint(node, hand): BlueprintMix`.
- `BlueprintMix` contains normalized abstract actions `fold | check | call | raise | all-in`, EV ordering, intent, node id, confidence and exact/interpolated source.

- [ ] **Step 1: 写 169 手牌失败测试**

断言正好 169 类且无重复；`AA > AKs > AKo > 72o`；花色置换得到相同 canonical hand 和 percentile。

- [ ] **Step 2: 运行并确认失败**

Run: `npx vitest run src/strategy/preflopHands.test.ts`

- [ ] **Step 3: 实现确定性牌力顺序**

使用对子、两张牌等级、同花、连接度、A/K 阻断与被支配风险构造稳定排序；导出完整 169 类，避免运行时依赖随机数。

- [ ] **Step 4: 写蓝图边界失败测试**

至少断言：UTG 开池窄于 BTN；AA 在常见节点不弃牌；72o 面对 UTG 开池高频弃牌；BB 获得比 CO 冷跟更宽的防守；挤压后的边缘 offsuit broadway 不自动跟注；100BB 普通牌面对 4-bet 不自动继续；25BB 顶端范围可全下；所有频率和为 1。

- [ ] **Step 5: 实现蓝图表与插值**

将每个 `spot × position × stack bucket` 保存为开池/跟注/再加注/全下的手牌百分位边界及边界混合宽度。相邻档位分别查询后线性混合；exact source 为 `blueprint`，混合 source 为 `interpolated`。

- [ ] **Step 6: 运行测试并提交**

```bash
npx vitest run src/strategy/preflopHands.test.ts src/strategy/preflopBlueprint.test.ts
git add src/strategy/preflopHands.ts src/strategy/preflopHands.test.ts src/strategy/preflopBlueprint.ts src/strategy/preflopBlueprint.test.ts
git commit -m "feat: add preflop abstract blueprint"
```

---

### Task 3: 可复现策略包和质量清单

**Files:**
- Create: `scripts/generate-preflop-blueprint.mjs`
- Create: `scripts/generate-preflop-blueprint.test.mjs`
- Create: `src/strategy/data/preflop-blueprint.v1.json`
- Create: `src/strategy/data/preflop-manifest.v1.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run generate:preflop`, deterministic manifest fields `strategyVersion`, `algorithmVersion`, `seed`, `stackBuckets`, `nodeCount`, `iterations`, `averageRegret`, `sha256`, `minimumAppVersion`.

- [ ] **Step 1: 写生成器失败测试**

在两个临时目录用相同配置生成，断言策略文件和 manifest 哈希完全相同；改变 seed 后 manifest seed 改变；缺少质量字段时失败。

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/generate-preflop-blueprint.test.mjs`

- [ ] **Step 3: 实现发布期生成器**

生成器枚举 169 手牌和全部已支持节点，对边界混合用固定种子的 regret matching 校准。它只用于让边界频率稳定和平滑，不把结果描述为完整六人 Solver；输出 canonical JSON 后计算 SHA-256。

- [ ] **Step 4: 加质量闸门**

拒绝频率不归一、非法负频率、节点缺失、平均 regret 非有限或高于 manifest 门槛的输出。生成物不含玩家名称和密钥。

- [ ] **Step 5: 生成、复测并提交**

```bash
npm run generate:preflop
node --test scripts/generate-preflop-blueprint.test.mjs
git add package.json scripts/generate-preflop-blueprint.mjs scripts/generate-preflop-blueprint.test.mjs src/strategy/data/preflop-blueprint.v1.json src/strategy/data/preflop-manifest.v1.json
git commit -m "build: generate deterministic preflop strategy pack"
```

---

### Task 4: 运行时读取、完整性验证和有界画像偏移

**Files:**
- Create: `src/strategy/preflopPack.ts`
- Create: `src/strategy/preflopPack.test.ts`
- Create: `src/strategy/profileDeviation.ts`
- Create: `src/strategy/profileDeviation.test.ts`

**Interfaces:**
- Produces: `loadEmbeddedPreflopPack()`, `verifyPreflopPack(pack, manifest)`, `applyBoundedDeviation(result, tableProfileId, playerProfile)`.

- [ ] **Step 1: 写完整性失败测试**

断言原始包可读；篡改单个频率、版本或哈希后拒绝；失败不得抛到牌桌循环之外。

- [ ] **Step 2: 写画像边界失败测试**

朋友局可以提高入池/跟注频率、宽松疯狂局可以提高攻击频率，但任何单动作频率绝对变化不超过 0.15，频率仍归一且不能产生蓝图没有的非法动作。

- [ ] **Step 3: 实现同步嵌入读取器**

Vite 构建时导入版本化 JSON；首次读取验证 schema、节点数、版本和预生成哈希事实。失败返回结构化错误，由策略门面切换安全降级。

- [ ] **Step 4: 实现有界偏移**

偏移只读取 `tableProfileId` 和公开的 `HandPlayerProfile`，在蓝图频率上重新分配不超过 15 个百分点，并在 `explanationFacts` 标注偏移来源和幅度。

- [ ] **Step 5: 运行测试并提交**

```bash
npx vitest run src/strategy/preflopPack.test.ts src/strategy/profileDeviation.test.ts
git add src/strategy/preflopPack.ts src/strategy/preflopPack.test.ts src/strategy/profileDeviation.ts src/strategy/profileDeviation.test.ts
git commit -m "feat: load and adapt preflop strategy pack"
```

---

### Task 5: 接入统一策略门面、机器人和评分

**Files:**
- Modify: `src/strategy/engine.ts`
- Modify: `src/strategy/engine.test.ts`
- Modify: `src/game/game.test.ts`
- Modify: `src/training/assessment.test.ts`

**Interfaces:**
- Preflop: returns `source: blueprint | interpolated`, `strategyVersion: preflop-abstract-v1`, stable `nodeId`, scored assessment.
- Postflop: remains `source: safe-fallback`, `strategyVersion: legacy-adapter-v1`, unscored assessment.

- [ ] **Step 1: 写路由失败测试**

翻前标准节点必须命中蓝图且不含 fallback；翻后仍安全降级；损坏包时翻前合法继续但 `source` 为 `safe-fallback`。

- [ ] **Step 2: 写统一事实源失败测试**

同一固定种子中，机器人实际动作必须存在于保存的蓝图候选动作；英雄评分引用相同 `strategyVersion/nodeId/source`；重放结果逐字段相同。

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run src/strategy/engine.test.ts src/game/game.test.ts src/training/assessment.test.ts --maxWorkers=2`

- [ ] **Step 4: 实现翻前优先路由**

`createLocalStrategyEngine()` 仅在 `state.street === "preflop"` 时调用蓝图。蓝图动作映射到规则引擎真实的 `minRaiseTo/maxRaiseTo`；normalize 仍执行最终合法性过滤。

- [ ] **Step 5: 运行测试并提交**

```bash
npx vitest run src/strategy/engine.test.ts src/game/game.test.ts src/training/assessment.test.ts --maxWorkers=2
git add src/strategy/engine.ts src/strategy/engine.test.ts src/game/game.test.ts src/training/assessment.test.ts
git commit -m "feat: route preflop decisions through blueprint"
```

---

### Task 6: 实战回归、性能和交付边界

**Files:**
- Create: `src/strategy/preflopRegression.test.ts`
- Modify: `src/strategy/stressGate.test.ts`
- Modify: `scripts/run-strategy-tests.mjs`
- Modify: `scripts/verify-mobile-bundle.mjs`
- Modify: `README.md`

**Interfaces:**
- Produces: fixed preflop regression fixtures and release evidence for blueprint hit rate, legal settlement, deterministic replay and package privacy.

- [ ] **Step 1: 添加固定回归集**

覆盖：BTN 不能和 UTG 一样紧；BB 防守不等于 CO 冷跟；面对 squeeze 的 AJo/KQo 不机械跟注；JTs 面对深筹码 4-bet 不机械反加到全下；25BB 顶端范围可推；有人 limp 时隔离加注而非全员过牌。

- [ ] **Step 2: 扩展压力门禁**

六人桌和单挑各 10,000 手继续断言合法结算、筹码守恒和无循环；另外统计常见翻前决策中 `safe-fallback` 命中率必须为 0，固定种子策略记录完全一致。

- [ ] **Step 3: 验证性能与隐私**

10,000 次标准节点查询的中位数应低于 20ms；移动包必须包含策略数据且不包含私有姓名、API Key、对手暗牌或生成检查点。

- [ ] **Step 4: 更新边界说明**

README 标明翻前已使用 `preflop-abstract-v1`，翻后仍为安全降级；解释这是初中级训练所需的抽象基线，不是完整 Solver 精度。

- [ ] **Step 5: 运行发布门禁**

```bash
npm run test:strategy
npx vitest run --maxWorkers=2
npm run lint
npm run build
npm run verify:mobile-bundle
```

- [ ] **Step 6: 提交阶段二验收**

```bash
git add src/strategy/preflopRegression.test.ts src/strategy/stressGate.test.ts scripts/run-strategy-tests.mjs scripts/verify-mobile-bundle.mjs README.md
git commit -m "test: gate preflop blueprint release"
```

---

## Phase Completion Review

- [ ] 六种筹码档位和八类常见翻前节点有稳定、可解释的蓝图结果。
- [ ] 169 手牌类完整，花色置换不改变策略。
- [ ] 标准节点返回 `blueprint`，相邻栈深返回 `interpolated`，翻后保持明确降级。
- [ ] 画像偏移有界，不能重新引入机械反加或机械跟注。
- [ ] 生成物、manifest 和哈希可复现且不含敏感信息。
- [ ] 机器人、英雄评分、历史策略记录和复盘共用同一翻前结果。
- [ ] 全量规则、策略、存储、桌面与移动离线构建继续通过。

