# 德州扑克策略完整性 V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用显式翻前动作矩阵、翻后组合结构、尺度弹性和固定预算多街价值替换当前过粗的阈值/牌力桶策略，并生成桌面完整包与移动同源压缩包。

**Architecture:** 仓库保留可审计的规范化源策略，构建时编译为版本化策略包。运行时先查询显式基线节点，再用当前范围、阻断、非标尺度和固定预算后续街分支做有界修正；玩家画像始终位于标准策略之后。桌面与移动包由同一编译器生成，并通过主要动作差异门禁。

**Tech Stack:** TypeScript 5.8、React 19、Vitest、Web Worker、Vite PWA、Tauri 2、现有评牌/范围/规则引擎、JSON manifest + 紧凑数值块。

**Spec:** `docs/superpowers/specs/2026-08-30-strategy-completeness-v3-design.md`

## Global Constraints

- 规则引擎是合法动作、筹码、边池、评牌和结算的唯一事实源。
- 策略不读取未摊牌对手暗牌，不按本手输赢评价动作。
- 翻前运行时不得使用单一手牌强度排名生成动作。
- 标准策略先生成，玩家画像之后有界调整；两者分别保存。
- 桌面包不超过 500 MB；移动包必须可在 iPhone 14 Pro Max 上首次加载并完全离线。
- 桌面与移动策略必须由同一源数据和编译器生成。
- 桌面实时策略 P95 目标 `<=150 ms`；移动目标 `<=250 ms`。
- 旧牌局和旧策略事实可重放；V3 重新分析产生新记录，不覆写历史。
- 策略包未验证或预算超时时必须显式降级，不阻塞玩家行动，不计入正式能力分。

---

## File Structure

- Create `src/strategy/v3/packTypes.ts`: V3 manifest、翻前单元格、翻后节点和加载结果类型。
- Create `src/strategy/v3/packCodec.ts`: 策略包编码、解码、哈希校验与版本校验。
- Create `src/strategy/v3/preflopSource.ts`: 可审计的显式翻前动作矩阵源定义。
- Create `src/strategy/v3/preflopCompiler.ts`: 将源定义展开成每节点 169 手的运行时矩阵。
- Create `src/strategy/v3/preflopLookup.ts`: 精确查询、筹码深度插值和合法金额映射。
- Create `src/strategy/v3/preflopAudit.ts`: 全节点完整性、归一、合法性和范围方向扫描。
- Create `src/strategy/v3/boardFamily.ts`: 花色同构牌面族和转河动态分类。
- Create `src/strategy/v3/comboProfile.ts`: 英雄/对手组合结构、踢脚、阻断、反阻断、听牌和反超风险。
- Create `src/strategy/v3/rangeSegments.ts`: 对手范围互斥分段。
- Create `src/strategy/v3/elasticResponse.ts`: 逐组合尺度响应。
- Create `src/strategy/v3/futureStreetValue.ts`: 固定预算转河分支与五分量 EV。
- Create `src/strategy/v3/postflopStrategy.ts`: 翻后基线查询、相邻节点插值和多街候选动作。
- Create `src/strategy/v3/postflopAudit.ts`: 花色同构、尺度单调、价值支持和反例扫描。
- Create `src/strategy/v3/packCompiler.ts`: 由同一源生成桌面完整包和移动压缩包。
- Create `src/strategy/v3/packDiff.ts`: 桌面/移动主要动作与频率差异报告。
- Modify `src/strategy/engine.ts`: 优先调用 V3，保留 V2/安全回退。
- Modify `src/strategy/types.ts`: 增加 V3 策略来源、EV 分量、包类型和降级事实。
- Modify `src/strategy/profileDeviation.ts`: 消费 V3 范围分段与标准动作，保持有界偏移。
- Modify `src/insights/plainLanguageAnalysis.ts`: 解释更差跟注、更好继续、阻断和后续街价值。
- Modify `src/review/deepReview.ts`: 复盘使用更高分支预算，保留原决策包版本。
- Modify `src/data/types.ts` and repository/migration tests: 保存 V3 审计事实并兼容旧牌局。
- Modify `scripts/build-pwa-assets.mjs`: 打包移动策略包并加入 service-worker precache。
- Create `scripts/build-strategy-v3.mjs`: 生成、审计、压缩和输出两类策略包。
- Create `scripts/audit-strategy-v3.mjs`: CI/本地全策略空间门禁。

---

### Task 1: 建立 V3 策略包协议与可验证加载器

**Files:**
- Create: `src/strategy/v3/packTypes.ts`
- Create: `src/strategy/v3/packCodec.ts`
- Test: `src/strategy/v3/packCodec.test.ts`
- Modify: `src/strategy/types.ts`

**Interfaces:**
- Produces: `encodeStrategyPack(source: StrategyPackSource): Uint8Array`
- Produces: `decodeStrategyPack(bytes: Uint8Array, expected: PackExpectation): LoadedStrategyPack`
- Produces: `verifyStrategyManifest(manifest, payload): void`
- `PackExpectation` contains exact `schemaVersion: 3`, `appVersion`, and `packKind: "desktop" | "mobile"`.

- [ ] **Step 1: Write the failing codec tests**

```ts
it("round-trips a versioned strategy pack", () => {
  const bytes = encodeStrategyPack(minimalSource());
  const loaded = decodeStrategyPack(bytes, expectation("desktop"));
  expect(loaded.manifest).toMatchObject({ schemaVersion: 3, packKind: "desktop" });
  expect(loaded.preflop.nodes[0].hands).toHaveLength(169);
});

it("rejects a tampered payload and a pack-kind mismatch", () => {
  const bytes = encodeStrategyPack(minimalSource());
  bytes[bytes.length - 1] ^= 1;
  expect(() => decodeStrategyPack(bytes, expectation("desktop"))).toThrow(/SHA-256/);
  expect(() => decodeStrategyPack(encodeStrategyPack(minimalSource()), expectation("mobile")))
    .toThrow(/packKind/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/strategy/v3/packCodec.test.ts`

Expected: FAIL because `packCodec` and V3 types do not exist.

- [ ] **Step 3: Implement the pack schema and codec**

Define exact core types:

```ts
export type PackedAction = {
  kind: "fold" | "check" | "call" | "raise" | "all-in";
  sizeCode: number;
  frequencyQ: number; // uint16, 0..65535
  evMilliBb?: number;
};

export type StrategyPackManifestV3 = {
  schemaVersion: 3;
  strategyVersion: string;
  sourceVersion: string;
  compilerVersion: string;
  packKind: "desktop" | "mobile";
  nodeCount: number;
  sha256: string;
  minimumAppVersion: string;
};
```

Use canonical JSON for the manifest and deterministic numeric-array serialization for the payload. Compute SHA-256 over payload bytes; reject unknown schema, wrong kind, unsupported app version, invalid counts, non-normalized action cells, and hash mismatch.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run src/strategy/v3/packCodec.test.ts src/strategy/preflopPack.test.ts && npx tsc -b --pretty false`

Expected: PASS.

- [ ] **Step 5: Commit the pack protocol**

```bash
git add src/strategy/types.ts src/strategy/v3/packTypes.ts src/strategy/v3/packCodec.ts src/strategy/v3/packCodec.test.ts
git commit -m "feat: add verified strategy pack v3 protocol"
```

---

### Task 2: 用显式 169 手动作矩阵替换翻前强度阈值

**Files:**
- Create: `src/strategy/v3/preflopSource.ts`
- Create: `src/strategy/v3/preflopCompiler.ts`
- Create: `src/strategy/v3/preflopLookup.ts`
- Test: `src/strategy/v3/preflopCompiler.test.ts`
- Test: `src/strategy/v3/preflopLookup.test.ts`
- Modify: `src/strategy/engine.ts`

**Interfaces:**
- Produces: `compilePreflopMatrix(source: PreflopSourceV3): CompiledPreflopMatrix`
- Produces: `lookupPreflopV3(matrix, node, hole, legal): StrategyResult`
- Consumes existing `classifyPreflopNode()` and rule-engine legal bounds.

- [ ] **Step 1: Write failing source-expansion tests**

```ts
it("expands every required node to exactly 169 normalized hands", () => {
  const matrix = compilePreflopMatrix(PREFLOP_SOURCE_V3);
  for (const node of matrix.nodes) {
    expect(node.hands).toHaveLength(169);
    for (const hand of node.hands) {
      expect(hand.actions.reduce((sum, action) => sum + action.frequency, 0))
        .toBeCloseTo(1, 10);
    }
  }
});

it("preserves non-monotonic explicit mixed hands", () => {
  const matrix = compilePreflopMatrix(PREFLOP_SOURCE_V3);
  const a2s = matrix.cell("unopened", "HJ", 100, "A2s");
  expect(a2s.actions.find((action) => action.kind === "raise")!.frequency)
    .toBeGreaterThan(0.2);
  expect(a2s.source).toBe("expert-baseline-v3");
});
```

- [ ] **Step 2: Run compiler tests and verify RED**

Run: `npx vitest run src/strategy/v3/preflopCompiler.test.ts`

Expected: FAIL because the source/compiler do not exist.

- [ ] **Step 3: Implement auditable source groups without runtime ranking**

Represent each node as explicit hand groups with optional mixed overrides:

```ts
type PreflopSourceNode = {
  key: `${PreflopSpot}:${Position}:${PreflopStackBucket}`;
  provenance: "expert-baseline-v3" | "validated-reference" | "local-solve";
  actions: Array<{
    kind: PackedAction["kind"];
    sizeClass?: PreflopSizeClass;
    frequency: number;
    hands: readonly string[];
  }>;
};
```

The compiler must reject duplicate hand/action entries, absent hands, unknown hand labels, illegal actions for the spot, and frequency totals outside `1e-9`. No call to `handPercentile`, `handStrength`, or `rawStrength` is allowed in compilation or runtime lookup.

- [ ] **Step 4: Write failing lookup/interpolation tests**

```ts
it("uses the exact matrix cell instead of a percentile threshold", () => {
  const result = lookupPreflopV3(matrix, hjUnopened100, ["As", "2s"], legalOpen);
  expect(result.explanationFacts.handClass).toBe("A2s");
  expect(result.actions.some((action) => action.action === "raise" && action.frequency > 0.2))
    .toBe(true);
});

it("interpolates frequencies between stack buckets then renormalizes", () => {
  const result = lookupPreflopV3(matrix, hjUnopened80, ["As", "2s"], legalOpen);
  expect(result.actions.reduce((sum, action) => sum + action.frequency, 0))
    .toBeCloseTo(1, 10);
});
```

- [ ] **Step 5: Implement lookup and engine integration**

Map size classes through existing rule-engine legal bounds. Merge identical legal actions after clamping, preserve weighted EV, and return `strategyVersion: "strategy-v3"`, exact source/provenance, stack interpolation facts, and baseline actions. V2 remains available only when V3 pack loading fails.

- [ ] **Step 6: Run preflop strategy tests**

Run: `npx vitest run src/strategy/v3/preflopCompiler.test.ts src/strategy/v3/preflopLookup.test.ts src/strategy/preflopNode.test.ts src/strategy/engine.test.ts src/strategy/preflopRegression.test.ts`

Expected: PASS, including the A2s HJ regression without a hand-specific runtime branch.

- [ ] **Step 7: Commit explicit preflop matrices**

```bash
git add src/strategy/v3/preflopSource.ts src/strategy/v3/preflopCompiler.ts src/strategy/v3/preflopLookup.ts src/strategy/v3/preflopCompiler.test.ts src/strategy/v3/preflopLookup.test.ts src/strategy/engine.ts src/strategy/preflopRegression.test.ts
git commit -m "feat: replace preflop thresholds with explicit matrices"
```

---

### Task 3: 建立翻前全矩阵完整性门禁

**Files:**
- Create: `src/strategy/v3/preflopAudit.ts`
- Test: `src/strategy/v3/preflopAudit.test.ts`
- Create: `scripts/audit-strategy-v3.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `auditPreflopMatrix(matrix): StrategyAuditReport`
- Produces CLI command: `npm run audit:strategy-v3`.

- [ ] **Step 1: Write failing audit tests**

Construct corrupted matrices and assert exact issue codes:

```ts
expect(auditPreflopMatrix(withMissingHand(matrix)).issues)
  .toContainEqual(expect.objectContaining({ code: "PF_HAND_MISSING" }));
expect(auditPreflopMatrix(withIllegalAction(matrix)).issues)
  .toContainEqual(expect.objectContaining({ code: "PF_ACTION_ILLEGAL" }));
expect(auditPreflopMatrix(withPositionInversion(matrix)).issues)
  .toContainEqual(expect.objectContaining({ code: "PF_POSITION_RANGE_INVERSION" }));
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/strategy/v3/preflopAudit.test.ts`

Expected: FAIL because `preflopAudit` does not exist.

- [ ] **Step 3: Implement structural and aggregate audits**

Audit all required nodes for coverage, normalization, legal action families, supported size classes, provenance, and finite EV. Aggregate open/continue/aggressive frequencies by position and pressure level. Position or pressure direction checks use documented tolerance bands and emit a report; unexplained violations fail the build. Hand-local non-monotonic mixes are permitted because they come from explicit matrix cells.

- [ ] **Step 4: Add CLI and run the full preflop gate**

Add:

```json
"audit:strategy-v3": "node scripts/audit-strategy-v3.mjs"
```

Run: `npm run audit:strategy-v3`

Expected: exit `0`, report all required preflop nodes, 169 hands per node, no fatal issues.

- [ ] **Step 5: Commit the preflop audit gate**

```bash
git add package.json scripts/audit-strategy-v3.mjs src/strategy/v3/preflopAudit.ts src/strategy/v3/preflopAudit.test.ts
git commit -m "test: audit the complete preflop strategy matrix"
```

---

### Task 4: 建立牌面族和组合级翻后特征

**Files:**
- Create: `src/strategy/v3/boardFamily.ts`
- Create: `src/strategy/v3/comboProfile.ts`
- Test: `src/strategy/v3/boardFamily.test.ts`
- Test: `src/strategy/v3/comboProfile.test.ts`
- Modify: `src/strategy/types.ts`

**Interfaces:**
- Produces: `classifyBoardFamily(board: Card[]): BoardFamilyV3`
- Produces: `profileCombo(hole, board, opponentRange?): ComboProfileV3`
- Produces: `compareBlockerEffects(heroProfile, opponentRange): BlockerEffectV3`.

- [ ] **Step 1: Write failing board-family tests**

```ts
it("is invariant under suit-isomorphic substitutions", () => {
  expect(classifyBoardFamily(["Ah", "Ac", "7d"]).familyId)
    .toBe(classifyBoardFamily(["As", "Ad", "7c"]).familyId);
});

it("distinguishes top-paired, low-paired, monotone and connected boards", () => {
  expect(new Set([
    classifyBoardFamily(["Ah", "Ac", "7d"]).familyId,
    classifyBoardFamily(["7h", "7c", "Ad"]).familyId,
    classifyBoardFamily(["Ah", "9h", "3h"]).familyId,
    classifyBoardFamily(["9h", "8c", "7d"]).familyId,
  ])).toHaveLength(4);
});
```

- [ ] **Step 2: Implement canonical board families**

Preserve street, high-card band, paired structure, suit structure, connectivity, straight pressure, and dynamic turn/river transition. Generate `familyId` only from public canonical features.

- [ ] **Step 3: Write failing combo-profile tests**

```ts
it("separates pocket-set construction from board-pair trips", () => {
  expect(profileCombo(["7s", "7c"], ["7h", "Ad", "2c"]).construction).toBe("pocket-set");
  expect(profileCombo(["As", "2s"], ["Ah", "Ac", "7d"]).construction).toBe("board-pair-trips");
});

it("measures blockers to worse calls separately from blockers to better continues", () => {
  const fact = compareBlockerEffects(
    profileCombo(["As", "2s"], ["Ah", "Ac", "7d"]),
    pairedBoardOpponentRange,
  );
  expect(fact.worseCallBlocked).toBeGreaterThan(0);
  expect(fact.worseCallBlocked).not.toBe(fact.betterContinueBlocked);
});
```

- [ ] **Step 4: Implement detailed combo profiles**

Store exact made category, construction, kicker band, showdown tier, draw vector, clean/dirty outs, nut blockers, worse-call blockers, better-continue blockers, bluff-catcher properties, counterfeit risk, and future vulnerability. Do not collapse these fields into the old eight-tier bucket at the V3 boundary.

- [ ] **Step 5: Run feature tests and evaluator cross-checks**

Run: `npx vitest run src/strategy/v3/boardFamily.test.ts src/strategy/v3/comboProfile.test.ts src/policy/handFeatures.test.ts src/engine/evaluator.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit board and combo semantics**

```bash
git add src/strategy/types.ts src/strategy/v3/boardFamily.ts src/strategy/v3/boardFamily.test.ts src/strategy/v3/comboProfile.ts src/strategy/v3/comboProfile.test.ts
git commit -m "feat: model board families and combo-level features"
```

---

### Task 5: 将对手响应升级为逐组合尺度弹性

**Files:**
- Create: `src/strategy/v3/rangeSegments.ts`
- Create: `src/strategy/v3/elasticResponse.ts`
- Test: `src/strategy/v3/rangeSegments.test.ts`
- Test: `src/strategy/v3/elasticResponse.test.ts`
- Modify: `src/insights/actionResponse.ts`

**Interfaces:**
- Produces: `segmentOpponentRange(input): SegmentedRangeV3`
- Produces: `estimateElasticResponse(input): ElasticResponseV3`
- `ElasticResponseV3` exposes six mutually exclusive weights plus continued hero equity.

- [ ] **Step 1: Write failing mutually-exclusive segmentation tests**

```ts
expect(response.fold + response.worseMadeCall + response.drawCall +
  response.betterCall + response.valueRaise + response.bluffRaise)
  .toBeCloseTo(1, 10);
expect(response.segments.flatMap((segment) => segment.comboIds).sort())
  .toEqual(validOpponentComboIds.sort());
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/strategy/v3/rangeSegments.test.ts src/strategy/v3/elasticResponse.test.ts`

Expected: FAIL because V3 segmentation does not exist.

- [ ] **Step 3: Implement combo segmentation**

Classify each weighted combo relative to the hero's current profile and board family. A combo belongs to exactly one structural segment before probabilistic action mixing; probabilistic mix weights remain attached to that combo and sum to one.

- [ ] **Step 4: Implement nonlinear size elasticity**

For each combo, compute action logits from relative hand class, showdown value, draw quality, blockers, street, position, SPR, line, pot fraction, and optional player profile. Normalize per combo, then aggregate by combo weight. Enforce only structural bounds: strong made hands retain a non-zero continue floor; weak bluff catchers generally continue less as size grows; profile shifts remain bounded and are recorded.

- [ ] **Step 5: Add property tests across size grids**

Generate half-pot, two-thirds-pot, pot and overbet responses over representative board families. Assert normalization, finite values, non-mechanical overbet folds, broad weak-range monotonicity, and player-profile deviation bounds. Do not assert one exact frequency for one exact hand.

- [ ] **Step 6: Map V3 responses to insight summaries**

Map `worseMadeCall + drawCall + betterCall` to displayed calls and both raise segments to displayed raises, while retaining detailed segments in the structured audit facts.

- [ ] **Step 7: Run response and hidden-card tests**

Run: `npx vitest run src/strategy/v3/rangeSegments.test.ts src/strategy/v3/elasticResponse.test.ts src/insights/actionResponse.test.ts src/insights/opponentRanges.test.ts`

Expected: PASS and no unrevealed real hole cards in serialized facts.

- [ ] **Step 8: Commit elastic responses**

```bash
git add src/strategy/v3/rangeSegments.ts src/strategy/v3/rangeSegments.test.ts src/strategy/v3/elasticResponse.ts src/strategy/v3/elasticResponse.test.ts src/insights/actionResponse.ts
git commit -m "feat: model combo-level sizing elasticity"
```

---

### Task 6: 建立固定预算多街价值和 V3 翻后策略

**Files:**
- Create: `src/strategy/v3/futureStreetValue.ts`
- Create: `src/strategy/v3/postflopStrategy.ts`
- Test: `src/strategy/v3/futureStreetValue.test.ts`
- Test: `src/strategy/v3/postflopStrategy.test.ts`
- Modify: `src/strategy/engine.ts`
- Modify: `src/strategy/postflopBaselineV2.test.ts`

**Interfaces:**
- Produces: `evaluateCandidateV3(input): MultiStreetActionValue`
- Produces: `decidePostflopV3(input): StrategyResult`
- `MultiStreetActionValue` contains `immediateFold`, `worseContinue`, `betterContinueCost`, `futureStreet`, `realizationPenalty`, and `total`.

- [ ] **Step 1: Write failing EV decomposition tests**

```ts
it("sums the five EV components deterministically", () => {
  const value = evaluateCandidateV3(fixedInput);
  expect(value.total).toBeCloseTo(value.immediateFold + value.worseContinue -
    value.betterContinueCost + value.futureStreet - value.realizationPenalty, 10);
  expect(evaluateCandidateV3(fixedInput)).toEqual(value);
});
```

- [ ] **Step 2: Implement deterministic future-street branches**

Enumerate or deterministically sample canonical next-card classes under an explicit branch budget. For every branch, update public board family, combo profiles and segmented ranges, then use terminal/continuation values from the source node. The same input, seed and budget must select the same branches.

- [ ] **Step 3: Write failing strategy property tests**

```ts
it("does not choose a larger value size solely because absolute hand strength is high", () => {
  const results = sweepWorseCallElasticity(pairedTripsFixture);
  expect(results.whenWorseCallsCollapse.pot.frequency)
    .toBeLessThan(results.whenWorseCallsPersist.pot.frequency);
});

it("retains checking or small value when trips block worse continues on a paired dry board", () => {
  const result = decidePostflopV3(pairedTripsFixture);
  expect(primary(result).potFraction ?? 0).toBeLessThan(1);
  expect(result.actions.some((action) => action.action === "check" && action.frequency > 0.1))
    .toBe(true);
});
```

- [ ] **Step 4: Implement V3 candidate generation and mixing**

Query source-node priors by board family, line, position, pot type and SPR. Generate only legal check/fold/call and standardized size classes, interpolate non-standard states, evaluate every candidate with the five EV components, then combine source prior and EV within a documented temperature. Preserve mixed actions; never select a size from absolute equity alone.

- [ ] **Step 5: Integrate V3 into the strategy engine**

Use V3 when a verified pack and valid range snapshot are present. Fall back to V2 only with `degradationReason`, `scored: false`, and visible low confidence. Continue applying `applyBoundedDeviation` after standard V3 actions are finalized.

- [ ] **Step 6: Run postflop and engine tests**

Run: `npx vitest run src/strategy/v3/futureStreetValue.test.ts src/strategy/v3/postflopStrategy.test.ts src/strategy/postflopBaselineV2.test.ts src/strategy/engine.test.ts src/strategy/behaviorRegression.test.ts`

Expected: PASS. The A-A-x trips regression passes because range elasticity and future value support the result, not because of a card-specific branch.

- [ ] **Step 7: Commit multi-street strategy**

```bash
git add src/strategy/engine.ts src/strategy/v3/futureStreetValue.ts src/strategy/v3/futureStreetValue.test.ts src/strategy/v3/postflopStrategy.ts src/strategy/v3/postflopStrategy.test.ts src/strategy/postflopBaselineV2.test.ts
git commit -m "feat: add deterministic multi-street strategy v3"
```

---

### Task 7: 建立翻后全属性扫描与独立参考报告

**Files:**
- Create: `src/strategy/v3/postflopAudit.ts`
- Test: `src/strategy/v3/postflopAudit.test.ts`
- Modify: `scripts/audit-strategy-v3.mjs`

**Interfaces:**
- Produces: `auditPostflopStrategy(pack, fixtures): StrategyAuditReport`
- Extends `npm run audit:strategy-v3` with preflop and postflop reports.

- [ ] **Step 1: Write failing property-audit tests**

Test that the audit catches suit-isomorphism divergence, non-normalized response segments, illegal sizes, non-finite EV, value actions without worse continues, and broad weak-range continuation increasing sharply with size.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/strategy/v3/postflopAudit.test.ts`

Expected: FAIL because the audit does not exist.

- [ ] **Step 3: Implement representative-state generation**

Generate deterministic fixtures across flop/turn/river, board families, SRP/3BP/4BP, IP/OOP, initiative, SPR buckets, hand constructions, blocker classes, HU and multiway safety nodes. Persist only public state and synthetic weighted ranges.

- [ ] **Step 4: Implement audit issue codes and reference bands**

Each failure includes node ID, issue code, public fixture and offending actions. Independent-reference bands are loaded from a versioned test fixture with provenance; absent reference data yields `UNVERIFIED_EXPERT_BASELINE`, not a fabricated pass.

- [ ] **Step 5: Run the complete strategy audit**

Run: `npm run audit:strategy-v3`

Expected: no fatal structural/property issues; unverified expert-baseline counts are reported separately.

- [ ] **Step 6: Commit postflop audit gates**

```bash
git add scripts/audit-strategy-v3.mjs src/strategy/v3/postflopAudit.ts src/strategy/v3/postflopAudit.test.ts
git commit -m "test: audit postflop strategy properties v3"
```

---

### Task 8: 生成桌面完整包和移动同源压缩包

**Files:**
- Create: `src/strategy/v3/packCompiler.ts`
- Create: `src/strategy/v3/packDiff.ts`
- Test: `src/strategy/v3/packCompiler.test.ts`
- Test: `src/strategy/v3/packDiff.test.ts`
- Create: `scripts/build-strategy-v3.mjs`
- Modify: `scripts/build-pwa-assets.mjs`
- Modify: `scripts/verify-mobile-bundle.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `compileStrategyPacks(source): { desktop, mobile, diffReport }`
- CLI: `npm run build:strategy-v3`.

- [ ] **Step 1: Write failing deterministic-build tests**

```ts
const first = compileStrategyPacks(sourceFixture);
const second = compileStrategyPacks(sourceFixture);
expect(first.desktop).toEqual(second.desktop);
expect(first.mobile).toEqual(second.mobile);
expect(first.diffReport.fatal).toEqual([]);
```

- [ ] **Step 2: Implement desktop compilation**

Retain all supported source nodes, stack buckets, size classes and future-street terminal values. Quantize frequencies to uint16 with deterministic residual assignment; retain EV at documented milli-BB precision.

- [ ] **Step 3: Implement mobile derivation from desktop source**

Cluster adjacent board families only when primary action matches and EV ordering remains within the configured tolerance. Remove actions below the sparse-frequency threshold only after transferring probability to the closest same-intent action. The mobile compiler may not ingest hand-maintained mobile strategy rules.

- [ ] **Step 4: Implement desktop/mobile difference gates**

Fail when primary actions differ in more than the configured fixture tolerance, when any high-confidence reference node changes primary action, when normalization breaks, or when a mobile node has no provenance back to desktop source nodes.

- [ ] **Step 5: Integrate build scripts and PWA precache**

Add:

```json
"build:strategy-v3": "node scripts/build-strategy-v3.mjs"
```

Make `npm run build` generate packs before Vite builds. Copy the mobile pack into `dist/mobile/assets/strategy/`, include it in service-worker precache, and verify manifest/hash/no-private-data.

- [ ] **Step 6: Verify size and bundle integrity**

Run: `npm run build:strategy-v3 && npm run build && npm run verify:mobile-bundle`

Expected: desktop pack `<500 MB`; mobile bundle verifies complete precache and strategy manifest; diff report has no fatal entries.

- [ ] **Step 7: Commit strategy-pack builds**

```bash
git add package.json scripts/build-strategy-v3.mjs scripts/build-pwa-assets.mjs scripts/verify-mobile-bundle.mjs src/strategy/v3/packCompiler.ts src/strategy/v3/packCompiler.test.ts src/strategy/v3/packDiff.ts src/strategy/v3/packDiff.test.ts
git commit -m "build: generate desktop and mobile strategy v3 packs"
```

---

### Task 9: 升级中文解释、精算复盘和历史兼容

**Files:**
- Modify: `src/insights/plainLanguageAnalysis.ts`
- Modify: `src/insights/plainLanguageAnalysis.test.ts`
- Modify: `src/review/deepReview.ts`
- Modify: `src/review/deepReview.test.ts`
- Modify: `src/review/types.ts`
- Modify: `src/data/types.ts`
- Modify: `src/data/repository.test.ts`
- Modify: `src/components/PreActionInsights.tsx`
- Modify: `src/components/DeepHandReview.tsx`

**Interfaces:**
- V3 analysis consumes `MultiStreetActionValue`, `ElasticResponseV3`, baseline actions and profile adjustment.
- V3 review preserves original real-time decision facts and adds a separately versioned exact-review result.

- [ ] **Step 1: Write failing explanation tests**

```ts
expect(section("standard", analysis).text).toContain("更差牌继续");
expect(section("standard", analysis).text).toContain("阻断");
expect(section("standard", analysis).text).toContain("后续街");
expect(renderedText).not.toMatch(/effective combos|coverage|sample budget/i);
```

Also assert each topic appears once in the ordered five-section UI and that low-confidence/degraded results say so plainly.

- [ ] **Step 2: Implement V3 plain-language facts**

Describe hero construction, relevant opponent segments, which worse hands continue at each recommended size, which better hands continue/raise, blocker direction, future-street plan, standard action, and bounded profile adjustment. Keep technical node IDs and pack internals in collapsed audit records.

- [ ] **Step 3: Write failing persistence/migration tests**

Round-trip V3 pack version, node ID, range hash, EV components, baseline/adjusted actions and degradation facts through the desktop repository and JSON export. Import a V9/V2 hand and assert unchanged legacy replay.

- [ ] **Step 4: Implement versioned records and review recalculation**

Add V3 decision/review fields without changing old record interpretation. “Use new strategy to reanalyze” creates a new review object linked to the original hand; it never changes the original assessment.

- [ ] **Step 5: Run explanation, review and persistence tests**

Run: `npx vitest run src/insights/plainLanguageAnalysis.test.ts src/components/PreActionInsights.test.tsx src/review/deepReview.test.ts src/components/DeepHandReview.test.tsx src/data/repository.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit V3 teaching and persistence**

```bash
git add src/insights/plainLanguageAnalysis.ts src/insights/plainLanguageAnalysis.test.ts src/review/deepReview.ts src/review/deepReview.test.ts src/review/types.ts src/data/types.ts src/data/repository.test.ts src/components/PreActionInsights.tsx src/components/DeepHandReview.tsx
git commit -m "feat: explain and persist strategy v3 decisions"
```

---

### Task 10: 全量验证、性能门、离线构建与交付审计

**Files:**
- Modify: `src/strategy/stressGate.test.ts`
- Modify: `src/insights/performance.test.ts`
- Modify: `scripts/verify-desktop-data.mjs`
- Modify: `README.md`
- Create: `docs/strategy-v3-audit.md`

**Interfaces:**
- Produces final commands: `npm test`, `npm run test:strategy`, `npm run audit:strategy-v3`, `npm run test:performance`, `npm run build`, `npm run verify:mobile-bundle`, `npm run verify:desktop-data`.

- [ ] **Step 1: Extend stress fixtures with V3 provenance and degradation assertions**

For all generated legal decisions, assert normalized frequencies, legal sizes, finite EV components, matching pack version, no hidden-hole leakage, and explicit degradation facts whenever V3 is not used.

- [ ] **Step 2: Add repeated desktop/mobile performance gates**

Warm up, run at least five batches, report median and P95 separately. Desktop V3 live decisions must satisfy P95 `<=150 ms`; mobile compressed-pack decisions P95 `<=250 ms`. Action controls remain enabled while insight calculation runs.

- [ ] **Step 3: Run complete tests and strategy audits**

Run:

```bash
npm test
npm run test:strategy
npm run audit:strategy-v3
npm run test:performance
```

Expected: all pass; audit has zero fatal issues and reports the count of independently verified versus expert-baseline nodes.

- [ ] **Step 4: Build and verify desktop/mobile artifacts**

Run:

```bash
npm run build
npm run verify:mobile-bundle
npm run verify:desktop-data
```

Expected: all pass; pack hashes and sizes are printed; no API key, private player name, fixed LAN address or unrevealed hole-card data appears in public artifacts.

- [ ] **Step 5: Perform targeted real-play regression**

Replay the saved A2s HJ first-in and A-A-x board-pair-trips fixtures plus a representative set of suited-wheel aces, paired boards, dry boards, wet boards, IP/OOP and multiway states. Record source node, primary/mixed actions, size, worse-continue segment and future-street plan in `docs/strategy-v3-audit.md`.

- [ ] **Step 6: Update user-facing boundaries**

README must call V3 a verified local practical strategy, disclose independently verified versus expert-baseline coverage, and explicitly state that it is not a complete commercial Solver or full multiway GTO.

- [ ] **Step 7: Commit verification evidence**

```bash
git add README.md docs/strategy-v3-audit.md src/strategy/stressGate.test.ts src/insights/performance.test.ts scripts/verify-desktop-data.mjs
git commit -m "test: verify strategy v3 delivery"
```
