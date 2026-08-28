# 离线德州扑克策略引擎 V2 基础阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立不泄露隐藏信息的公开决策状态、逐座位组合范围账本和统一策略结果协议，并让机器人、训练评分和持久化经由同一策略门面。

**Architecture:** 保留规则引擎作为唯一合法性事实源，在 `src/strategy` 中新建策略边界。`PublicDecisionState` 从 `GameState` 提取公开信息，`RangeLedger` 逐座位更新组合权重，`StrategyEngine` 统一返回频率、EV、来源和置信度。本阶段用受控的 legacy adapter 包装现有策略，为后续翻前蓝图分片和局部 CFR 解析器提供稳定接口。

**Tech Stack:** React 19, TypeScript 5.8, Vitest 3, Tauri 2, SQLite/IndexedDB repositories, existing exact poker evaluator/equity/range modules.

## Global Constraints

- 完全离线运行；对手决策不依赖网络、Codex、Python、Node 或外接大模型。
- 本地规则引擎是合法动作、底池、边池、筹码和摊牌的唯一事实源。
- 策略模块不得读取未摊牌对手底牌。
- 固定种子、完整状态和策略版本必须可精确重放。
- 机器人决策、用户评分、推荐尺寸和整手复盘共用同一 `StrategyResult`。
- 桌面正式策略数据不超过 500 MB；本阶段不生成大型蓝图文件。
- 公开构建不包含本地玩家名称或任何密钥。
- 保留现有无关未提交改动；每次提交只暂存当任务列出的文件。
- 生产代码遵循 TDD：先写失败测试，确认预期失败，再写最小实现。

---

## File Structure

### New files

- `src/strategy/types.ts` — V2 公开状态、候选动作、策略结果和来源类型。
- `src/strategy/publicState.ts` — 从规则引擎构建无隐藏信息的 `PublicDecisionState`。
- `src/strategy/publicState.test.ts` — 公开信息白名单、金额语义和种子重放测试。
- `src/strategy/rangeLedger.ts` — 逐座位组合范围的初始化、行动更新、阻断和快照。
- `src/strategy/rangeLedger.test.ts` — 独立范围、已知牌排除、尺度更新和重放测试。
- `src/strategy/legacyAdapter.ts` — 将现有 `PolicyDecision` 转换为 V2 `StrategyResult`。
- `src/strategy/legacyAdapter.test.ts` — 频率、EV、动作金额、来源和降级标记测试。
- `src/strategy/engine.ts` — `StrategyEngine` 接口和默认本地引擎实现。
- `src/strategy/engine.test.ts` — 确定性、超时、合法性和隐藏信息边界测试。
- `src/strategy/replayFixtures.ts` — 固定公开牌局样本构建器。
- `src/strategy/behaviorRegression.test.ts` — 超池防守、多人连续过牌和机械反加回归。

### Modified files

- `src/game/game.ts` — 记录真实移动筹码/动作前底池，调用 `StrategyEngine`，持久化策略事实。
- `src/game/game.test.ts` — 机器人统一门面、万手模拟、筹码守恒和重放测试。
- `src/game/useDeferredDecisionFacts.ts` — 停止重复推断范围，从统一策略事实读取分析输入。
- `src/training/assessment.ts` — 使用 `StrategyResult` 的候选 EV 评估用户动作。
- `src/training/assessment.test.ts` — 混合策略、小 EV 偏移和 safe-fallback 不计分测试。
- `src/data/exportDocument.ts` — 导出格式升级为 V7，并接受 V6 导入。
- `src/data/exportDocument.test.ts` — V6 迁移、V7 往返和密钥/隐藏信息排除测试。
- `src/data/types.ts` 及对应存储实现 — 扩展策略元数据，不改变 API Key 存储边界。

---

### Task 1: 固化已复现的策略行为回归

**Files:**
- Modify: `src/game/game.ts`
- Modify: `src/game/useDeferredDecisionFacts.ts`
- Modify: `src/policy/types.ts`
- Modify: `src/policy/rangeModel.ts`
- Modify: `src/policy/approxGto.ts`
- Test: `src/policy/rangeModel.test.ts`
- Test: `src/policy/approxGto.test.ts`

**Interfaces:**
- Produces: `GameLog.potBefore?: number`, `VisiblePolicyAction.amount?: number`, `VisiblePolicyAction.potBefore?: number`, `actionSizePot(action): number`.
- Preserves: `GameLog.toAmount` 仍是本街总投入；`GameLog.amount` 统一表示该动作真实移动筹码。

- [ ] **Step 1: 审查已存在的失败—通过证据**

确认 `rangeModel.test.ts` 包含 20 底池面对 30 下注时 `actionSizePot(...) === 1.5`，`approxGto.test.ts` 包含多人连续过牌下注概率不为 0 和超池分层防守用例。这些测试已在前一轮 TDD 中观察到预期失败，不得改成宽松的“只要有动作”断言。

- [ ] **Step 2: 运行定向测试**

Run:
```bash
npx vitest run src/policy/rangeModel.test.ts src/policy/approxGto.test.ts src/game/game.test.ts --maxWorkers=2
```

Expected: PASS，并且无非法动作回归。

- [ ] **Step 3: 验证整套测试和构建**

Run:
```bash
npx vitest run --maxWorkers=2
npm run lint
npm run build
```

Expected: 59 个测试文件、314 项测试通过，lint/build 成功。

- [ ] **Step 4: 提交行为基线**

```bash
git add src/game/game.ts src/game/useDeferredDecisionFacts.ts src/policy/types.ts src/policy/rangeModel.ts src/policy/approxGto.ts src/policy/rangeModel.test.ts src/policy/approxGto.test.ts
git commit -m "fix: correct postflop size and check-through policy"
```

---

### Task 2: 建立公开决策状态合同

**Files:**
- Create: `src/strategy/types.ts`
- Create: `src/strategy/publicState.ts`
- Create: `src/strategy/publicState.test.ts`
- Modify: `src/game/game.ts`

**Interfaces:**
- Consumes: `GameState`, `Legal`, `GameLog`, `Card`, `Position`.
- Produces: `buildPublicDecisionState(state: GameState, seat: number): PublicDecisionState`.

- [ ] **Step 1: 写隐藏信息失败测试**

```ts
it("never exposes unshown opponent hole cards", () => {
  const game = newGame(42);
  const publicState = buildPublicDecisionState(game, game.heroSeat);
  const serialized = JSON.stringify(publicState);
  for (const opponent of game.players.filter((p) => p.seat !== game.heroSeat)) {
    for (const card of opponent.hole) expect(serialized).not.toContain(card);
  }
  expect(publicState.heroHole).toEqual(game.players[game.heroSeat].hole);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/strategy/publicState.test.ts`

Expected: FAIL because `buildPublicDecisionState` and `PublicDecisionState` do not exist.

- [ ] **Step 3: 定义公开状态类型**

```ts
export type PublicAction = {
  street: Street;
  actorSeat: number;
  kind: ActionKind;
  amount: number;
  toAmount: number;
  potBefore: number;
  potAfter: number;
};

export type PublicPlayer = {
  seat: number;
  playerId: string;
  position: Position;
  stack: number;
  streetBet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
};

export type PublicDecisionState = {
  schemaVersion: 1;
  seed: number;
  decisionIndex: number;
  actingSeat: number;
  street: Street;
  heroHole: [Card, Card];
  board: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  legal: Legal;
  players: PublicPlayer[];
  actions: PublicAction[];
  tableProfileId: TableProfileId;
};
```

- [ ] **Step 4: 实现白名单映射**

`buildPublicDecisionState` 必须逐字段构建输出，不允许先 `structuredClone(game)` 再删除字段。`potBefore` 对旧日志使用 `Math.max(0, potAfter - amount)` 恢复。

- [ ] **Step 5: 增加金额语义和确定性测试**

```ts
expect(publicState.actions.at(-1)).toMatchObject({
  amount: 30,
  potBefore: 20,
  potAfter: 50,
});
expect(buildPublicDecisionState(replay, replay.heroSeat)).toEqual(publicState);
```

- [ ] **Step 6: 运行定向测试并提交**

```bash
npx vitest run src/strategy/publicState.test.ts src/game/game.test.ts --maxWorkers=2
git add src/strategy/types.ts src/strategy/publicState.ts src/strategy/publicState.test.ts src/game/game.ts
git commit -m "feat: add public poker decision state"
```

---

### Task 3: 建立逐座位组合范围账本

**Files:**
- Create: `src/strategy/rangeLedger.ts`
- Create: `src/strategy/rangeLedger.test.ts`
- Modify: `src/strategy/types.ts`
- Modify: `src/engine/ranges.ts`

**Interfaces:**
- Consumes: `PublicDecisionState`, `PublicAction`, `WeightedCombo`, existing range parser/blocker helpers.
- Produces: `createRangeLedger(state): RangeLedger`, `applyPublicAction(ledger, state, action): RangeLedger`, `snapshotRangeLedger(ledger): RangeLedgerSnapshot`.

- [ ] **Step 1: 写逐座位独立性失败测试**

```ts
it("updates only the acting opponent range", () => {
  const state = threeWayFlopPublicState();
  const before = createRangeLedger(state);
  const action = state.actions.at(-1)!;
  const after = applyPublicAction(before, state, action);
  expect(rangeFingerprint(after.bySeat[action.actorSeat])).not.toBe(
    rangeFingerprint(before.bySeat[action.actorSeat]),
  );
  const untouched = state.players.find((p) => p.seat !== action.actorSeat && p.seat !== state.actingSeat)!;
  expect(rangeFingerprint(after.bySeat[untouched.seat])).toBe(
    rangeFingerprint(before.bySeat[untouched.seat]),
  );
});
```

`threeWayFlopPublicState()` 定义在该测试文件内，返回一个有三位存活玩家、已知翻牌和最后一个对手动作的 `PublicDecisionState`，不依赖后续任务的 fixture 文件。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/strategy/rangeLedger.test.ts`

Expected: FAIL because the range-ledger API does not exist.

- [ ] **Step 3: 定义范围快照**

```ts
export type RangeLedger = {
  version: 1;
  knownCards: Card[];
  bySeat: Record<number, WeightedCombo[]>;
  lastActionIndex: number;
};

export type RangeLedgerSnapshot = {
  version: 1;
  lastActionIndex: number;
  bySeat: Record<number, Array<{ cards: [Card, Card]; weight: number }>>;
};
```

- [ ] **Step 4: 实现位置初始范围和已知牌排除**

将现有 `rangeModel.ts` 中的位置先验抽为导出的 `positionPrior(position)`。每个非决策座位单独调用 `removeBlocked` 和归一化，不共享可变数组。

- [ ] **Step 5: 实现真实尺度和连续过牌更新**

```ts
const potFraction = action.amount / Math.max(1, action.potBefore);
```

加注、跟注和过牌的 likelihood 必须分开；过牌不能把所有强组合权重清零，河牌大加注必须比小下注更偏向强价值与有效阻断诈唰。

- [ ] **Step 6: 增加范围不变式测试**

```ts
expect(allWeights(range)).toBeCloseTo(1, 10);
expect(range.every((combo) => combo.cards.every((card) => !known.has(card)))).toBe(true);
expect(snapshotRangeLedger(replayLedger)).toEqual(snapshotRangeLedger(firstLedger));
```

- [ ] **Step 7: 运行测试并提交**

```bash
npx vitest run src/strategy/rangeLedger.test.ts src/policy/rangeModel.test.ts --maxWorkers=2
git add src/strategy/types.ts src/strategy/rangeLedger.ts src/strategy/rangeLedger.test.ts src/engine/ranges.ts src/policy/rangeModel.ts
git commit -m "feat: track independent opponent ranges"
```

---

### Task 4: 定义统一策略结果并包装旧引擎

**Files:**
- Modify: `src/strategy/types.ts`
- Create: `src/strategy/legacyAdapter.ts`
- Create: `src/strategy/legacyAdapter.test.ts`
- Create: `src/strategy/engine.ts`
- Create: `src/strategy/engine.test.ts`

**Interfaces:**
- Consumes: `PublicDecisionState`, `RangeLedgerSnapshot`, existing `PolicyDecision`.
- Produces: `StrategyEngine.decide(request): StrategyResult` and `adaptLegacyDecision(decision, request): StrategyResult`.

- [ ] **Step 1: 写频率和 EV 协议失败测试**

```ts
it("returns a normalized auditable strategy result", () => {
  const result = createLocalStrategyEngine().decide(fixtureRequest("river-facing-overbet"));
  expect(result.actions.reduce((n, a) => n + a.frequency, 0)).toBeCloseTo(1, 10);
  expect(result.actions.every((a) => Number.isFinite(a.ev))).toBe(true);
  expect(result).toMatchObject({
    strategyVersion: "legacy-adapter-v1",
    source: "safe-fallback",
    confidence: expect.any(Number),
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/strategy/legacyAdapter.test.ts src/strategy/engine.test.ts`

Expected: FAIL because the V2 strategy result and engine do not exist.

- [ ] **Step 3: 定义协议**

```ts
export type StrategyAction = {
  action: "fold" | "check" | "call" | "bet" | "raise" | "all-in";
  toAmount?: number;
  potFraction?: number;
  frequency: number;
  ev: number;
  intent: PolicyIntent;
};

export type StrategyResult = {
  actions: StrategyAction[];
  confidence: number;
  source: "blueprint" | "interpolated" | "blueprint+resolver" | "multiway-resolver" | "safe-fallback";
  nodeId?: string;
  strategyVersion: string;
  rangeFacts: Record<string, number | string>;
  explanationFacts: Record<string, number | string>;
};

export type StrategyRequest = {
  state: PublicDecisionState;
  ranges: RangeLedgerSnapshot;
  deadlineMs: number;
};

export interface StrategyEngine {
  decide(request: StrategyRequest): StrategyResult;
}
```

本阶段保持同步接口，避免改变规则引擎的原子行动语义。后续大型策略分片由独立加载器预取，局部解析器在 worker 内运行，不把 Promise 传入核心 `commit` 链。

- [ ] **Step 4: 实现 legacy adapter**

转换时必须保留每个候选动作的 EV、频率、金额和 intent。现有启发式策略的 `source` 固定为 `safe-fallback`、`strategyVersion` 固定为 `legacy-adapter-v1`，且 `confidence <= 0.35`，防止旧引擎被误标为蓝图求解。

- [ ] **Step 5: 实现合法性和超时外壳**

`createLocalStrategyEngine` 对 adapter 输出执行：动作合法性校验、频率归一化、非有限 EV 拒绝和 `deadlineMs` 检查。无候选动作时只能返回规则引擎允许的过牌、跟注或弃牌。

- [ ] **Step 6: 运行测试并提交**

```bash
npx vitest run src/strategy/legacyAdapter.test.ts src/strategy/engine.test.ts --maxWorkers=2
git add src/strategy/types.ts src/strategy/legacyAdapter.ts src/strategy/legacyAdapter.test.ts src/strategy/engine.ts src/strategy/engine.test.ts
git commit -m "feat: add unified strategy engine contract"
```

---

### Task 5: 让机器人和评分共用策略门面

**Files:**
- Modify: `src/game/game.ts`
- Modify: `src/game/game.test.ts`
- Modify: `src/training/assessment.ts`
- Modify: `src/training/assessment.test.ts`
- Modify: `src/game/useDeferredDecisionFacts.ts`

**Interfaces:**
- Consumes: `StrategyEngine`, `StrategyResult`, `PublicDecisionState`, `RangeLedgerSnapshot`.
- Produces: persisted `StrategyDecisionRecord` and EV-loss assessment.

- [ ] **Step 1: 写单一门面失败测试**

```ts
it("records the same strategy facts used by bot action selection", () => {
  const afterHero = applyHeroAction(newGame(42), { type: "call" });
  const afterBot = applyNextBotActionV2(afterHero);
  const record = afterBot.strategyDecisions.at(-1)!;
  expect(record.selectedAction).toEqual(afterBot.log.at(-1)?.kind);
  expect(record.result.actions).toContainEqual(
    expect.objectContaining({ frequency: expect.any(Number), ev: expect.any(Number) }),
  );
});
```

- [ ] **Step 2: 写 EV 损失评分失败测试**

```ts
expect(assessFromStrategy(result, nearBestAction).classification).toBe("acceptable");
expect(assessFromStrategy(result, dominatedAction).classification).toBe("mistake");
expect(assessFromStrategy({ ...result, source: "safe-fallback" }, dominatedAction).scored).toBe(false);
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/game/game.test.ts src/training/assessment.test.ts`

Expected: FAIL because V2 records and EV-loss assessment do not exist.

- [ ] **Step 4: 定义持久化决策记录**

```ts
export type StrategyDecisionRecord = {
  seat: number;
  street: Street;
  logIndex: number;
  selectedAction: StrategyAction["action"];
  result: StrategyResult;
  ranges: RangeLedgerSnapshot;
};
```

- [ ] **Step 5: 改造机器人原子行动**

`applyNextBotActionV2` 在动作前构建公开状态/范围快照，调用策略引擎，使用原固定种子抽样动作，然后交由 `commit` 做最终合法性检查。暂时保留同步旧 API 作为过渡包装，但新播放链只调用 V2 API。

- [ ] **Step 6: 实现 EV 损失分类**

评分使用同一结果的 `bestEv - chosenEv`。阈值以底池大盲数归一化，且 `safe-fallback` 只生成说明，不写入正式弱点统计。

- [ ] **Step 7: 删除重复范围推断**

`useDeferredDecisionFacts` 将 `StrategyDecisionRecord.result.rangeFacts` 转为展示输入，不再遍历 `game.log` 自行构建另一套朋友局范围。

- [ ] **Step 8: 运行测试并提交**

```bash
npx vitest run src/game/game.test.ts src/training/assessment.test.ts src/game/useDeferredDecisionFacts.test.tsx --maxWorkers=2
git add src/game/game.ts src/game/game.test.ts src/training/assessment.ts src/training/assessment.test.ts src/game/useDeferredDecisionFacts.ts src/game/useDeferredDecisionFacts.test.tsx
git commit -m "feat: unify bot decisions and training assessment"
```

---

### Task 6: 升级历史牌局和导入导出

**Files:**
- Modify: `src/game/game.ts`
- Modify: `src/data/exportDocument.ts`
- Modify: `src/data/exportDocument.test.ts`
- Modify: `src/data/types.ts`
- Modify: `src/data/memoryRepository.ts`
- Modify: `src/data/indexedDbRepository.ts`
- Modify: `src/data/nativeRepository.ts`
- Test: corresponding repository tests.

**Interfaces:**
- Consumes: `StrategyDecisionRecord` and existing V6 game snapshots.
- Produces: `TrainingExportV7`, normalized V7 `GameState`, readable V6 migration.

- [ ] **Step 1: 写 V6 兼容失败测试**

```ts
const decoded = decodeTrainingExport(JSON.stringify(v6Fixture));
expect(decoded.version).toBe(7);
expect(decoded.hands[0].strategyVersion).toBe("legacy-v6");
expect(decoded.hands[0].strategyDecisions).toEqual([]);
```

- [ ] **Step 2: 写 V7 安全往返失败测试**

```ts
const json = encodeTrainingExport({ hands: [v7Hand], gameplaySettings });
expect(JSON.parse(json).version).toBe(7);
expect(decodeTrainingExport(json).hands[0].strategyDecisions).toEqual(v7Hand.strategyDecisions);
expect(json).not.toMatch(/apiKey|authorization|opponentHole/i);
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/data/exportDocument.test.ts src/data/repository.test.ts src/data/indexedDbRepository.test.ts`

Expected: FAIL because only V6 is accepted and V2 metadata is not normalized.

- [ ] **Step 4: 定义 V7 导出根对象**

```ts
export type TrainingExportV7 = {
  format: "poker-decision-trainer";
  version: 7;
  exportedAt: string;
  gameplaySettings: GameplaySettings;
  hands: GameState[];
};
```

`decodeTrainingExport` 接受根版本 6 或 7；V6 先通过 `migrateV6Hand` 再进入 `normalizeGameState`。新导出始终写 V7。

- [ ] **Step 5: 更新存储实现**

内存、IndexedDB 和 SQLite/Tauri 实现继续存整个规范化 `GameState`；不新增密钥列。读时迁移、写时只写 V7。

- [ ] **Step 6: 运行数据测试并提交**

```bash
npx vitest run src/data/exportDocument.test.ts src/data/repository.test.ts src/data/indexedDbRepository.test.ts src/App.interaction.test.tsx --maxWorkers=2
git add src/game/game.ts src/data/exportDocument.ts src/data/exportDocument.test.ts src/data/types.ts src/data/memoryRepository.ts src/data/indexedDbRepository.ts src/data/nativeRepository.ts src/data/repository.test.ts src/data/indexedDbRepository.test.ts
git commit -m "feat: persist versioned strategy facts"
```

---

### Task 7: 加入固定实战回归集和发布门槛

**Files:**
- Create: `src/strategy/replayFixtures.ts`
- Create: `src/strategy/behaviorRegression.test.ts`
- Modify: `src/game/game.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: V2 public state/range/engine contracts.
- Produces: deterministic behavioral regression suite and `test:strategy` script.

- [ ] **Step 1: 写三个固定牌局失败测试**

```ts
it("keeps a non-zero late-position stab range after three checks", async () => {
  const result = await decideFixture("four-way-three-checks-to-button");
  expect(totalAggressiveFrequency(result)).toBeGreaterThanOrEqual(0.15);
});

it("defends an overbet with strong made hands and strong draws", async () => {
  expect(await foldFrequency("turn-overbet-set")).toBeLessThan(0.05);
  expect(await foldFrequency("turn-overbet-nut-flush-draw")).toBeLessThan(0.90);
});

it("does not enter an automatic raise war", async () => {
  const lines = await simulateSeeds("flop-raise-response", 500);
  expect(lines.filter((line) => line.endsAllInWithoutValue).length / lines.length).toBeLessThan(0.15);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/strategy/behaviorRegression.test.ts`

Expected: FAIL until fixtures and V2 decision helpers exist.

- [ ] **Step 3: 实现固定公开牌局构建器**

`replayFixtures.ts` 只保存公开状态和当前决策者手牌。测试对手范围由 `RangeLedgerSnapshot` 提供，不写确定未摊牌底牌。

- [ ] **Step 4: 把合法性模拟提升到 10,000 + 10,000 手**

将长时间模拟放入 `npm run test:strategy`，不让日常单元测试超时。断言每手筹码守恒、无非法动作、无超过 guard 的循环、固定种子结果一致。

- [ ] **Step 5: 新增发布命令**

```json
{
  "scripts": {
    "test:strategy": "vitest run src/strategy src/game/game.test.ts --maxWorkers=2"
  }
}
```

- [ ] **Step 6: 更新 README 边界说明**

README 明确显示当前 V2 foundation 仍使用 `legacy-adapter-v1` 安全降级，不宣称已有正式翻前/翻后蓝图。

- [ ] **Step 7: 运行全部门槛**

```bash
npm run test:strategy
npx vitest run --maxWorkers=2
npm run lint
npm run build
npm run verify:mobile-bundle
```

Expected: all commands pass; no strategy timeout blocks UI tests.

- [ ] **Step 8: 提交阶段一验收**

```bash
git add src/strategy/replayFixtures.ts src/strategy/behaviorRegression.test.ts src/game/game.test.ts package.json README.md
git commit -m "test: gate strategy engine foundation"
```

---

## Phase Completion Review

- [ ] `PublicDecisionState` 的序列化结果不包含未摊牌对手底牌。
- [ ] 每位对手有独立、归一化、排除已知牌的组合范围。
- [ ] 机器人、评分和复盘使用同一 `StrategyResult`。
- [ ] 旧启发式引擎只标记为 `safe-fallback`，不冒充蓝图策略。
- [ ] V6 历史牌局可读，V7 可导入、导出和精确重放。
- [ ] 超池全跑、多人一路过牌和机械反加有固定回归样本。
- [ ] 发布门槛、公开名称隔离和移动包验证全部通过。

## Subsequent Plans

阶段一验收后，按已批准规格分别编写和执行：

1. `2026-08-27-offline-strategy-engine-v2-preflop-blueprint.md` — 翻前博弈树、CFR/MCCFR 生成器、收敛门槛和二进制分片。
2. `2026-08-27-offline-strategy-engine-v2-heads-up-postflop.md` — 牌面同构、战略聚类、尺度插值和单挑局部解析。
3. `2026-08-27-offline-strategy-engine-v2-multiway.md` — 多人权益、身后风险、脏补牌、边池 EV 和置信度。
4. `2026-08-27-offline-strategy-engine-v2-training-delivery.md` — 复盘界面、策略包管理、性能、平台打包和 GitHub 发布。
