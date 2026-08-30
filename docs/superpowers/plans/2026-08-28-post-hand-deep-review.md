# 整手结束后深度精算复盘实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保持牌局中快速响应，整手结束后进入可取消、可恢复、可持久化的后台深度精算，并一次性展示逐街范围、权益、合法候选 EV、错误原因和核心规则。

**Architecture:** 在英雄每次行动前保存只含当时可见信息的版本化决策快照。结算后由独立 Web Worker 按顺序重建范围并执行单挑枚举或多人确定性高预算计算，主线程只管理进度、取消和结果写回；最终评分、弱点报告和课程只读取成功完成的深度结果。

**Tech Stack:** React 19、TypeScript 5.8、Vite Web Worker、Vitest、IndexedDB、Tauri 2、Rust、SQLite。

## Global Constraints

- 完全离线，不依赖网络、Codex、Python、Node 或外接 AI。
- 规则引擎是合法动作、底池、边池、有效筹码和结算的唯一事实源。
- 未摊牌对手底牌不得进入当时的范围、评分、日志或解释。
- 牌局结束后不展示基础复盘；只显示精算进度，完成后一次性展示完整复盘。
- 取消必须真正终止 Worker，不保存半成品，也不计入弱点报告或课程。
- 单挑仅在完整遍历时标记 `exact`；多人组合爆炸时必须标记 `sampled` 并保存样本数和置信度。
- 固定牌局、策略版本和计算配置必须可重复得到相同结果。
- 不修改用户现有未提交文件：`docs/superpowers/plans/2026-08-26-mobile-left-cards-large-actions.md`、`docs/superpowers/specs/2026-08-26-mobile-left-cards-large-actions-design.md`。
- 公开验证使用 `PLAYER_NAMES_MODE=public`；每轮结束恢复 `PLAYER_NAMES_MODE=private npm run prepare:names`。

---

## 文件结构

### 新建

- `src/review/types.ts`：深度任务、精度、决策结果和整手结果的唯一类型定义。
- `src/review/stateHash.ts`：对精算输入生成稳定哈希，防止旧 Worker 结果写入错误牌局。
- `src/review/capture.ts`：在英雄动作前截取可见决策状态，并从旧牌局安全降级。
- `src/review/headsUpCalculator.ts`：单挑范围组合与剩余公共牌枚举。
- `src/review/multiwayCalculator.ts`：多人联合范围确定性分层抽样、组合冲突剔除和置信度。
- `src/review/deepReview.ts`：逐街范围重建、合法候选动作生成、EV 汇总、评分和整手摘要。
- `src/review/deep-review.worker.ts`：Worker 消息协议、分批执行、进度和取消检查。
- `src/review/useDeepReview.ts`：React 生命周期、请求身份校验、取消和结果写回。
- `src/components/DeepReviewProgress.tsx`：精算中、取消、失败和未完成界面。
- `src/components/DeepHandReview.tsx`：完成后的整手结论、时间线、范围、EV、补牌和核心规则。

### 修改

- `src/game/game.ts`：牌局版本升级、决策快照与深度复盘状态归一化。
- `src/game/useGamePlayback.ts`：移除牌局中的同步评分，保存英雄决策快照。
- `src/App.tsx`：结算后启动精算、取消/重算/下一手、保存完成结果。
- `src/training/assessment.ts`：接受深度候选结果生成最终评分，保留安全降级兼容。
- `src/training/curriculum.ts`：只统计完成且可评分的深度结果。
- `src/data/types.ts`、`src/data/*Repository.ts`：增加同一牌局的安全更新接口。
- `src/data/exportDocument.ts`：导出版本升级并兼容 v6/v7。
- `src-tauri/src/lib.rs`、`src-tauri/src/storage.rs`：SQLite 同键更新完整精算结果。
- `src/training.css`、移动端样式文件：精算和完整复盘响应式样式。
- 对应 `.test.ts(x)`：每项功能采用先红后绿。

---

### Task 1: 深度复盘类型、决策快照与版本迁移

**Files:**
- Create: `src/review/types.ts`
- Create: `src/review/stateHash.ts`
- Create: `src/review/capture.ts`
- Create: `src/review/capture.test.ts`
- Create: `src/review/stateHash.test.ts`
- Modify: `src/game/game.ts`
- Modify: `src/game/game.test.ts`
- Modify: `src/data/exportDocument.ts`
- Modify: `src/data/exportDocument.test.ts`

**Interfaces:**
- Produces: `captureHeroDecision(state: GameState): DeepDecisionInput`
- Produces: `deepReviewStateHash(input: DeepReviewInput): string`
- Produces: `DeepReviewStatus`, `DeepDecisionInput`, `DeepDecisionReview`, `DeepHandReview`, `DeepReviewInput`, `DeepReviewEvent`
- `GameState.version` becomes `8`; `normalizeGameState` accepts v6/v7/v8 and initializes missing deep-review fields.

- [ ] **Step 1: 写失败的可见信息与稳定哈希测试**

```ts
it("captures legal facts without unrevealed opponent holes", () => {
  const game = stateFacingRaise();
  const snapshot = captureHeroDecision(game);
  expect(snapshot.legal).toEqual(game.legal);
  expect(snapshot.players.find((p) => p.seat !== game.heroSeat)?.hole).toBeUndefined();
  expect(JSON.stringify(snapshot)).not.toContain(game.players[1].hole.join(""));
});

it("hashes the same review input identically", () => {
  const input = reviewInputFixture();
  expect(deepReviewStateHash(input)).toBe(deepReviewStateHash(structuredClone(input)));
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/review/capture.test.ts src/review/stateHash.test.ts src/game/game.test.ts src/data/exportDocument.test.ts`

Expected: FAIL，模块或 v8 字段尚不存在。

- [ ] **Step 3: 定义类型和安全快照**

```ts
export type DeepReviewStatus = "not-started" | "calculating" | "completed" | "cancelled" | "failed";
export type ReviewPrecision = "exact" | "enumerated" | "sampled";

export type DeepDecisionInput = {
  handNo: number;
  logIndex: number;
  street: Street;
  heroSeat: number;
  heroHole: Card[];
  board: Card[];
  pot: number;
  currentBet: number;
  legal: Legal;
  visiblePlayers: Array<Omit<Player, "hole"> & { hole?: Card[] }>;
  log: GameLog[];
};
```

`captureHeroDecision`只给英雄和已经公开摊牌者写入 `hole`；保存动作前 `legal`、行动线、街道投入和总投入。

- [ ] **Step 4: 实现稳定状态哈希与 v8 归一化**

按固定键序列化 `seed`、`handNo`、公开状态、英雄决策快照、策略版本和计算配置，再用项目现有 SHA-256 实现生成十六进制哈希。`normalizeGameState` 对旧牌局设置：

```ts
reviewDecisionInputs ??= [];
deepReviewStatus ??= "not-started";
deepReview = deepReview?.stateHash ? deepReview : undefined;
deepReviewError = undefined;
```

导出根版本升级为 8，解码继续接受 6、7、8。

- [ ] **Step 5: 运行测试确认绿灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/review/capture.test.ts src/review/stateHash.test.ts src/game/game.test.ts src/data/exportDocument.test.ts`

Expected: PASS；快照不含未公开底牌，同输入哈希稳定，旧导出可导入。

- [ ] **Step 6: 提交**

```bash
git add src/review src/game/game.ts src/game/game.test.ts src/data/exportDocument.ts src/data/exportDocument.test.ts
git commit -m "feat: capture deep review decision inputs"
```

---

### Task 2: 支持同一牌局在精算完成后安全更新

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/memoryRepository.ts`
- Modify: `src/data/indexedDbRepository.ts`
- Modify: `src/data/nativeRepository.ts`
- Modify: `src/data/repository.test.ts`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/storage.rs`

**Interfaces:**
- Consumes: v8 `GameState.deepReviewStatus` and `GameState.deepReview`
- Produces: `DesktopRepository.replaceHand(hand: GameState): Promise<void>`
- Produces: Tauri command `replace_hand(json: String) -> Result<(), String>`

- [ ] **Step 1: 写失败的更新幂等测试**

```ts
it("replaces the same hand after deep review completes", async () => {
  const first = completedHand();
  first.deepReviewStatus = "not-started";
  await repository.saveHand(first);
  const reviewed = structuredClone(first);
  reviewed.deepReviewStatus = "completed";
  reviewed.deepReview = deepReviewFixture();
  await repository.replaceHand(reviewed);
  const rows = await repository.loadHands();
  expect(rows).toHaveLength(1);
  expect(rows[0].deepReviewStatus).toBe("completed");
});
```

- [ ] **Step 2: 运行前端和 Rust 测试确认红灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/data/repository.test.ts && cargo test --manifest-path src-tauri/Cargo.toml storage`

Expected: FAIL，`replaceHand`/`replace_hand` 尚不存在。

- [ ] **Step 3: 实现三个前端仓库更新接口**

内存仓库按 `seed:handNo` 原位替换；IndexedDB 使用 `put` 覆盖同键并更新 `savedAt`；原生仓库调用新 Tauri 命令。`saveHand` 的首次插入语义保持不变。

- [ ] **Step 4: 实现 SQLite 事务更新**

```sql
UPDATE hands SET seed = ?2, snapshot = ?3 WHERE hand_key = ?1
```

同一事务先删除该手旧 `decision_assessments`，再从新版快照写入成功完成的深度评分；取消、失败和未开始状态不写评分表。若 `hand_key` 不存在则返回明确错误，不静默插入错误牌局。

Rust 导入校验同步接受根文档和牌局快照版本 6、7、8；导出统一写版本 8。

- [ ] **Step 5: 运行测试确认绿灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/data/repository.test.ts && cargo test --manifest-path src-tauri/Cargo.toml storage`

Expected: PASS；同键只有一手，深度结果可覆盖首次结算快照。

- [ ] **Step 6: 提交**

```bash
git add src/data src-tauri/src/lib.rs src-tauri/src/storage.rs
git commit -m "feat: persist completed deep hand reviews"
```

---

### Task 3: 单挑高精度权益与合法候选 EV

**Files:**
- Create: `src/review/headsUpCalculator.ts`
- Create: `src/review/headsUpCalculator.test.ts`
- Modify: `src/engine/equity.ts`
- Modify: `src/engine/equity.test.ts`
- Reuse: `src/engine/evaluator.ts`
- Reuse: `src/strategy/rangeLedger.ts`
- Reuse: `src/strategy/postflopSizing.ts`

**Interfaces:**
- Produces: `calculateHeadsUpNode(input, onBatch): Promise<DeepNodeCalculation>`
- `onBatch(completed: number, total: number): void` is called between deterministic chunks and may throw `ReviewCancelledError`.

- [ ] **Step 1: 写小牌面完整枚举交叉测试**

```ts
it("matches independent river weighted enumeration", async () => {
  const result = await calculateHeadsUpNode(riverFixture(), () => {});
  expect(result.precision).toBe("exact");
  expect(result.equity).toBeCloseTo(independentRiverEnumeration(riverFixture()), 10);
});

it("never emits a raise outside the captured legal bounds", async () => {
  const result = await calculateHeadsUpNode(turnFacingBetFixture(), () => {});
  for (const candidate of result.candidates.filter((x) => x.action.type === "raise"))
    expect(candidate.action.to).toBeGreaterThanOrEqual(turnFacingBetFixture().legal.minRaiseTo);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/review/headsUpCalculator.test.ts src/engine/equity.test.ts`

Expected: FAIL，精算器尚不存在。

- [ ] **Step 3: 实现去阻塞牌、加权组合和 runout 分块枚举**

使用整数索引遍历合法对手组合和剩余公共牌；每批最多 2,048 个 showdown，批次边界调用 `onBatch`。累计 `winShare * comboWeight` 和 `totalWeight`，平分按 `1 / winners` 计入。

- [ ] **Step 4: 从规则边界生成候选动作并计算增量 EV**

候选集为 fold/check/call、合法最小尺寸、半池、2/3 池、满池、合理超池和全下，全部经 `minRaiseTo/maxRaiseTo` 裁剪去重。面对下注时使用跟注后的底池计算 raise-to：

```ts
const potAfterCall = pot + legal.callAmount;
const target = heroStreetBet + legal.callAmount + Math.round(potAfterCall * fraction);
```

风险只计算从当前节点继续投入的筹码，不重复计算已投入额。

- [ ] **Step 5: 运行测试确认绿灯及性能边界**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/review/headsUpCalculator.test.ts src/engine/equity.test.ts`

Expected: PASS；河牌与独立枚举一致，所有尺寸合法，固定输入结果一致。

- [ ] **Step 6: 提交**

```bash
git add src/review/headsUpCalculator.ts src/review/headsUpCalculator.test.ts src/engine/equity.ts src/engine/equity.test.ts
git commit -m "feat: add heads-up deep review calculator"
```

---

### Task 4: 多人联合范围、边池 EV 与确定性预算

**Files:**
- Create: `src/review/multiwayCalculator.ts`
- Create: `src/review/multiwayCalculator.test.ts`
- Reuse: `src/strategy/multiwayEquity.ts`
- Reuse: `src/strategy/multiwayPots.ts`
- Reuse: `src/engine/pots.ts`

**Interfaces:**
- Produces: `calculateMultiwayNode(input, config, onBatch): Promise<DeepNodeCalculation>`
- `DeepCalculationConfig` contains exact numeric `sampleBudget`, `batchSize`, `memoryLimitBytes`, `seed`, and `calculatorVersion`.

- [ ] **Step 1: 写组合冲突、确定性和边池测试**

```ts
it("never assigns the same card to two opponents", async () => {
  const result = await calculateMultiwayNode(blockerFixture(), testConfig, () => {});
  expect(result.diagnostics.conflictingSamples).toBe(0);
});

it("is deterministic for the same seed and budget", async () => {
  const a = await calculateMultiwayNode(sidePotFixture(), testConfig, () => {});
  const b = await calculateMultiwayNode(sidePotFixture(), testConfig, () => {});
  expect(a).toEqual(b);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/review/multiwayCalculator.test.ts src/strategy/multiwayPots.test.ts`

Expected: FAIL，多人深度计算器尚不存在。

- [ ] **Step 3: 实现固定种子分层联合抽样**

依次从各玩家的组合权重累计分布取样，已知牌和已选组合冲突时拒绝并重采；公共牌 runout 从剩余牌中无放回抽取。不同牌力层、下注范围层和低权重尾部均分配最低样本配额，避免只抽到高权重中心。

- [ ] **Step 4: 计算主池/边池份额和置信度**

每个样本用规则引擎 `buildPots` 的 eligible 集合计算英雄在各池的赢/平份额；累计样本均值、方差和 95% 区间。达到 `sampleBudget` 或内存上限后返回 `precision: "sampled"`、真实样本数和置信区间。

- [ ] **Step 5: 运行测试确认绿灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/review/multiwayCalculator.test.ts src/strategy/multiwayPots.test.ts src/engine/pots.test.ts`

Expected: PASS；无冲突，边池份额守恒，同种子结果一致。

- [ ] **Step 6: 提交**

```bash
git add src/review/multiwayCalculator.ts src/review/multiwayCalculator.test.ts
git commit -m "feat: add deterministic multiway deep review"
```

---

### Task 5: 逐街范围重建、最终评分与整手摘要

**Files:**
- Create: `src/review/deepReview.ts`
- Create: `src/review/deepReview.test.ts`
- Modify: `src/training/assessment.ts`
- Modify: `src/training/assessment.test.ts`
- Modify: `src/training/curriculum.ts`
- Modify: `src/training/curriculum.test.ts`

**Interfaces:**
- Consumes: `DeepDecisionInput[]`, heads-up/multiway calculators, `snapshotRangeLedger`
- Produces: `calculateDeepHandReview(input, callbacks): Promise<DeepHandReview>`
- Produces: `assessmentFromDeepDecision(decision): DecisionAssessment`

- [ ] **Step 1: 写逐街范围、评分和隐私失败测试**

```ts
it("narrows each opponent range from only visible actions", async () => {
  const review = await calculateDeepHandReview(threeStreetFixture(), callbacks);
  expect(review.decisions[1].ranges["villain"].comboCount)
    .toBeLessThan(review.decisions[0].ranges["villain"].comboCount);
  expect(JSON.stringify(review)).not.toContain(hiddenVillainHole.join(""));
});

it("excludes cancelled and failed hands from weakness summaries", () => {
  expect(summarizeWeaknesses([cancelledHand(), failedHand()])).toEqual([]);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/review/deepReview.test.ts src/training/assessment.test.ts src/training/curriculum.test.ts`

Expected: FAIL，深度整手编排尚不存在。

- [ ] **Step 3: 实现逐决策范围账本与进度阶段**

按 `logIndex` 排序；从位置与翻前基线开始，逐条消费实际行动、尺度、人数和画像偏移。每个英雄节点保存上一节点到当前节点的范围类别增减，不保存未摊牌的真实底牌。

- [ ] **Step 4: 实现深度 EV 损失评分与中文教学事实**

使用最佳候选 EV 减去与实际动作最接近的候选 EV，再按节点风险归一化。输出正确点、纠正点、意图、弱点标签和一条具体核心规则；结果不读取 `result.winners` 决定好坏。

- [ ] **Step 5: 实现整手摘要和精度聚合**

整手摘要包含最大损失节点、最佳决策点、主要弱点和总体置信度；只要任一节点是 `sampled`，整手不得标记为精确。

- [ ] **Step 6: 运行测试确认绿灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/review/deepReview.test.ts src/training/assessment.test.ts src/training/curriculum.test.ts`

Expected: PASS；不泄露隐藏牌，不按输赢评分，未完成手牌不进入弱点统计。

- [ ] **Step 7: 提交**

```bash
git add src/review/deepReview.ts src/review/deepReview.test.ts src/training
git commit -m "feat: produce full deep hand assessments"
```

---

### Task 6: Worker、真实进度与取消生命周期

**Files:**
- Create: `src/review/deep-review.worker.ts`
- Create: `src/review/useDeepReview.ts`
- Create: `src/review/useDeepReview.test.tsx`
- Modify: `vite.config.ts`
- Modify: `vite.mobile.config.ts`

**Interfaces:**
- Produces: `useDeepReview({ game, onCompleted }): { status; progress; error; start; cancel }`
- Worker receives `{ type: "start"; requestId; input; config }` and `{ type: "cancel"; requestId }`.

- [ ] **Step 1: 写完成、取消、过期结果和卸载测试**

```tsx
it("ignores a completed event from an older request", async () => {
  const { result } = renderHook(() => useDeepReview(options));
  act(() => result.current.start());
  const oldId = worker.lastStart.requestId;
  act(() => result.current.start());
  worker.emit({ type: "completed", requestId: oldId, review: fixtureReview() });
  expect(options.onCompleted).not.toHaveBeenCalled();
});

it("terminates work and emits no partial review after cancel", () => {
  act(() => result.current.cancel());
  expect(worker.messages.at(-1)).toMatchObject({ type: "cancel" });
  expect(result.current.status).toBe("cancelled");
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/review/useDeepReview.test.tsx`

Expected: FAIL，Hook 和 Worker 尚不存在。

- [ ] **Step 3: 实现 Worker 批次取消与事件协议**

Worker 为每个请求保存取消标记；每个枚举/采样批次前检查标记并抛出内部 `ReviewCancelledError`。只有完整成功才发送 `completed`，取消不发送部分 `review`。

- [ ] **Step 4: 实现 Hook 身份校验和清理**

Hook 校验 `requestId`、`stateHash`、`seed`、`handNo`；新请求先取消旧请求，组件卸载时 `terminate()`。进度只接受单调增加的同请求事件。

- [ ] **Step 5: 验证桌面和移动构建都包含 Worker**

Run: `PLAYER_NAMES_MODE=public npm run build && npm run verify:mobile-bundle`

Expected: PASS；桌面与移动 `dist` 都包含独立 deep-review worker chunk，不含网络依赖。

- [ ] **Step 6: 提交**

```bash
git add src/review/deep-review.worker.ts src/review/useDeepReview.ts src/review/useDeepReview.test.tsx vite.config.ts vite.mobile.config.ts
git commit -m "feat: run cancellable deep review worker"
```

---

### Task 7: 牌局生命周期接入，移除行动中的同步评分

**Files:**
- Modify: `src/game/useGamePlayback.ts`
- Modify: `src/game/useGamePlayback.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.interaction.test.tsx`

**Interfaces:**
- Consumes: `captureHeroDecision`, `useDeepReview`, `repository.replaceHand`
- Produces: 结算后 `calculating -> completed/cancelled/failed` 状态机。

- [ ] **Step 1: 写牌局中不评分、结算后自动精算测试**

```tsx
it("captures the hero input without calculating assessment during submit", () => {
  act(() => result.current.submit({ type: "call" }));
  expect(result.current.game.reviewDecisionInputs).toHaveLength(1);
  expect(result.current.game.assessments).toHaveLength(0);
});

it("starts deep review only after hand-complete", async () => {
  stubPlayback(settledShowdownState(), "hand-complete");
  render(<App repository={repository} />);
  expect(await screen.findByText("正在精算")).toBeTruthy();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/game/useGamePlayback.test.tsx src/App.interaction.test.tsx`

Expected: FAIL，当前仍在提交动作时同步生成 assessment。

- [ ] **Step 3: 提交动作时只追加可见快照**

删除 `assessHeroDecision(game, action)` 同步调用；在 `planAfterHero` 前把 `captureHeroDecision(game)` 追加到克隆状态。不得改变现有动作动画、合法性或行动顺序。

- [ ] **Step 4: 结算后启动并写回深度结果**

`hand-complete` 时首次保存原始牌局并启动 Worker；完成后把 `deepReview`、`assessments`、`deepReviewStatus: "completed"` 写回当前牌局，调用 `repository.replaceHand`，刷新历史。取消/失败只更新状态，不写 assessments。

- [ ] **Step 5: 实现重算和开始下一手的任务清理**

重算生成新请求并清空旧错误；开始下一手前取消当前 Worker。打开历史牌局时，完成结果直接显示，未完成结果可重新精算。

- [ ] **Step 6: 运行测试确认绿灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/game/useGamePlayback.test.tsx src/App.interaction.test.tsx`

Expected: PASS；牌局中不再同步评分，结算后才精算，取消后可立即开始下一手。

- [ ] **Step 7: 提交**

```bash
git add src/game/useGamePlayback.ts src/game/useGamePlayback.test.tsx src/App.tsx src/App.interaction.test.tsx
git commit -m "feat: start deep review after hand completion"
```

---

### Task 8: 精算等待页与完整复盘界面

**Files:**
- Create: `src/components/DeepReviewProgress.tsx`
- Create: `src/components/DeepReviewProgress.test.tsx`
- Create: `src/components/DeepHandReview.tsx`
- Create: `src/components/DeepHandReview.test.tsx`
- Modify: `src/components/DecisionReview.tsx`
- Modify: `src/App.tsx`
- Modify: `src/training.css`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- `DeepReviewProgress({ status, progress, error, onCancel, onRetry, onNextHand })`
- `DeepHandReview({ game, review, onRecalculate, onNextHand })`

- [ ] **Step 1: 写等待页无基础复盘和取消按钮测试**

```tsx
it("shows only calculation progress before completion", () => {
  render(<DeepReviewProgress status="calculating" progress={progressFixture()} {...actions} />);
  expect(screen.getByText("正在精算")).toBeTruthy();
  expect(screen.getByRole("button", { name: "取消精算" })).toBeTruthy();
  expect(screen.queryByText("决策评分")).toBeNull();
});
```

- [ ] **Step 2: 写完成复盘六区块测试**

```tsx
it("renders summary timeline ranges ev outs and core rule", () => {
  render(<DeepHandReview game={reviewGame()} review={deepReviewFixture()} {...actions} />);
  for (const name of ["整手结论", "行动时间线", "范围变化", "候选 EV", "赔率与补牌", "核心规则"])
    expect(screen.getByText(name)).toBeTruthy();
  expect(screen.getByText(/精确枚举|确定性模拟/)).toBeTruthy();
});
```

- [ ] **Step 3: 运行测试确认红灯**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/components/DeepReviewProgress.test.tsx src/components/DeepHandReview.test.tsx`

Expected: FAIL，新组件尚不存在。

- [ ] **Step 4: 实现等待、取消、失败和未完成状态**

计算中只显示真实阶段、`completed/total`、取消按钮和“可离线完成”说明；取消/失败显示“重新精算”和“开始下一手”。不得在完成前渲染旧 `DecisionReview`。

- [ ] **Step 5: 实现完整复盘及响应式布局**

桌面侧栏使用摘要 + 可展开决策卡；移动端改为全宽纵向页面。候选 EV 表展示动作、合法目标金额、频率、EV、意图和精度。范围只展示组合类别及权重变化。

- [ ] **Step 6: 运行组件与视觉回归测试**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/components/DeepReviewProgress.test.tsx src/components/DeepHandReview.test.tsx src/App.interaction.test.tsx src/mobile/MobileApp.test.tsx`

Expected: PASS；移动端不横向溢出，精算前无基础复盘。

- [ ] **Step 7: 提交**

```bash
git add src/components src/App.tsx src/training.css src/mobile/mobile.css
git commit -m "feat: present cancellable deep hand review"
```

---

### Task 9: 端到端验证、性能门槛与交付检查

**Files:**
- Create: `src/review/deepReview.performance.test.ts`
- Modify: `tests/mobile-visual.spec.ts`
- Modify: `scripts/verify-mobile-bundle.mjs`
- Modify: `README.md`

**Interfaces:**
- No new runtime interface; this task gates release readiness.

- [ ] **Step 1: 添加固定牌局性能与可重复性门槛**

```ts
it("finishes the fixed heads-up review within the desktop budget", async () => {
  const started = performance.now();
  const first = await calculateDeepHandReview(fixedHeadsUpHand(), callbacks);
  const second = await calculateDeepHandReview(fixedHeadsUpHand(), callbacks);
  expect(second).toEqual(first);
  expect(performance.now() - started).toBeLessThan(30_000);
});
```

多人固定样本验证预算终止、置信度和同种子一致，不要求完整六人枚举。

- [ ] **Step 2: 运行深度模块和完整测试**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/review src/training src/game src/data src/components src/mobile`

Expected: PASS。

Run: `PLAYER_NAMES_MODE=public npm test`

Expected: 全套 PASS；允许项目既有显式 skip，不允许新增未说明 skip。

- [ ] **Step 3: 运行静态检查和构建验证**

Run: `PLAYER_NAMES_MODE=public npm run lint`

Expected: PASS。

Run: `PLAYER_NAMES_MODE=public npm run build`

Expected: PASS。

Run: `npm run verify:mobile-bundle && npm run verify:desktop-data`

Expected: PASS；移动包包含 Worker 和复盘代码，桌面策略数据完整。

- [ ] **Step 4: 运行原生存储与移动 PWA 验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS。

Run: `npm run test:pwa`

Expected: PASS；手机端可开始精算、取消、重算并读取已完成结果。

- [ ] **Step 5: 检查隐私、工作树和恢复本地名称**

Run: `PLAYER_NAMES_MODE=public npm run prepare:names && rg -n "Bella|哈队|倪少|零哥|Q大爷|董秘" src dist README.md docs --glob '!docs/superpowers/plans/2026-08-26-mobile-left-cards-large-actions.md' --glob '!docs/superpowers/specs/2026-08-26-mobile-left-cards-large-actions-design.md'`

Expected: 无公开旧名称命中。

Run: `PLAYER_NAMES_MODE=private npm run prepare:names && git status --short`

Expected: 私有名称恢复；只剩用户原有两份未提交文档和本计划预期改动。

- [ ] **Step 6: 更新说明并提交验证门槛**

README 明确：牌局中为快速计算，最终能力评分来自整手结束后的深度精算；多人结果标记确定性模拟，不冒充完整 GTO 求解。

```bash
git add src/review/deepReview.performance.test.ts tests/mobile-visual.spec.ts scripts/verify-mobile-bundle.mjs README.md
git commit -m "test: gate offline deep review delivery"
```

- [ ] **Step 7: 最终核验提交范围**

Run: `git diff --check 7de14fa..HEAD && git status --short`

Expected: 无空白错误；用户两份原有文档未被纳入任何提交。正式版本号、Mac/Windows/移动安装包和 GitHub 发布另行在用户确认测试通过后执行。
