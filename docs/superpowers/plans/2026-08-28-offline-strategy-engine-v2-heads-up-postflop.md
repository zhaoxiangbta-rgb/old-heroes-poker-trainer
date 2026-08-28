# 离线策略引擎 V2 单挑翻后 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让单挑底池的翻牌、转牌和河牌决策脱离 `legacy-adapter-v1`，使用可审计的牌面纹理、手牌桶、行动节点、尺度插值和有界局部修正，满足初中级训练需要。

**Architecture:** 规则引擎继续独占合法动作和筹码计算。`src/strategy` 新增纯函数牌面/节点抽象和紧凑单挑蓝图；运行时只读取公开状态与行动者自己的底牌，在常用尺度上直接查表，在非标准尺度间插值，极端尺度执行固定预算的确定性局部修正。多人池仍明确走低置信度安全适配器，避免把单挑结论错误外推。

**Tech Stack:** React 19、TypeScript 5.8、Vitest、Tauri 2、Rust、现有本地策略包与规则引擎；不新增网络或运行时依赖。

## Global Constraints

- 本地规则引擎是唯一合法性和结算事实源；策略层不得产生规则引擎不允许的动作。
- 决策输入不得包含其他未摊牌玩家底牌；只使用 `PublicDecisionState`、行动者底牌和范围快照。
- 只把恰好两名未弃牌玩家的翻后节点标记为单挑高置信度；多人池继续使用明确的安全适配器。
- 常用尺度为 1/3、1/2、2/3、1、1.25、1.5 倍底池和全下；任意合法整数金额仍由规则引擎接受。
- 蓝图命中目标 20 ms，尺度插值 50 ms，确定性局部修正 150 ms；预算耗尽必须返回当前最佳合法结果。
- 本阶段命名为“抽象蓝图 + 有界局部修正”，不宣称完整无限注 Solver 或精确 GTO。
- 公开构建不包含本地玩家姓名、密钥、隐藏底牌、远程资源或固定局域网地址。

---

### Task 1: 牌面同构与战略纹理

**Files:**
- Create: `src/strategy/postflopTexture.ts`
- Test: `src/strategy/postflopTexture.test.ts`

**Interfaces:**
- Consumes: `classifyPostflopTexture(board: Card[]): PostflopTexture`
- Produces: `PostflopTexture = { street; canonicalBoard; highCard; paired; monotone; twoTone; connectedness; wetness; clusterId }`

- [ ] **Step 1: 写失败测试**：断言 `Ah Kd 2c` 与换花色后的 `As Kh 2d` 产生相同 `clusterId`；单色、成对、四连张牌面进入不同纹理。
- [ ] **Step 2: 运行红灯**：`npx vitest run src/strategy/postflopTexture.test.ts`，预期模块不存在或分类断言失败。
- [ ] **Step 3: 最小实现**：按首次出现花色映射做 canonical suit normalization；以公共牌高度、配对、同花度、最大连续窗口和街道构造稳定 `clusterId`。
- [ ] **Step 4: 运行绿灯**：同一命令全部通过，并断言输入牌重复或不足三张时抛错。
- [ ] **Step 5: 提交**：`git commit -m "feat: classify postflop board textures"`。

### Task 2: 单挑行动节点与底池类型

**Files:**
- Create: `src/strategy/postflopNode.ts`
- Test: `src/strategy/postflopNode.test.ts`

**Interfaces:**
- Consumes: `classifyHeadsUpPostflopNode(state: PublicDecisionState, texture: PostflopTexture): HeadsUpPostflopNode | undefined`
- Produces: `HeadsUpPostflopNode = { street; potType; inPosition; initiative; line; facingFraction; textureCluster; nodeId }`

- [ ] **Step 1: 写失败测试**：覆盖单加注/3-bet/4-bet 底池、持续下注、延迟下注、过牌加注、面对超池；三名未弃牌玩家必须返回 `undefined`。
- [ ] **Step 2: 运行红灯**：`npx vitest run src/strategy/postflopNode.test.ts`，预期模块不存在。
- [ ] **Step 3: 最小实现**：从翻前加注次数识别 `srp|3bp|4bp`，从当前街与上一街公开行动识别 `checked-to|cbet|delayed-cbet|check-raise|facing-bet|facing-raise`，真实下注额除以动作前底池得到 `facingFraction`。
- [ ] **Step 4: 运行绿灯**：同一命令全部通过，并验证 `nodeId` 对同一公开行动线稳定。
- [ ] **Step 5: 提交**：`git commit -m "feat: classify heads-up postflop nodes"`。

### Task 3: 手牌战略桶与范围事实

**Files:**
- Create: `src/strategy/postflopHandBucket.ts`
- Test: `src/strategy/postflopHandBucket.test.ts`
- Modify: `src/policy/handFeatures.ts`

**Interfaces:**
- Consumes: `bucketPostflopHand(hole: [Card, Card], board: Card[], opponentRange: WeightedCombo[]): PostflopHandBucket`
- Produces: `{ tier; made; drawClass; nutPotential; blockerScore; cleanOuts; equity; bucketId }`

- [ ] **Step 1: 写失败测试**：覆盖坚果、超对/顶对、弱摊牌价值、坚果同花听牌、非坚果听牌、空气；公共牌成牌不得被错误当成行动者独占强牌。
- [ ] **Step 2: 运行红灯**：`npx vitest run src/strategy/postflopHandBucket.test.ts`，预期模块不存在。
- [ ] **Step 3: 最小实现**：复用 evaluator 与现有 `extractHandFeatures`，对范围做确定性全枚举权益；输出有限战略桶而不是按最终牌型直接决策。
- [ ] **Step 4: 运行绿灯**：同一命令全部通过，花色等价手牌产生等价桶。
- [ ] **Step 5: 提交**：`git commit -m "feat: bucket heads-up postflop hands"`。

### Task 4: 紧凑单挑蓝图与尺度插值

**Files:**
- Create: `src/strategy/postflopBlueprint.ts`
- Create: `src/strategy/postflopSizing.ts`
- Test: `src/strategy/postflopBlueprint.test.ts`

**Interfaces:**
- Consumes: `lookupPostflopBlueprint(node, handBucket, legal): StrategyResult`
- Produces: 合法归一化的 `check/fold/call/bet/raise/all-in` 混合策略，版本 `hu-postflop-abstract-v1`

- [ ] **Step 1: 写失败测试**：强价值牌保留下注/加注，空气在干燥高牌面有有限诈唬，强听牌面对超池不会无条件弃牌，弱摊牌价值保留过牌/跟注；1/3 与 1/2 之间的自定义尺度频率连续变化。
- [ ] **Step 2: 运行红灯**：`npx vitest run src/strategy/postflopBlueprint.test.ts`，预期模块不存在。
- [ ] **Step 3: 最小实现**：使用纹理、位置、主动权、手牌桶和底池类型查紧凑参数；实际 `toAmount` 始终由真实底池和街道投入计算并钳制到 `legal`。
- [ ] **Step 4: 运行绿灯**：同一命令全部通过；所有动作频率和为 1，EV 有限且尺度单调合法。
- [ ] **Step 5: 提交**：`git commit -m "feat: add heads-up postflop blueprint"`。

### Task 5: 有界局部修正与统一引擎接入

**Files:**
- Create: `src/strategy/postflopResolver.ts`
- Test: `src/strategy/postflopResolver.test.ts`
- Modify: `src/strategy/engine.ts`
- Modify: `src/strategy/engine.test.ts`
- Modify: `src/game/game.ts`

**Interfaces:**
- Consumes: `resolveHeadsUpPostflop(base, request, node, bucket): StrategyResult`
- Produces: `blueprint`、`interpolated` 或 `blueprint+resolver` 来源，预算不足时保留当前最佳结果而不是卡住或非法降级。

- [ ] **Step 1: 写失败测试**：单挑翻后不再返回 `legacy-adapter-v1`；极端超池进入 resolver；预算 1 ms 仍返回合法蓝图；多人池继续明确 `safe-fallback`。
- [ ] **Step 2: 运行红灯**：`npx vitest run src/strategy/engine.test.ts src/strategy/postflopResolver.test.ts`，预期单挑仍走 legacy。
- [ ] **Step 3: 最小实现**：限定候选行动和最多迭代次数，以范围权益、底池赔率、弃牌率和阻断牌更新混合权重；不得阻塞规则引擎原子行动链。
- [ ] **Step 4: 运行绿灯**：同一命令全部通过，单次 lookup 中位数小于 50 ms、resolver 最坏小于 150 ms。
- [ ] **Step 5: 提交**：`git commit -m "feat: route heads-up postflop through blueprint"`。

### Task 6: 行为回归、离线产物与阶段门禁

**Files:**
- Create: `src/strategy/postflopRegression.test.ts`
- Modify: `src/strategy/stressGate.test.ts`
- Modify: `scripts/verify-mobile-bundle.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: 完整 `StrategyEngine` 与桌面/移动构建产物
- Produces: 阶段三可玩、可测、可回退交付

- [ ] **Step 1: 写失败测试**：用户过牌后对手不机械一路过牌；面对超池下注不是无条件弃牌；被加注后不会机械反加至全下；延迟下注和过牌加注存在非零但受牌力约束的频率。
- [ ] **Step 2: 运行红灯**：`npx vitest run src/strategy/postflopRegression.test.ts`，预期旧适配器或频率断言失败。
- [ ] **Step 3: 完成门禁**：压力测试拒绝单挑翻后 `safe-fallback`，移动包要求包含 `hu-postflop-abstract-v1`，README 明确单挑覆盖与多人边界。
- [ ] **Step 4: 全量验证**：运行 `npm test -- --run`、`npm run test:strategy`、`npm run lint`、`npm run build`、`npm run verify:mobile-bundle`、`npm run verify:desktop-data` 和 Rust 离线测试。
- [ ] **Step 5: 恢复私有姓名并提交**：`PLAYER_NAMES_MODE=private npm run prepare:names`，只提交本计划文件，`git commit -m "test: gate heads-up postflop release"`。

## Phase Completion Review

- 单挑翻后来源不再是 `legacy-adapter-v1`，多人池仍不会冒充单挑高精度结果。
- 常见和自定义尺度使用真实金额、合法范围和连续插值；极端尺度有有界修正。
- 固定种子策略可重放，隐藏底牌隔离不倒退，Mac/移动离线包包含同一策略版本。
- 本阶段不实现多人池高精度解析；该内容进入阶段四独立计划。
