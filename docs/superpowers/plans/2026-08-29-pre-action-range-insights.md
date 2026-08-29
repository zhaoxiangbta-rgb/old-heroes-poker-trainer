# Pre-Action Range Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fast, auditable pre-action hand-improvement, nuts-path, opponent-range, and opponent-response insights to desktop and mobile without changing the existing table or betting controls.

**Architecture:** Build two isolated calculation layers from immutable public decision snapshots: an exact runout enumerator for hand classes, nuts, and outs, plus a deterministic fixed-budget range-response simulator. Run both through a cancellable Worker protocol, render progressive results in new analysis-only components, and persist the facts captured at the moment of the hero action in the version 9 hand snapshot.

**Tech Stack:** TypeScript 5.8, React 19, Web Workers, Vitest, Testing Library, Playwright, Tauri 2, Rust, SQLite/IndexedDB.

## Global Constraints

- The local rules engine remains the only source of truth.
- Calculations may use only visible cards and public actions; unrevealed hole cards and undealt cards must never enter inputs or saved output.
- Desktop changes are restricted to the right resizable teaching panel. Do not modify `PokerTable`, `ActionControls`, the horizontal bet rail, their CSS, layout, animation, or event handling.
- Mobile table and betting controls remain unchanged. Add only a compact insight summary and a non-click-through half-screen detail sheet outside the existing controls.
- Desktop targets: exact quick facts within 150 ms and range response within 800 ms. iPhone 14 Pro Max targets: 300 ms and 1500 ms.
- Analysis failure, cancellation, or timeout must never block a legal game action.
- Exact and simulated results must be visibly labeled; low-confidence estimates cannot be worded as facts.
- Public builds use anonymous player names; private names remain in ignored local configuration only.
- Preserve unrelated dirty files:
  - `docs/superpowers/plans/2026-08-26-mobile-left-cards-large-actions.md`
  - `docs/superpowers/specs/2026-08-26-mobile-left-cards-large-actions-design.md`

---

## File Structure

- Create `src/insights/types.ts`: public snapshot, exact projection, range-response, progress, and persisted-record contracts.
- Create `src/insights/snapshot.ts`: build and hash immutable public-only decision inputs.
- Create `src/insights/runoutProjection.ts`: exact next-card and by-river mutually exclusive hand classes, nuts, near-nuts, and per-card cleanliness.
- Create `src/insights/opponentRanges.ts`: per-seat weighted range summaries derived from position and visible action history.
- Create `src/insights/actionResponse.ts`: deterministic response distributions for each legal hero candidate.
- Create `src/insights/pre-action.worker.ts`: cancellable staged calculation Worker.
- Create `src/insights/usePreActionInsights.ts`: React lifecycle wrapper with stale-result rejection.
- Create `src/components/PreActionInsights.tsx` and `src/pre-action-insights.css`: desktop right-panel summary/detail UI.
- Create `src/mobile/MobileInsightSummary.tsx` and extend `src/mobile/mobile.css`: compact summary and modal half-sheet only.
- Modify `src/App.tsx`: replace the old simple teaching facts with the new components; pass current completed insight into action capture.
- Modify `src/game/useGamePlayback.ts`: persist the insight record alongside the hero decision without changing control behavior.
- Modify `src/review/types.ts`, `src/game/game.ts`, `src/data/exportDocument.ts`, and `src-tauri/src/storage.rs`: version 9 optional insight persistence and migration.

---

### Task 1: Public Snapshot and Insight Contracts

**Files:**
- Create: `src/insights/types.ts`
- Create: `src/insights/snapshot.ts`
- Test: `src/insights/snapshot.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Card`, `Street`, `Legal`, `PublicAction`, `TableProfileId`, and player profile identifiers.
- Produces:

```ts
export type PublicInsightPlayer = {
  seat: number;
  playerId: string;
  position: Position;
  stack: number;
  streetBet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  profile: HandPlayerProfile;
};

export type PreActionInsightInput = {
  schemaVersion: 1;
  handNo: number;
  seed: number;
  street: Street;
  logIndex: number;
  heroSeat: number;
  heroHole: readonly [Card, Card];
  board: readonly Card[];
  pot: number;
  legal: Legal;
  tableProfileId: TableProfileId;
  players: readonly PublicInsightPlayer[];
  actions: readonly PublicAction[];
};

export type InsightTaskKey = {
  handNo: number;
  seed: number;
  street: Street;
  logIndex: number;
  stateHash: string;
};

export function buildPreActionInsightInput(game: GameState): PreActionInsightInput;
export function preActionInsightHash(input: PreActionInsightInput): string;
```

- [ ] **Step 1: Write public-only snapshot tests**

```ts
it("excludes every unrevealed opponent hole card", () => {
  const game = newGame(31);
  const hidden = game.players.filter((p) => p.seat !== game.heroSeat).flatMap((p) => p.hole);
  const input = buildPreActionInsightInput(game);
  expect(JSON.stringify(input)).not.toContain(hidden[0]);
  expect(input.heroHole).toEqual(game.players[game.heroSeat].hole);
});

it("hashes the same public state identically and changes after an action", () => {
  const game = newGame(32);
  const first = buildPreActionInsightInput(game);
  expect(preActionInsightHash(structuredClone(first))).toBe(preActionInsightHash(first));
  first.logIndex += 1;
  expect(preActionInsightHash(first)).not.toBe(preActionInsightHash(buildPreActionInsightInput(game)));
});
```

- [ ] **Step 2: Run the snapshot tests and verify red**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/insights/snapshot.test.ts`

Expected: FAIL because `src/insights/snapshot.ts` does not exist.

- [ ] **Step 3: Implement immutable public snapshot and stable hash**

Use explicit field projection rather than cloning `GameState`. Freeze nested arrays in development tests. Reuse the deterministic string hashing pattern from `src/review/stateHash.ts`, but include `street`, `logIndex`, `legal`, all public stacks/bets/statuses, and public action fields.

- [ ] **Step 4: Run snapshot tests and typecheck**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/insights/snapshot.test.ts && npx tsc --noEmit`

Expected: PASS with no private card in serialized inputs.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/insights/types.ts src/insights/snapshot.ts src/insights/snapshot.test.ts
git commit -m "feat: add public pre-action insight snapshots"
```

### Task 2: Exact Runout, Nuts, and Dirty-Out Projection

**Files:**
- Create: `src/insights/runoutProjection.ts`
- Test: `src/insights/runoutProjection.test.ts`
- Modify: `src/insights/types.ts`

**Interfaces:**
- Consumes: `PreActionInsightInput` and per-seat weighted opponent ranges supplied by Task 3.
- Produces:

```ts
export type HandClassProbability = {
  category: HandRank["category"];
  name: string;
  nextCard: number;
  byRiver: number;
};

export type OutAssessment = {
  card: Card;
  classification: "clean" | "dirty" | "neutral";
  equityDelta: number;
  riskReason?: "higher-flush" | "higher-straight" | "paired-board" | "full-house" | "players-behind";
};

export type ExactProjection = {
  precision: "exact";
  handClasses: HandClassProbability[];
  exclusiveNextTotal: number;
  exclusiveRiverTotal: number;
  absoluteNuts: number;
  tiedNuts: number;
  nearNuts: number;
  outs: OutAssessment[];
  elapsedMs: number;
};

export function calculateExactProjection(
  input: PreActionInsightInput,
  rangesBySeat: Readonly<Record<number, readonly WeightedCombo[]>>,
  shouldCancel?: () => boolean,
): ExactProjection;
```

- [ ] **Step 1: Write independent probability fixtures**

Create an independent brute-force helper inside the test file and assert:

```ts
it("counts overlapping straight-flush cards once in exclusive outcomes", () => {
  const result = calculateExactProjection(flopFixture(["Ah", "Jh"], ["Kh", "Qh", "4c"]), ranges, neverCancel);
  expect(result.exclusiveNextTotal).toBeCloseTo(1, 10);
  expect(result.exclusiveRiverTotal).toBeCloseTo(1, 10);
  expect(result.handClasses).toEqual(bruteForceFinalCategories(...));
});

it("separates exclusive, tied, and near nuts", () => {
  const result = calculateExactProjection(riverFixture(["As", "2d"], ["Ks", "Qs", "Js", "Ts", "9s"]), ranges);
  expect(result.absoluteNuts).toBe(0);
  expect(result.tiedNuts).toBe(1);
});

it("marks a paired-board flush out dirty against full-house ranges", () => {
  const result = calculateExactProjection(turnFixture(["Ah", "Jh"], ["Kh", "7h", "7c", "2s"]), fullHouseWeightedRanges);
  expect(result.outs.some((out) => out.riskReason === "full-house")).toBe(true);
});
```

Include fixtures for every hand category, a board-made hand, a higher flush, a higher straight, a full-house redraw, a multiway joint range, and cancellation.

- [ ] **Step 2: Run the projection tests and verify red**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/insights/runoutProjection.test.ts`

Expected: FAIL because `calculateExactProjection` is absent.

- [ ] **Step 3: Implement mutually exclusive runout enumeration**

Enumerate each legal next card once and each unordered turn-river combination once. For each final board, use `bestHand` and `compareHands`; compute absolute nuts against every legal unblocked opposing combo, tied nuts separately, and near nuts against the no-conflict joint weighted range with the confirmed 5% threshold. Never inspect `game.deck`.

- [ ] **Step 4: Implement per-card cleanliness**

For each next card, compare current equity to joint-range equity after the card. Classify a card dirty when the hand improves but the weighted joint range produces a stronger made hand or redraw often enough to make the equity delta non-positive or materially lower than the same nominal out class. Attach one deterministic risk reason.

- [ ] **Step 5: Run projection, evaluator, equity, and multiway tests**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/insights/runoutProjection.test.ts src/engine/evaluator.test.ts src/engine/equity.test.ts src/strategy/multiwayEquity.test.ts src/strategy/multiwayOuts.test.ts`

Expected: PASS; category totals and response probabilities stay within `1e-10` for exact fixtures.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/insights/types.ts src/insights/runoutProjection.ts src/insights/runoutProjection.test.ts
git commit -m "feat: enumerate exact hand and nuts paths"
```

### Task 3: Per-Opponent Ranges and Legal Action Responses

**Files:**
- Create: `src/insights/opponentRanges.ts`
- Create: `src/insights/actionResponse.ts`
- Test: `src/insights/opponentRanges.test.ts`
- Test: `src/insights/actionResponse.test.ts`
- Modify: `src/insights/types.ts`

**Interfaces:**
- Consumes: `PreActionInsightInput`, `buildRangeLedger`, table profile, player profile, strategy engine, and rule-engine legal bounds.
- Produces:

```ts
export type OpponentRangeSummary = {
  seat: number;
  playerId: string;
  comboCount: number;
  buckets: { strongValue: number; madeHand: number; strongDraw: number; weakDraw: number; air: number };
  changes: string[];
  confidence: number;
  ranges: readonly WeightedCombo[];
};

export type OpponentActionResponse = {
  seat: number;
  heroAction: PolicyAction;
  fold: number;
  call: number;
  raise: number;
  continuingRange: Omit<OpponentRangeSummary, "ranges">;
};

export function inferOpponentRanges(input: PreActionInsightInput): OpponentRangeSummary[];
export function calculateActionResponses(
  input: PreActionInsightInput,
  ranges: readonly OpponentRangeSummary[],
  config: { seed: number; sampleBudget: number; deadlineMs: number },
): { precision: "sampled"; responses: OpponentActionResponse[]; samples: number; confidence: number };
```

- [ ] **Step 1: Write range-update direction tests**

```ts
it("narrows a river pot-sized raise toward value for a low-bluff profile", () => {
  const before = inferOpponentRanges(beforeRiverRaiseFixture());
  const after = inferOpponentRanges(afterRiverRaiseFixture({ potFraction: 1 }));
  expect(after[0].buckets.strongValue).toBeGreaterThan(before[0].buckets.strongValue);
  expect(after[0].buckets.air).toBeLessThan(before[0].buckets.air);
});

it("keeps late-position checked-to ranges wider than early-position bet ranges", () => {
  expect(inferOpponentRanges(checkedToButtonFixture())[0].comboCount)
    .toBeGreaterThan(inferOpponentRanges(utgBetFixture())[0].comboCount);
});
```

- [ ] **Step 2: Write action-response invariants**

```ts
it.each(["half-pot", "two-thirds-pot", "pot", "all-in"])("returns legal normalized %s responses", (size) => {
  const result = calculateActionResponses(responseFixture(size), ranges, config);
  for (const response of result.responses) {
    expect(response.fold + response.call + response.raise).toBeCloseTo(1, 10);
  }
});

it("assigns zero raise frequency when action is not reopened", () => {
  const result = calculateActionResponses(shortAllInNoReopenFixture(), ranges, config);
  expect(result.responses.every((response) => response.raise === 0)).toBe(true);
});

it("replays exactly from the same public seed and budget", () => {
  expect(calculateActionResponses(input, ranges, config)).toEqual(calculateActionResponses(input, ranges, config));
});
```

- [ ] **Step 3: Run Task 3 tests and verify red**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/insights/opponentRanges.test.ts src/insights/actionResponse.test.ts`

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Implement range summaries from the existing ledger**

Build a `PublicDecisionState` without hidden cards, call `buildRangeLedger`, then apply table-profile and player-profile deviations as bounded multipliers. Normalize each seat independently, remove blockers, and bucket combos using current board hand class plus draw quality.

- [ ] **Step 5: Implement deterministic legal response simulation**

Generate hero candidates only from `input.legal`: fold/check/call and deduplicated half-pot, two-thirds-pot, pot, and all-in targets clamped to `minRaiseTo` and `maxRaiseTo`. For each candidate, run fixed-seed weighted range samples through the local strategy resolver, count fold/call/raise, normalize, and summarize only the continuing combos.

- [ ] **Step 6: Run strategy regression and Task 3 tests**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/insights/opponentRanges.test.ts src/insights/actionResponse.test.ts src/strategy/engine.test.ts src/strategy/behaviorRegression.test.ts src/policy/tableProfiles.test.ts src/policy/playerProfiles.test.ts`

Expected: PASS with deterministic replay and normalized responses.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/insights/types.ts src/insights/opponentRanges.ts src/insights/opponentRanges.test.ts src/insights/actionResponse.ts src/insights/actionResponse.test.ts
git commit -m "feat: estimate opponent ranges and responses"
```

### Task 4: Cancellable Worker and Progressive React Lifecycle

**Files:**
- Create: `src/insights/pre-action.worker.ts`
- Create: `src/insights/usePreActionInsights.ts`
- Test: `src/insights/usePreActionInsights.test.tsx`
- Modify: `vite.mobile.config.ts`

**Interfaces:**
- Consumes: Task 1 snapshots, Task 2 exact projection, and Task 3 range/response calculation.
- Produces:

```ts
export type PreActionInsightState = {
  key?: InsightTaskKey;
  status: "idle" | "calculating-exact" | "calculating-ranges" | "ready" | "partial" | "failed";
  exact?: ExactProjection;
  ranges?: OpponentRangeSummary[];
  responses?: OpponentActionResponse[];
  confidence?: number;
  error?: string;
};

export function usePreActionInsights(game: GameState, enabled: boolean): {
  state: PreActionInsightState;
  cancel(): void;
};
```

- [ ] **Step 1: Write lifecycle tests with a fake Worker**

Test exact-first delivery, range-second delivery, stale hash rejection after street/log change, explicit cancellation, worker exception, and timeout-to-partial behavior. Assert the hook clears the old key immediately when a new decision arrives.

- [ ] **Step 2: Run lifecycle tests and verify red**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/insights/usePreActionInsights.test.tsx`

Expected: FAIL because the hook and Worker protocol are absent.

- [ ] **Step 3: Implement staged Worker messages**

Use messages `start`, `cancel`, `exact-completed`, `ranges-completed`, `partial`, and `failed`. Include `requestId` and the full `InsightTaskKey` on every response. Check cancellation between batches and before posting each stage.

- [ ] **Step 4: Implement hook stale-result guards and deadlines**

Clear state synchronously on key change, preserve exact results if range work exceeds its deadline, terminate on unmount, and never expose the Worker object to UI components. Confirm the mobile Vite build emits the Worker asset.

- [ ] **Step 5: Run lifecycle and mobile build compatibility tests**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/insights/usePreActionInsights.test.tsx src/config/mobileBuildCompatibility.test.ts && PLAYER_NAMES_MODE=public npm run build`

Expected: PASS and both desktop/mobile manifests contain `pre-action.worker` chunks.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/insights/pre-action.worker.ts src/insights/usePreActionInsights.ts src/insights/usePreActionInsights.test.tsx vite.mobile.config.ts
git commit -m "feat: calculate pre-action insights off thread"
```

### Task 5: Desktop Right-Panel Insights Without Table Changes

**Files:**
- Create: `src/components/PreActionInsights.tsx`
- Create: `src/components/PreActionInsights.test.tsx`
- Create: `src/pre-action-insights.css`
- Modify: `src/App.tsx`
- Test: `src/App.interaction.test.tsx`
- Test: `src/ui/desktopStage.test.ts`

**Interfaces:**
- Consumes: `PreActionInsightState` from Task 4.
- Produces:

```ts
export function PreActionInsights({ state, game }: {
  state: PreActionInsightState;
  game: GameState;
}): JSX.Element;
```

- [ ] **Step 1: Record locked-area regression evidence**

Capture the existing desktop table/action DOM signatures in `desktopStage.test.ts`: component imports, class names, action-dock child order, and `ActionControls` props. Add assertions that the new insight component is not rendered inside `.desktop-game-stage` or `.action-area`.

- [ ] **Step 2: Write component state tests**

Assert preflop copy omits nuts, postflop exact cards show next/by-river/nuts/dirty outs, range loading does not hide exact facts, detail expansion lists every active opponent, low confidence is labeled, and failures say `范围估计暂不可用`.

- [ ] **Step 3: Run desktop UI tests and verify red**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/components/PreActionInsights.test.tsx src/App.interaction.test.tsx src/ui/desktopStage.test.ts`

Expected: FAIL because the component is absent.

- [ ] **Step 4: Implement desktop summary and detail disclosure**

Replace only the old `赔率 / 补牌 / 风险` content inside `Teaching` with `PreActionInsights`. Keep the existing situation and EV sections until the new facts are ready. Render three-to-five summary cards, the most relevant opponent, a disclosure button, then per-seat buckets and response table.

- [ ] **Step 5: Add scoped analysis CSS**

Prefix every selector with `.pre-action-insights` or `.teaching-panel`. Do not edit `src/actions.css`, `src/card-action-layout.css`, `src/gameplay.css`, or any `.desktop-action-*`/`.table-*` selector.

- [ ] **Step 6: Run desktop UI and interaction regression tests**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/components/PreActionInsights.test.tsx src/App.interaction.test.tsx src/components/ActionControls.test.tsx src/components/PlayerSeat.test.tsx src/components/PotChipStack.test.tsx src/components/TableActionEffects.test.tsx src/ui/desktopStage.test.ts`

Expected: PASS with unchanged control behavior.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/components/PreActionInsights.tsx src/components/PreActionInsights.test.tsx src/pre-action-insights.css src/App.tsx src/App.interaction.test.tsx src/ui/desktopStage.test.ts
git commit -m "feat: show pre-action insights in teaching panel"
```

### Task 6: Mobile Summary and Non-Blocking Detail Sheet

**Files:**
- Create: `src/mobile/MobileInsightSummary.tsx`
- Create: `src/mobile/MobileInsightSummary.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/mobile/mobile.css`
- Test: `src/mobile/MobileApp.test.tsx`
- Test: `tests/mobile-visual.spec.ts`

**Interfaces:**
- Consumes: the same `PreActionInsightState`; does not receive or mutate action handlers.
- Produces:

```ts
export function MobileInsightSummary({ state, game }: {
  state: PreActionInsightState;
  game: GameState;
}): JSX.Element | null;
```

- [ ] **Step 1: Write mobile interaction boundary tests**

Assert the summary is outside `.mobile-action-dock`, opening the sheet does not change any action button disabled state, pointer events cannot reach the table through the sheet, Escape/backdrop/down-swipe closes it, and safe-area padding is present.

- [ ] **Step 2: Run mobile tests and verify red**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/mobile/MobileInsightSummary.test.tsx src/mobile/MobileApp.test.tsx src/mobile/MobileFloatingControls.test.tsx`

Expected: FAIL because `MobileInsightSummary` is absent.

- [ ] **Step 3: Implement compact summary and modal sheet**

Mount the summary between the mobile table and existing action dock without moving either element. Use a React portal for the detail sheet, `role="dialog"`, focus trapping, backdrop close, and `padding-bottom: env(safe-area-inset-bottom)`. The sheet receives facts only; it cannot call `onAction`.

- [ ] **Step 4: Add mobile-only styles**

Use `.mobile-insight-summary` and `.mobile-insight-sheet` selectors only. Do not edit `.mobile-floating-controls`, `.mobile-action-dock`, `.mobile-size-zone`, `.mobile-hand-zone`, `.mobile-action-zone`, or the horizontal rail selectors.

- [ ] **Step 5: Run mobile unit and iPhone 14 Pro Max visual tests**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/mobile/MobileInsightSummary.test.tsx src/mobile/MobileApp.test.tsx src/mobile/MobileFloatingControls.test.tsx src/mobile/MobilePokerTable.test.tsx && PLAYER_NAMES_MODE=public npm run test:mobile-visual`

Expected: PASS in portrait and landscape; screenshots show no overlap with cards or controls.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/mobile/MobileInsightSummary.tsx src/mobile/MobileInsightSummary.test.tsx src/mobile/mobile.css src/App.tsx src/mobile/MobileApp.test.tsx tests/mobile-visual.spec.ts
git commit -m "feat: add mobile pre-action insight sheet"
```

### Task 7: Persist Version 9 Insight Records at Hero Action Time

**Files:**
- Modify: `src/review/types.ts`
- Modify: `src/game/game.ts`
- Modify: `src/game/useGamePlayback.ts`
- Modify: `src/game/useGamePlayback.test.tsx`
- Modify: `src/data/exportDocument.ts`
- Modify: `src/data/exportDocument.test.ts`
- Modify: `src/data/indexedDbRepository.test.ts`
- Modify: `src-tauri/src/storage.rs`
- Modify: `scripts/verify-desktop-data.mjs`

**Interfaces:**
- Consumes: completed or partial `PreActionInsightState` when the hero submits.
- Produces:

```ts
export type PersistedPreActionInsight = {
  schemaVersion: 1;
  key: InsightTaskKey;
  calculatorVersion: string;
  rangeModelVersion: string;
  sampleSeed: number;
  sampleBudget: number;
  exact?: ExactProjection;
  rangeSummaries?: Array<Omit<OpponentRangeSummary, "ranges">>;
  responses?: OpponentActionResponse[];
  confidence?: number;
};

export type DeepDecisionInput = {
  // existing fields unchanged
  preActionInsight?: PersistedPreActionInsight;
};
```

- [ ] **Step 1: Write persistence and secrecy tests**

Assert submitting an action captures the insight matching the same hash; export/import round-trips it; old version 8 hands normalize to version 9 with no fabricated insight; and JSON contains neither unrevealed holes nor secrets.

- [ ] **Step 2: Run persistence tests and verify red**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/game/useGamePlayback.test.tsx src/data/exportDocument.test.ts src/data/indexedDbRepository.test.ts`

Expected: FAIL because version 9 and the optional record do not exist.

- [ ] **Step 3: Capture the current insight with the hero decision**

Extend `useGamePlayback.submit(action, preActionInsight?)` and attach a structured clone only when its key matches the current public snapshot. Do not delay action submission if no insight is ready.

- [ ] **Step 4: Migrate TypeScript snapshot/export contract to version 9**

Update `GameState.version`, constructors, `normalizeGameState`, export document version, test fixtures, and verification script. Version 8 imports become version 9 with `preActionInsight` absent.

- [ ] **Step 5: Normalize version 9 in Rust storage without a secret-bearing column**

Keep the insight nested in the existing serialized hand state. Update Rust validators and fixtures to accept version 9, preserve optional insight records atomically, and reject records whose task key does not match the decision street/log index. No SQLite column or Keychain behavior changes are required.

- [ ] **Step 6: Run TypeScript and Rust persistence suites**

Run: `PLAYER_NAMES_MODE=public npx vitest run src/game/useGamePlayback.test.tsx src/data/exportDocument.test.ts src/data/indexedDbRepository.test.ts src/data/repository.test.ts && PATH="$PWD/.cargo-local/bin:$PATH" CARGO_HOME="$PWD/.cargo-local" RUSTUP_HOME="$PWD/.rustup-local" cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS, including v8-to-v9 normalization and secret-free export.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/review/types.ts src/game/game.ts src/game/useGamePlayback.ts src/game/useGamePlayback.test.tsx src/data/exportDocument.ts src/data/exportDocument.test.ts src/data/indexedDbRepository.test.ts src-tauri/src/storage.rs scripts/verify-desktop-data.mjs
git commit -m "feat: persist pre-action insight records"
```

### Task 8: Performance Gates, Full Verification, and Deliverables

**Release version:** `1.5.0`

**Files:**
- Create: `src/insights/performance.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: v1.5.0 macOS DMG, mobile PWA bundle, updated checksums, and verified public source state.

- [ ] **Step 1: Add deterministic performance fixtures**

Benchmark heads-up flop, six-player flop, heads-up turn, and river response cases. Record exact and sampled durations separately. Tests fail only when a deterministic fixture exceeds the applicable desktop hard ceiling twice consecutively; a separate browser measurement records iPhone-emulated timing.

- [ ] **Step 2: Run focused correctness and performance gates**

Run:

```bash
PLAYER_NAMES_MODE=public npx vitest run src/insights src/engine src/strategy
PLAYER_NAMES_MODE=public npx vitest run src/insights/performance.test.ts
```

Expected: PASS; no exact fixture exceeds 150 ms desktop and no range fixture exceeds 800 ms desktop. If hardware variance causes a miss, optimize or lower fixed simulation budget while preserving deterministic precision labels; do not weaken the asserted contract silently.

- [ ] **Step 3: Run full public verification**

Run:

```bash
PLAYER_NAMES_MODE=public npm test
npm run lint
PLAYER_NAMES_MODE=public npm run build
npm run verify:mobile-bundle
npm run verify:desktop-data
PLAYER_NAMES_MODE=public npm run test:pwa
PATH="$PWD/.cargo-local/bin:$PATH" CARGO_HOME="$PWD/.cargo-local" RUSTUP_HOME="$PWD/.rustup-local" cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all commands exit 0. If WebKit aborts inside the sandbox, rerun the identical PWA command with approved escalation and record both outcomes.

- [ ] **Step 4: Run real-browser desktop and mobile scenarios**

Desktop: play through preflop, flop, turn, and river decisions; verify progressive exact/range updates, expansion, stale cancellation, and unchanged action controls. Mobile: use iPhone 14 Pro Max portrait and landscape; verify summary/sheet, no overlap, no click-through, offline reload, and action responsiveness.

- [ ] **Step 5: Bump patch version and build local private macOS package**

Update package/Tauri/Cargo versions consistently from 1.4.12 to 1.5.0, then run:

```bash
PATH="$PWD/.cargo-local/bin:$PATH" CARGO_HOME="$PWD/.cargo-local" RUSTUP_HOME="$PWD/.rustup-local" npm run tauri:private
codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/老英雄牌局.app
```

Copy the DMG to `release/local-private/macos/` with the version in its filename and calculate SHA-256.

- [ ] **Step 6: Build anonymous public mobile artifact and restore private local names**

Run the public build, package `dist/mobile/` into the versioned PWA ZIP, verify it contains no private identities or secrets, then restore:

```bash
PLAYER_NAMES_MODE=private npm run prepare:names
```

- [ ] **Step 7: Confirm dirty-worktree isolation and commit delivery metadata**

Run `git status --short`; confirm the two pre-existing documentation files remain untouched and uncommitted. Stage only Task 8 files and commit:

```bash
git commit -m "release: ship pre-action range insights"
```

Record exact artifact paths, sizes, SHA-256 values, test counts, browser timings, and any skipped stress gates in the final handoff.
