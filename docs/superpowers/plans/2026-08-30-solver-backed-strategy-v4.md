# Solver 支撑的离线策略 V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个开发期由开源 Solver 生成和校验、正式应用完全离线运行，并能可靠训练初中级玩家的组合级策略 V4。

**Architecture:** 新增 `PokerFactsV4 → RangeStateV4 → SolverBlueprintV4 → CandidateEvaluatorV4 → DominanceGateV4 → ProfileAdjustmentV4 → CoachFactsV4` 数据链。V3 继续作为历史兼容层；V4 从黄金牌例开始逐层替换，不允许图片、文案或玩家画像绕过标准策略事实。

**Tech Stack:** React 19、TypeScript、Vitest、Tauri 2、Rust 开发期 Solver、SQLite/IndexedDB、Vite Worker、Node 构建脚本。

## Global Constraints

- 正式桌面和移动应用不得依赖 Solver、Python、Rust、Node、网络或大模型。
- 默认六人现金局 1/2、200 筹码，即 100 BB；桌面策略包不得超过 500 MB。
- 规则引擎继续唯一负责 52 张牌、合法下注、筹码、边池、评牌与结算。
- 未摊牌对手暗牌不得进入玩家建议、范围更新、日志或导出。
- 标准策略先于朋友局和玩家画像；画像不得恢复 DominanceGateV4 淘汰的动作。
- 桌面与移动使用同一源策略版本；旧牌局继续按旧策略事实重放。
- 所有实现按 TDD 红灯、最小实现、绿灯顺序完成。

---

### Task 1: 组合事实 PokerFactsV4

**Files:**
- Create: `src/strategy/v4/pokerFacts.ts`
- Create: `src/strategy/v4/pokerFacts.test.ts`
- Modify: `src/policy/handFeatures.ts`
- Test: `src/policy/handFeatures.test.ts`

**Interfaces:**
- Consumes: `Card`, `bestHand(cards)`, `extractHandFeatures(hole, board)`。
- Produces: `analyzePokerFactsV4(hole, board, opponentRange?): PokerFactsV4`。

- [ ] **Step 1: 写公共牌贡献与空气端失败测试**

```ts
expect(analyzePokerFactsV4(["2h", "3h"], ["Jh", "4d", "Jc"]))
  .toMatchObject({ boardCategory: "pair", privateContribution: "none", relativeClass: "air" });
expect(analyzePokerFactsV4(["4h", "3h"], ["Jh", "4d", "Jc"]))
  .toMatchObject({ privateContribution: "two-pair" });
```

- [ ] **Step 2: 运行测试确认旧实现缺少接口**

Run: `npm test -- --run src/strategy/v4/pokerFacts.test.ts`
Expected: FAIL，提示模块或导出不存在。

- [ ] **Step 3: 实现逐层事实结构**

实现 `PokerFactsV4`、公共牌类别、底牌贡献、踢脚、真实听牌、仅后门听牌、阻断牌、干净/脏补牌和相对牌力。保持 `absoluteCategory` 与 `privateContribution` 独立。

- [ ] **Step 4: 扩充属性测试**

覆盖公共牌一对/两对/三条/顺子/同花、口袋对改善、踢脚改善、后门花不等于真实花听牌、公共牌成牌和平分。

- [ ] **Step 5: 运行事实层测试**

Run: `npm test -- --run src/strategy/v4/pokerFacts.test.ts src/policy/handFeatures.test.ts src/engine/evaluator.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/strategy/v4/pokerFacts.ts src/strategy/v4/pokerFacts.test.ts src/policy/handFeatures.ts src/policy/handFeatures.test.ts
git commit -m "feat: add v4 combo contribution facts"
```

### Task 2: 支配动作淘汰 DominanceGateV4

**Files:**
- Create: `src/strategy/v4/dominanceGate.ts`
- Create: `src/strategy/v4/dominanceGate.test.ts`
- Modify: `src/strategy/types.ts`
- Modify: `src/strategy/v3/postflopStrategy.ts`
- Test: `src/strategy/v3/postflopStrategy.test.ts`

**Interfaces:**
- Consumes: `PokerFactsV4`, `StrategyAction[]`, pot、requiredEquity、response segments。
- Produces: `applyDominanceGateV4(input): { actions: StrategyAction[]; rejected: RejectedActionV4[] }`。

- [ ] **Step 1: 写严重负 EV 跟注与无依据反加失败测试**

```ts
expect(gate.actions.some((action) => action.action === "call")).toBe(false);
expect(gate.actions.some((action) => action.action === "raise")).toBe(false);
expect(gate.rejected.map((item) => item.reason)).toContain("insufficient-equity");
```

- [ ] **Step 2: 运行红灯测试**

Run: `npm test -- --run src/strategy/v4/dominanceGate.test.ts`
Expected: FAIL，提示 `applyDominanceGateV4` 不存在。

- [ ] **Step 3: 实现六类门槛**

实现 `insufficient-equity`、`unsupported-raise`、`no-worse-calls`、`no-fold-targets`、`backdoor-only`、`river-bluff-catch-fails`。保留 Solver 明确支持且 `EV >= bestEV - 0.03 * pot` 的低频混合。

- [ ] **Step 4: 接入单挑翻后 V3/V4 边界**

在 `decidePostflopV3` 输出动作后、画像调整前应用门槛，并把拒绝原因写入 `explanationFacts.dominanceRejected`。没有可继续动作时保留合法弃牌或过牌。

- [ ] **Step 5: 回归朋友局不能恢复空气跟注**

对 `2h3h / Jh4dJc` 面对满池，以及空气牌连续满池/半池下注，断言标准局、朋友局、宽松疯狂局均不把跟注或反加设为主要动作。

- [ ] **Step 6: 运行策略测试并提交**

Run: `npm test -- --run src/strategy/v4/dominanceGate.test.ts src/strategy/v3/postflopStrategy.test.ts src/policy/tableProfiles.test.ts`
Expected: PASS。

```bash
git add src/strategy/v4/dominanceGate.ts src/strategy/v4/dominanceGate.test.ts src/strategy/types.ts src/strategy/v3/postflopStrategy.ts src/strategy/v3/postflopStrategy.test.ts src/policy/tableProfiles.test.ts
git commit -m "feat: reject dominated poker actions"
```

### Task 3: 跨街计划 StreetPlanV4

**Files:**
- Create: `src/strategy/v4/streetPlan.ts`
- Create: `src/strategy/v4/streetPlan.test.ts`
- Modify: `src/strategy/types.ts`
- Modify: `src/game/game.ts`
- Modify: `src/data/types.ts`
- Modify: `src/data/repository.ts`
- Test: `src/game/game.test.ts`
- Test: `src/data/repository.test.ts`

**Interfaces:**
- Produces: `createStreetPlanV4(input): StreetPlanV4`、`updateStreetPlanV4(plan, runout, action): StreetPlanV4`。
- Persistence: `StrategyDecisionRecord.streetPlan?: StreetPlanV4`，缺失时兼容旧记录。

- [ ] **Step 1: 写跨街连续性与旧记录兼容失败测试**

断言半诈唬翻牌计划在转牌未完成时保留放弃/继续条件，纯空气计划不能每街重置为新的高频诈唬；旧 JSON 没有 `streetPlan` 仍可导入。

- [ ] **Step 2: 运行红灯测试**

Run: `npm test -- --run src/strategy/v4/streetPlan.test.ts src/data/repository.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现计划创建、更新和哈希**

计划保存 reason、targetCombos、foldTargets、continueOn、abandonOn、createdAtStreet 和来源节点。更新必须记录反转原因。

- [ ] **Step 4: 接入机器人和英雄决策记录**

`commitBot` 与英雄提交动作后保存所选动作对应计划；下一街构造策略请求时附带上一计划，但不绕过公开状态和范围。

- [ ] **Step 5: 运行重放测试并提交**

Run: `npm test -- --run src/strategy/v4/streetPlan.test.ts src/game/game.test.ts src/data/repository.test.ts src/game/playback.test.ts`
Expected: PASS。

```bash
git add src/strategy/v4/streetPlan.ts src/strategy/v4/streetPlan.test.ts src/strategy/types.ts src/game/game.ts src/data/types.ts src/data/repository.ts src/game/game.test.ts src/data/repository.test.ts
git commit -m "feat: persist cross-street strategy plans"
```

### Task 4: 玩家画像理性边界

**Files:**
- Create: `src/strategy/v4/profileAdjustment.ts`
- Create: `src/strategy/v4/profileAdjustment.test.ts`
- Modify: `src/strategy/profileDeviation.ts`
- Modify: `src/policy/tableProfiles.ts`
- Test: `src/strategy/behaviorRegression.test.ts`

**Interfaces:**
- Consumes: 已通过门槛的标准动作、牌局风格、个人画像。
- Produces: `adjustProfileV4(input): { actions; adjustments }`，不得新增动作键。

- [ ] **Step 1: 写朋友局空气跟注不可复活测试**

```ts
expect(adjusted.actions.map(actionKey)).toEqual(baseline.actions.map(actionKey));
expect(adjusted.actions.find((item) => item.action === "call")).toBeUndefined();
```

- [ ] **Step 2: 实现频率偏移上限**

每个动作频率相对标准策略最大移动 15 个百分点；河牌大额加注诈唬只允许向下调整；动作集合保持不变。

- [ ] **Step 3: 保存调整原因与标准频率**

输出 `profileAdjustments`，包含 `actionKey`、`before`、`after`、`reason`。

- [ ] **Step 4: 运行三种牌局风格测试并提交**

Run: `npm test -- --run src/strategy/v4/profileAdjustment.test.ts src/strategy/profileDeviation.test.ts src/strategy/behaviorRegression.test.ts`
Expected: PASS。

```bash
git add src/strategy/v4/profileAdjustment.ts src/strategy/v4/profileAdjustment.test.ts src/strategy/profileDeviation.ts src/policy/tableProfiles.ts src/strategy/behaviorRegression.test.ts
git commit -m "feat: bound opponent profile deviations"
```

### Task 5: 黄金牌例与理性属性门禁

**Files:**
- Create: `src/strategy/v4/goldenSpots.ts`
- Create: `src/strategy/v4/goldenSpots.test.ts`
- Create: `scripts/audit-strategy-v4.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `GOLDEN_SPOTS_V4`、`npm run audit:strategy-v4`。

- [ ] **Step 1: 编码首批用户反例**

每个案例保存公开状态、英雄底牌、对手逐组合范围、牌局风格、允许主要动作、禁止动作和解释关键词。不得在策略实现中读取案例 ID。

- [ ] **Step 2: 增加属性生成器**

生成公共牌成牌、空气面对不同尺度、顶两对遇顺面、河牌抓诈唬和多人身后风险的同类变体。

- [ ] **Step 3: 增加 10,000 手扫描命令**

审计非法动作、严重负 EV 继续、无止境反加、纯空气连续三街付费和确定性重放差异。

- [ ] **Step 4: 运行审计并提交**

Run: `npm run audit:strategy-v4`
Expected: 输出黄金牌例数量、变体数量、随机手数，0 个致命问题。

```bash
git add src/strategy/v4/goldenSpots.ts src/strategy/v4/goldenSpots.test.ts scripts/audit-strategy-v4.mjs package.json
git commit -m "test: add v4 poker rationality gates"
```

### Task 6: Solver 生成适配器与可审计策略包

**Files:**
- Create: `tools/solver-v4/README.md`
- Create: `tools/solver-v4/schema.ts`
- Create: `tools/solver-v4/import-solve.mjs`
- Create: `tools/solver-v4/normalize-solve.mjs`
- Create: `tools/solver-v4/fixtures/mit-solver-sample.json`
- Create: `src/strategy/v4/solverPack.ts`
- Create: `src/strategy/v4/solverPack.test.ts`
- Create: `scripts/build-strategy-v4.mjs`
- Modify: `package.json`

**Interfaces:**
- Input: 通用 Solver JSON，包含 ranges、board、tree、combo strategies、EV、exploitability 和 source metadata。
- Output: `public/strategy/v4/manifest.json` 与分片二进制/JSON。
- Runtime: `loadSolverPackV4(bytes, manifest)`、`lookupSolverNodeV4(query)`。

- [ ] **Step 1: 写 schema、哈希和损坏包失败测试**

断言相同输入生成相同 SHA-256；节点缺手牌、频率不归一、动作非法或哈希错误时拒绝加载。

- [ ] **Step 2: 实现通用导入协议**

开发默认使用 MIT `amaster97/poker_solver` 导出的 JSON，但导入器只依赖规范字段。Solver 仓库和运行时不复制进发布包。

- [ ] **Step 3: 实现花色同构、量化和分片**

同构牌面映射到规范牌面；频率使用 16 bit 量化，EV 使用 32 bit；按 potType/position/boardFamily 分片。

- [ ] **Step 4: 生成首批参考节点并记录来源**

首批至少包含黄金牌例对应牌面族及干燥 A 高、成对面、两同花和高连接面。manifest 保存 Solver 版本、配置、迭代、exploitability 和源哈希。

- [ ] **Step 5: 运行包测试并提交**

Run: `npm test -- --run src/strategy/v4/solverPack.test.ts && npm run build:strategy-v4`
Expected: PASS，输出桌面/移动大小、节点数和 SHA-256。

```bash
git add tools/solver-v4 src/strategy/v4/solverPack.ts src/strategy/v4/solverPack.test.ts scripts/build-strategy-v4.mjs package.json public/strategy/v4
git commit -m "feat: build auditable solver strategy packs"
```

### Task 7: V4 运行时查询、插值与统一策略门面

**Files:**
- Create: `src/strategy/v4/solverLookup.ts`
- Create: `src/strategy/v4/solverLookup.test.ts`
- Create: `src/strategy/v4/strategyV4.ts`
- Create: `src/strategy/v4/strategyV4.test.ts`
- Modify: `src/strategy/engine.ts`
- Modify: `src/strategy/types.ts`
- Modify: `src/strategy/publicState.ts`
- Test: `src/strategy/engine.test.ts`

**Interfaces:**
- Produces: `decideStrategyV4(request): StrategyResult`，`strategyVersion: "strategy-v4"`。
- Query fallback order: exact Solver node → adjacent node interpolation → expert V4 baseline → explicit safe fallback。

- [ ] **Step 1: 写精确节点、插值和降级失败测试**

断言 exact 节点保留 Solver 主要动作；非标准尺寸在邻接节点间连续变化；缺包时标记降级且不参与正式评分。

- [ ] **Step 2: 实现节点查询和范围重加权**

按位置、底池类型、牌面族、SPR、行动线和组合查询；使用当前 `RangeStateV4` 重加权，不读取暗牌。

- [ ] **Step 3: 串联候选评估、门槛和画像**

顺序固定为 Solver/基线 → 多街 EV → DominanceGateV4 → ProfileAdjustmentV4 → 规则合法性校验。

- [ ] **Step 4: 切换新牌局到 V4，保留历史兼容**

新牌局和“使用当前策略重新精算”使用 V4；旧记录按保存的版本展示。界面明确显示 `策略 V4` 或降级原因。

- [ ] **Step 5: 运行统一策略测试并提交**

Run: `npm test -- --run src/strategy/v4/strategyV4.test.ts src/strategy/engine.test.ts src/review/deepReview.test.ts`
Expected: PASS。

```bash
git add src/strategy/v4/solverLookup.ts src/strategy/v4/solverLookup.test.ts src/strategy/v4/strategyV4.ts src/strategy/v4/strategyV4.test.ts src/strategy/engine.ts src/strategy/types.ts src/strategy/publicState.ts src/strategy/engine.test.ts
git commit -m "feat: route live and review decisions through strategy v4"
```

### Task 8: 人话现场提示与整手复盘

**Files:**
- Create: `src/review/coachFactsV4.ts`
- Create: `src/review/coachFactsV4.test.ts`
- Modify: `src/insights/plainLanguageAnalysis.ts`
- Modify: `src/review/wholeHandNarrative.ts`
- Modify: `src/components/PreActionInsights.tsx`
- Modify: `src/components/DeepHandReview.tsx`
- Test: `src/insights/plainLanguageAnalysis.test.ts`
- Test: `src/review/wholeHandNarrative.test.ts`

**Interfaces:**
- Produces: `buildCoachFactsV4(strategyResult, ranges, streetPlan)`，牌局中与复盘共用。

- [ ] **Step 1: 写四问解释失败测试**

断言输出包含底牌贡献、对手主要组合、收益来源和下一街计划；禁止“普通成牌约61%”这类没有牌面语义的孤立句子。

- [ ] **Step 2: 实现结构化中文模板**

模板只消费 V4 facts：例如“公共牌是一对 J，你的 2♥3♥ 没有改善牌型；面对半池需要 25% 权益，但对手该尺寸后的诈唬不足，因此弃牌。没有合理反加目标。”

- [ ] **Step 3: 清理重复章节**

每街只输出一个结论段；范围、计划和专业数据各有唯一归属。专业数据默认折叠。

- [ ] **Step 4: 运行组件和复盘测试并提交**

Run: `npm test -- --run src/review/coachFactsV4.test.ts src/insights/plainLanguageAnalysis.test.ts src/review/wholeHandNarrative.test.ts src/components/PreActionInsights.test.tsx src/components/DeepHandReview.test.tsx`
Expected: PASS。

```bash
git add src/review/coachFactsV4.ts src/review/coachFactsV4.test.ts src/insights/plainLanguageAnalysis.ts src/review/wholeHandNarrative.ts src/components/PreActionInsights.tsx src/components/DeepHandReview.tsx src/insights/plainLanguageAnalysis.test.ts src/review/wholeHandNarrative.test.ts
git commit -m "feat: explain v4 poker decisions in plain Chinese"
```

### Task 9: 性能、移动包、离线构建与交付

**Files:**
- Modify: `vite.config.ts`
- Modify: `vite.mobile.config.ts`
- Modify: `src/appVersion.ts`
- Modify: `README.md`
- Modify: `scripts/verify-mobile-bundle.mjs`
- Modify: `scripts/verify-desktop-data.mjs`
- Test: `src/insights/performance.test.ts`
- Test: `src/config/mobileBuildCompatibility.test.ts`

**Interfaces:**
- Produces: 桌面/移动 V4 策略包、完整性报告、运行说明和可安装产物。

- [ ] **Step 1: 加入实时性能门**

桌面 V4 查询 P95 ≤ 150 ms，移动 P95 ≤ 250 ms；超时返回已校验基线并记录原因。

- [ ] **Step 2: 验证桌面/移动同源差异**

主要动作差异超过配置阈值时构建失败；移动包首次加载和 IndexedDB 缓存测试通过。

- [ ] **Step 3: 全量验证**

Run: `npm test -- --run && npm run lint && npm run audit:strategy-v3 && npm run audit:strategy-v4 && npm run test:performance && npm run build && npm run verify:mobile-bundle && npm run verify:desktop-data`
Expected: 全部退出码 0。

- [ ] **Step 4: 打包并实机检查**

Run: `npm run tauri:private`
Expected: 生成 macOS 可安装产物，断网启动、打一整手、重新精算和重启重放均成功。

- [ ] **Step 5: 更新说明并提交**

```bash
git add vite.config.ts vite.mobile.config.ts src/appVersion.ts README.md scripts/verify-mobile-bundle.mjs scripts/verify-desktop-data.mjs src/insights/performance.test.ts src/config/mobileBuildCompatibility.test.ts
git commit -m "release: deliver offline strategy v4"
```

