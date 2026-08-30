# Actionable Live Coaching and Whole-Hand Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace repetitive decision templates with V3-backed compact live coaching and one continuous, evidence-specific whole-hand review.

**Architecture:** Keep the V3 strategy engine and rules engine as the only fact producers. Add a presentation model for compact live facts, retain per-opponent range summaries, and aggregate captured decision snapshots into one whole-hand narrative; React components render these models without recomputing poker strategy.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, existing local V3 strategy engine and deterministic review workers.

**Spec:** `docs/superpowers/specs/2026-08-30-hand-coach-review-design.md`

## Global Constraints

- Live coaching and review must use V3 or a later strategy result; UI simplification must not introduce a second heuristic strategy.
- A fallback must be labelled explicitly and must not masquerade as V3 or participate in formal scoring.
- Preflop must not show speculative postflop hand-class upgrade probabilities.
- Postflop upgrade lists contain only categories strictly stronger than the current made hand.
- Each active opponent keeps an independent weighted range and confidence value.
- Unknown hole cards remain ranges; no hidden opponent card may enter exported or rendered review facts.
- Existing persisted V3 reviews remain readable through optional new fields and the legacy renderer.
- Professional combinations, samples, coverage, EVs, strategy source and node id remain available in collapsed audit details.
- All changes remain fully offline and shared by desktop and mobile builds.

---

### Task 1: Correct V3 position and strategy-audit facts

**Files:**
- Modify: `src/strategy/v3/preflopLookup.ts`
- Modify: `src/insights/plainLanguageAnalysis.ts`
- Modify: `src/insights/types.ts`
- Test: `src/strategy/v3/preflopLookup.test.ts`
- Test: `src/insights/plainLanguageAnalysis.test.ts`

**Interfaces:**
- Consumes: `PreflopNode.inPosition`, `PreflopNode.spot`, `PreflopNode.actingPosition`, and `StrategyResult` audit fields.
- Produces: correct preflop position facts plus explicit strategy display/degradation facts.

- [ ] **Step 1: Write the failing V3 fact tests**

Add unopened BTN and UTG lookups:

```ts
expect(button.explanationFacts).toMatchObject({
  inPosition: 1,
  actingPosition: "BTN",
  preflopSpot: "unopened",
});
expect(utg.explanationFacts).toMatchObject({
  inPosition: 0,
  actingPosition: "UTG",
  preflopSpot: "unopened",
});
```

- [ ] **Step 2: Run the strategy test and verify RED**

Run: `npx vitest run src/strategy/v3/preflopLookup.test.ts`

Expected: FAIL because `lookupPreflopV3` omits these explanation facts.

- [ ] **Step 3: Export the missing V3 facts**

Extend the existing result without changing frequencies or EVs:

```ts
explanationFacts: {
  ...existingFacts,
  inPosition: node.inPosition ? 1 : 0,
  actingPosition: node.actingPosition,
  preflopSpot: node.spot,
}
```

- [ ] **Step 4: Write failing wording and audit tests**

Create preflop BTN and UTG analysis fixtures. Assert that BTN unopened contains `庄位` and `可开池范围`, UTG contains `前位范围更紧`, and neither uses the generic postflop `先行动会降低` sentence. Assert a normal result displays V3 while a degraded result exposes its reason.

- [ ] **Step 5: Run the wording test and verify RED**

Run: `npx vitest run src/insights/plainLanguageAnalysis.test.ts`

Expected: FAIL because preflop currently reuses the postflop position template and has no display status.

- [ ] **Step 6: Split preflop/postflop wording and add audit status**

Implement a focused `positionSentence(input, hero, strategy)` helper. Preflop branches on actual position and `preflopSpot`; postflop alone uses `inPosition`. Extend analysis audit with:

```ts
displayVersion: strategy.strategyVersion.startsWith("strategy-v3") ? "V3" : strategy.strategyVersion,
degraded: Boolean(strategy.degradation),
```

- [ ] **Step 7: Verify and commit**

Run: `npx vitest run src/strategy/v3/preflopLookup.test.ts src/insights/plainLanguageAnalysis.test.ts`

Expected: PASS.

```bash
git add src/strategy/v3/preflopLookup.ts src/strategy/v3/preflopLookup.test.ts src/insights/plainLanguageAnalysis.ts src/insights/plainLanguageAnalysis.test.ts src/insights/types.ts
git commit -m "fix: report V3 position and audit facts"
```

---

### Task 2: Build compact live-coaching facts

**Files:**
- Create: `src/insights/liveCoachSummary.ts`
- Create: `src/insights/liveCoachSummary.test.ts`
- Modify: `src/insights/types.ts`
- Modify: `src/insights/usePreActionInsights.ts`
- Test: `src/insights/usePreActionInsights.test.tsx`

**Interfaces:**
- Consumes: `PreActionInsightInput`, optional `ExactProjection`, independent `OpponentRangeSummary[]`, and `DecisionAnalysisV2.audit`.
- Produces: optional `PreActionInsightState.liveCoach: LiveCoachSummary`.

- [ ] **Step 1: Define backward-compatible types**

```ts
export type LiveCoachSummary = {
  strategy: { label: string; version: string; source?: string; degraded: boolean; reason?: string };
  hero: {
    title: string;
    detail: string;
    upgrades: Array<{ name: string; probability: number }>;
    dirtyOuts: Card[];
  };
  opponents: Array<{
    seat: number;
    playerId: string;
    primary: boolean;
    buckets: OpponentRangeBuckets;
    confidence: number;
    evidence: string[];
  }>;
};
```

Add `liveCoach?: LiveCoachSummary` to `PreActionInsightState` so old snapshots remain valid.

- [ ] **Step 2: Write failing strict-upgrade tests**

Cover:

```ts
expect(buildLiveCoachSummary(flopSet).hero.upgrades.map((item) => item.name))
  .toEqual(["葫芦", "四条"]);
expect(buildLiveCoachSummary(preflop).hero.upgrades).toEqual([]);
expect(buildLiveCoachSummary(river).hero.upgrades).toEqual([]);
```

The set fixture includes a current-category `三条` row to prove it is excluded.

- [ ] **Step 3: Run the new test and verify RED**

Run: `npx vitest run src/insights/liveCoachSummary.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement hero facts**

Use this strict filter:

```ts
const upgrades = input.street === "preflop" || input.street === "river" || !exact
  ? []
  : exact.handClasses
      .filter((item) => item.category > exact.currentHand.category && item.byRiver >= 0.005)
      .sort((a, b) => b.byRiver - a.byRiver)
      .slice(0, 3)
      .map((item) => ({ name: item.name, probability: item.byRiver }));
```

Use canonical preflop class plus position/action context before the flop; use `exact.currentHand.name` after the flop. Never show current-category retention as an upgrade.

- [ ] **Step 5: Write failing per-opponent tests**

Create a three-way fixture with separate bettor and caller summaries. Assert two opponent records remain separate, their bucket distributions differ, each display distribution sums to one, and the latest aggressor is primary.

- [ ] **Step 6: Implement opponent and strategy mapping**

Choose the primary opponent from the latest visible `raise`, `bet`, or `all-in` by a live opponent. Preserve every supplied range separately. Normalize only the displayed buckets. Produce either `本次策略：V3` or `已降级：安全策略` with the saved reason.

- [ ] **Step 7: Attach the model in the insight hook**

Build `liveCoach` after analysis facts exist. Preserve exact hero facts while ranges are still loading, and never block action buttons.

- [ ] **Step 8: Verify and commit**

Run: `npx vitest run src/insights/liveCoachSummary.test.ts src/insights/usePreActionInsights.test.tsx`

Expected: PASS.

```bash
git add src/insights/liveCoachSummary.ts src/insights/liveCoachSummary.test.ts src/insights/types.ts src/insights/usePreActionInsights.ts src/insights/usePreActionInsights.test.tsx
git commit -m "feat: add compact V3 live coaching facts"
```

---

### Task 3: Render the compact live-coaching UI

**Files:**
- Modify: `src/components/PreActionInsights.tsx`
- Modify: `src/components/PreActionInsights.test.tsx`
- Modify: `src/training.css`
- Modify: `src/mobile/mobile.css`
- Test: `src/mobile/MobileInsightSummary.test.tsx`

**Interfaces:**
- Consumes: `PreActionInsightState.liveCoach` from Task 2.
- Produces: one strategy badge, one hero block, strict upgrade chips, and independent opponent rows.

- [ ] **Step 1: Write the failing compact hierarchy test**

Render a ready fixture and assert:

```ts
expect(screen.getByText("本次策略：V3")).toBeInTheDocument();
expect(screen.getByText("当前暗三条 9")).toBeInTheDocument();
expect(screen.getByText("葫芦 29%")).toBeInTheDocument();
expect(screen.queryByText(/仍为三条/)).not.toBeInTheDocument();
expect(screen.getByText("对手范围（估计）")).toBeInTheDocument();
```

Also assert that the old generic headings are absent in live mode.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npx vitest run src/components/PreActionInsights.test.tsx`

Expected: FAIL because the component still maps all five generic sections.

- [ ] **Step 3: Implement the compact renderer**

Render the strategy status first, then current hand/detail, strict upgrades, dirty-out warning, and opponent list. Expand the primary aggressor; render other active opponents as one-line summaries with accessible expand buttons. Retain the old section renderer only when an older saved snapshot lacks `liveCoach`.

- [ ] **Step 4: Add responsive styling**

Use existing felt/gold tokens. Keep readable text, avoid fixed panel heights, and scroll the range list inside the analysis pane rather than covering action controls. Mobile uses the same information order.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/components/PreActionInsights.test.tsx src/mobile/MobileInsightSummary.test.tsx src/App.interaction.test.tsx`

Expected: PASS.

```bash
git add src/components/PreActionInsights.tsx src/components/PreActionInsights.test.tsx src/training.css src/mobile/mobile.css src/mobile/MobileInsightSummary.test.tsx
git commit -m "feat: simplify live coaching presentation"
```

---

### Task 4: Generate one continuous whole-hand narrative

**Files:**
- Modify: `src/review/types.ts`
- Modify: `src/review/deepReview.ts`
- Create: `src/review/wholeHandNarrative.ts`
- Create: `src/review/wholeHandNarrative.test.ts`
- Modify: `src/review/deepReview.test.ts`

**Interfaces:**
- Consumes: `DeepReviewInput.decisions`, calculated `DeepDecisionReviewV3[]`, independent opponent summaries, and cumulative visible logs.
- Produces: optional `DeepHandReviewV3.wholeHand: WholeHandNarrative` and optional serializable `DeepDecisionReviewV3.opponentRanges`.

- [ ] **Step 1: Add backward-compatible narrative types**

```ts
export type WholeHandNarrative = {
  conclusion: string;
  streets: Array<{ street: Street; title: string; text: string; verdict: "good" | "mixed" | "mistake" }>;
  turningPoint?: { decisionId: string; title: string; text: string };
  finalRanges: Array<{
    seat: number;
    playerId: string;
    buckets: OpponentRangeBuckets;
    confidence: number;
    evidence: string[];
  }>;
  bestChoice: {
    action: PolicyAction;
    requiredEquity: number;
    continueRangeEquity: number | null;
    reason: string;
    alternatives: string[];
  };
  nextRule: string;
};
```

Add `wholeHand?` to V3 review and `opponentRanges?` to V3 decisions so persisted old reviews still parse.

- [ ] **Step 2: Write the failing four-street test**

Build a deterministic BTN suited-connector fixture: flop combination draw, turn made straight and raise, river paired board facing a strong bet/raise line. Assert four ordered street paragraphs, concrete position/cards/sizes, cross-street river reasoning, one turning point, required equity, and no hidden opponent cards.

- [ ] **Step 3: Run the test and verify RED**

Run: `npx vitest run src/review/wholeHandNarrative.test.ts`

Expected: FAIL because the aggregate narrative does not exist.

- [ ] **Step 4: Implement street grouping**

Create:

```ts
export function buildWholeHandNarrative(
  input: DeepReviewInput,
  decisions: readonly DeepDecisionReviewV3[],
): WholeHandNarrative
```

Group hero decisions by street. Deduplicate cumulative log entries by `(street, actorSeat, kind, toAmount, potAfter)`. For each street calculate the hero best hand from saved visible cards, describe actual prices/actions, and assign verdict from normalized EV loss rather than showdown result.

- [ ] **Step 5: Preserve independent opponent range evidence**

In `deepReview.ts`, calculate `opponentRangeFacts` once, pass it to plain-language analysis, and save only serializable bucket/confidence/evidence summaries. Do not save weighted hidden combinations.

- [ ] **Step 6: Select turning point and best choice**

Select greatest normalized EV loss; if all losses are at most 3%, select the largest-pot decision. Compare its recommended action, required equity, continue-range equity and candidates. Explain inferior actions using candidate EV, missing fold equity, or lost calls from worse hands.

- [ ] **Step 7: Attach, verify and commit**

Run: `npx vitest run src/review/wholeHandNarrative.test.ts src/review/deepReview.test.ts src/review/stateHash.test.ts`

Expected: PASS, deterministic repeated output except `completedAt`, and no hidden opponent holes in JSON.

```bash
git add src/review/types.ts src/review/deepReview.ts src/review/deepReview.test.ts src/review/wholeHandNarrative.ts src/review/wholeHandNarrative.test.ts
git commit -m "feat: generate continuous whole-hand coaching"
```

---

### Task 5: Render the actionable whole-hand review

**Files:**
- Modify: `src/components/DeepHandReview.tsx`
- Modify: `src/components/DeepHandReview.test.tsx`
- Modify: `src/training.css`
- Modify: `src/mobile/mobile.css`
- Test: `src/App.deepReview.test.tsx`
- Test: `src/mobile/MobileApp.test.tsx`

**Interfaces:**
- Consumes: `DeepHandReviewV3.wholeHand` from Task 4 and existing technical decision facts.
- Produces: one editorial review; decision-level data lives only in collapsed professional details.

- [ ] **Step 1: Write the failing no-duplication component test**

Render a four-street fixture and assert each of these occurs exactly once: `整手结论`, `逐街点评`, `本手关键转折`, `对手最终范围`, `最佳选择`, `下次判断`. Assert four street entries and absence of the old `你现在处于什么局面` / `标准打法` template headings.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npx vitest run src/components/DeepHandReview.test.tsx`

Expected: FAIL because the component still maps every decision to repeated sections.

- [ ] **Step 3: Implement the new renderer**

When `review.version === 3 && review.wholeHand`, render the single narrative and one collapsed `查看各决策点专业计算` details block. Do not render `FiveSectionReview` for new reviews. Keep the old renderer only for V1/V2 and old V3 records without `wholeHand`.

- [ ] **Step 4: Render final ranges and best choice**

Each opponent row shows name, confidence, action evidence and bucket percentages. The best-choice card shows required equity, continue-range equity when available, the main reason, and why alternatives lose value.

- [ ] **Step 5: Style desktop/mobile reading order**

Use a single vertical editorial column. Mobile keeps the same order and full-width sections with 44 px expand controls. Technical facts stay collapsed.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run src/components/DeepHandReview.test.tsx src/App.deepReview.test.tsx src/mobile/MobileApp.test.tsx`

Expected: PASS for new reviews and existing V1/V2/old-V3 fixtures.

```bash
git add src/components/DeepHandReview.tsx src/components/DeepHandReview.test.tsx src/training.css src/mobile/mobile.css src/App.deepReview.test.tsx src/mobile/MobileApp.test.tsx
git commit -m "feat: render actionable whole-hand review"
```

---

### Task 6: End-to-end verification and delivery

**Files:**
- Modify only when verification exposes an in-scope defect, and add a regression test before that correction.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: verified desktop and mobile artifacts with V3 status, compact live coaching and one non-repetitive review.

- [ ] **Step 1: Run focused suites**

```bash
npx vitest run src/strategy/v3/preflopLookup.test.ts src/insights/plainLanguageAnalysis.test.ts src/insights/liveCoachSummary.test.ts src/components/PreActionInsights.test.tsx src/review/wholeHandNarrative.test.ts src/review/deepReview.test.ts src/components/DeepHandReview.test.tsx
```

Expected: all PASS.

- [ ] **Step 2: Run full gates**

```bash
npm test
npm run lint
npm run build
npm run verify:mobile-bundle
npm run verify:desktop-data
```

Expected: zero failures; only already documented stress/performance skips.

- [ ] **Step 3: Verify V3 and privacy in artifacts**

```bash
rg -n 'strategy-pack-v3|strategy-v3' dist/assets dist/mobile-app.js
rg -n 'Bella|哈队|倪少|零哥|Q大爷|董秘' dist src docs --glob '!docs/superpowers/**'
```

Expected: V3 markers exist; private names return no matches.

- [ ] **Step 4: Inspect the running product**

Verify an unopened BTN decision, a made-set flop, a multiway range panel and a completed four-street review. Confirm BTN is not called adverse, upgrades exclude the current category, opponents stay separate, V3/degradation is visible, and review sections occur once.

- [ ] **Step 5: Preserve unrelated changes**

Run `git diff --check` and `git status --short`. Do not stage the existing unrelated edits:

- `docs/superpowers/plans/2026-08-26-mobile-left-cards-large-actions.md`
- `docs/superpowers/specs/2026-08-26-mobile-left-cards-large-actions-design.md`

- [ ] **Step 6: Commit only a verified in-scope correction if needed**

If verification requires a correction, first add a failing test, then commit only exact in-scope files with `fix: close coaching review regressions`. If no correction is required, do not create an empty commit.
