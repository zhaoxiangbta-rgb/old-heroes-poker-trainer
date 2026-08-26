# Mobile Horizontal Snap Bet Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将移动端纵向下注推杆替换为五节点吸附横杆，并将底部操作区重排为左侧筹码信息、中间手牌、右侧行动的紧凑三栏布局。

**Architecture:** 新建纯函数模块负责从合法下注金额生成 `最低 / ½ / ⅔ / 1× / ALL IN` 节点和吸附结果，横向滑杆组件只处理索引选择与无障碍语义。`MobileFloatingControls` 保留现有规则引擎数据和防重复提交逻辑，仅重组显示结构；CSS 将操作区高度从 202px 降至 150px 以内。

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Playwright, Vite PWA.

## Global Constraints

- 不修改规则引擎、下注合法性、下注尺寸算法和提交锁定逻辑。
- 横杆节点固定为 `最低`、`½`、`⅔`、`1×`、`ALL IN`，重复金额必须合并。
- 节点之间仍可选择任意 `mobileBetChoices(game)` 返回的合法金额。
- 松手时仅在最近节点的吸附阈值内吸附；吸附只改变选择值，不直接提交。
- 操作区在 430×932 和 430×760 下高度不得超过 150px。
- 所有交互触摸区不小于 44×44px；手牌点数、花色和牌宽不得缩小。
- 保持 PWA 完全离线，不引入新依赖或远程资源。

---

## File Structure

- Create `src/mobile/mobileBetRail.ts`: node generation, nearest legal amount and snap calculation.
- Create `src/mobile/mobileBetRail.test.ts`: pure mapping, deduplication and snap-threshold tests.
- Create `src/mobile/HorizontalBetSlider.tsx`: horizontal range, node markers and selected amount.
- Create `src/mobile/HorizontalBetSlider.test.tsx`: component semantics and interaction tests.
- Delete `src/mobile/VerticalBetSlider.tsx` and `src/mobile/VerticalBetSlider.test.tsx` after replacement.
- Modify `src/mobile/MobileFloatingControls.tsx`: three-column dock and horizontal rail wiring.
- Modify `src/mobile/MobileFloatingControls.test.tsx`: layout, action and anti-double-submit assertions.
- Modify `src/mobile/mobile.css`: compact horizontal dock, snap rail, chip stack and responsive rules.
- Modify `tests/mobile-visual.spec.ts`: dock height, horizontal geometry and non-overlap assertions.
- Modify version files only after all tests pass.

### Task 1: Five-Node Bet Rail Model

**Files:**
- Create: `src/mobile/mobileBetRail.ts`
- Create: `src/mobile/mobileBetRail.test.ts`

**Interfaces:**
- Consumes: `GameState`, `mobileBetChoices(game)`, `mobileBetPresetTarget(game, preset)`.
- Produces: `type BetRailNode = { id: "min" | "half" | "two-thirds" | "pot" | "all-in"; label: string; amount: number; index: number }`.
- Produces: `mobileBetRailNodes(game: GameState, choices: number[]): BetRailNode[]`.
- Produces: `snapBetRailIndex(index: number, nodes: BetRailNode[], threshold?: number): number`.

- [ ] **Step 1: Write failing node-generation tests**

```ts
const game = facingBetGame();
const choices = mobileBetChoices(game);
const nodes = mobileBetRailNodes(game, choices);
expect(nodes.map((node) => node.label)).toEqual(["最低", "½", "⅔", "1×", "ALL IN"]);
expect(nodes[0].index).toBe(0);
expect(nodes.at(-1)?.index).toBe(choices.length - 1);
expect(nodes.every((node) => choices[node.index] === node.amount)).toBe(true);
```

Add a short-stack case where half-pot and minimum resolve to the same legal amount and assert the returned amounts are unique and indexes remain ascending.

- [ ] **Step 2: Run the model test and verify RED**

Run: `npm test -- --run src/mobile/mobileBetRail.test.ts`

Expected: FAIL because `mobileBetRail.ts` does not exist.

- [ ] **Step 3: Implement node generation**

Create candidate targets from `choices[0]`, the three `mobileBetPresetTarget` calls, and `choices.at(-1)`. Map each target to the closest legal choice index, preserve candidate order, and remove duplicate indexes. Always use labels from the candidate that survives.

- [ ] **Step 4: Write failing snap tests**

```ts
expect(snapBetRailIndex(20, [{ id:"half", label:"½", amount:20, index:18 }], 2)).toBe(18);
expect(snapBetRailIndex(21, [{ id:"half", label:"½", amount:20, index:18 }], 2)).toBe(21);
```

Also assert ties choose the lower node and out-of-range input is clamped to the valid choice span supplied through node indexes.

- [ ] **Step 5: Implement snapping and verify GREEN**

Use absolute index distance; snap only when `distance <= threshold`, defaulting to `2`. Return the original index when no node is close.

Run: `npm test -- --run src/mobile/mobileBetRail.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/mobile/mobileBetRail.ts src/mobile/mobileBetRail.test.ts
git commit -m "添加横向下注节点与吸附模型"
```

### Task 2: Horizontal Slider Component

**Files:**
- Create: `src/mobile/HorizontalBetSlider.tsx`
- Create: `src/mobile/HorizontalBetSlider.test.tsx`
- Delete: `src/mobile/VerticalBetSlider.tsx`
- Delete: `src/mobile/VerticalBetSlider.test.tsx`

**Interfaces:**
- Consumes: `choices: number[]`, `value: number`, `nodes: BetRailNode[]`, `disabled: boolean`, `onChange(value: number): void`.
- Produces: a horizontal native range with `aria-label="本街投入到"`, `aria-orientation="horizontal"` and `data-snapped-node`.

- [ ] **Step 1: Write failing horizontal semantics test**

```tsx
render(<HorizontalBetSlider choices={[4,5,6,7,8]} value={6} nodes={nodes} disabled={false} onChange={onChange} />);
const slider = screen.getByRole("slider", { name: "本街投入到" });
expect(slider).toHaveAttribute("aria-orientation", "horizontal");
expect(slider).toHaveAttribute("aria-valuetext", "6");
expect(screen.getAllByTestId("bet-rail-node")).toHaveLength(nodes.length);
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- --run src/mobile/HorizontalBetSlider.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the horizontal component**

Render `.mobile-horizontal-bet-rail`, a floating `.mobile-rail-amount`, one horizontal `<input type="range">`, and positioned node markers whose `left` is `node.index / (choices.length - 1) * 100%`. On `change`, call `onChange(choices[index])`; on pointer/key release, call `snapBetRailIndex`, then emit the snapped legal value if it differs.

- [ ] **Step 4: Add interaction and accessibility assertions**

Assert change emits an arbitrary legal intermediate amount, pointer release near a node emits its node amount, maximum value marks `data-all-in="true"`, disabled locks the input, and node labels are available to assistive technology.

- [ ] **Step 5: Verify GREEN and remove the vertical component**

Run: `npm test -- --run src/mobile/HorizontalBetSlider.test.tsx`

Then delete the two `VerticalBetSlider` files and run `rg "VerticalBetSlider|vertical" src/mobile` to ensure no production import remains.

- [ ] **Step 6: Commit**

```bash
git add src/mobile/HorizontalBetSlider.tsx src/mobile/HorizontalBetSlider.test.tsx src/mobile/VerticalBetSlider.tsx src/mobile/VerticalBetSlider.test.tsx
git commit -m "使用五节点横向下注推杆"
```

### Task 3: Compact Three-Column Action Dock

**Files:**
- Modify: `src/mobile/MobileFloatingControls.tsx`
- Modify: `src/mobile/MobileFloatingControls.test.tsx`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Consumes: `mobileBetRailNodes`, `HorizontalBetSlider`, existing `mobilePrimaryAction` and `send()`.
- Produces: `.mobile-rail-row`, `.mobile-player-bankroll`, `.mobile-centered-hole`, `.mobile-right-actions`.

- [ ] **Step 1: Write failing layout tests**

Assert the dock contains one horizontal rail, no `.mobile-floating-presets`, a non-button bankroll region with `余码` and Chinese position, two centered cards, and the existing legal action buttons inside `.mobile-right-actions`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/mobile/MobileFloatingControls.test.tsx`

Expected: FAIL because the current DOM still has a vertical rail and separate presets.

- [ ] **Step 3: Recompose `MobileFloatingControls`**

Compute `nodes = useMemo(() => mobileBetRailNodes(game, choices), [game, choices])`. Render the slider first, then a three-column row: left informational chip stack and bankroll, center hole cards, right legal action buttons. Remove `choosePreset`, the `presets` constant and `.mobile-floating-presets`. Preserve `send`, `submitted`, `locked`, error handling and primary-action calculation unchanged.

- [ ] **Step 4: Implement compact CSS**

Set portrait dock height to `146px`; reserve `50px` for the rail and `88px` for the three-column row. Use columns `minmax(86px,1fr) auto minmax(96px,1fr)`. Create the chip stack from three small elements reusing local chip textures, keep cards at 54×76, and preserve 44px action targets. For compact portrait use 142px; for landscape retain a right-side dock but place the horizontal rail across its top.

- [ ] **Step 5: Verify component behavior**

Run: `npm test -- --run src/mobile/MobileFloatingControls.test.tsx src/mobile/HorizontalBetSlider.test.tsx src/mobile/mobileBetRail.test.ts`

Expected: all pass, including the existing anti-double-submit and primary-action transition tests.

- [ ] **Step 6: Commit**

```bash
git add src/mobile/MobileFloatingControls.tsx src/mobile/MobileFloatingControls.test.tsx src/mobile/mobile.css
git commit -m "压缩移动端三栏操作区"
```

### Task 4: Visual Regression, Offline Verification and Release

**Files:**
- Modify: `tests/mobile-visual.spec.ts`
- Modify: `design-qa.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`

**Interfaces:**
- Verifies the completed horizontal control and produces the next patch release.

- [ ] **Step 1: Add failing geometry assertions**

Measure `.mobile-casino-dock`, `.mobile-horizontal-bet-rail`, `.mobile-bet-slider`, `.mobile-centered-hole`, `.mobile-player-bankroll` and `.mobile-right-actions`. Assert portrait dock height `<= 150`, rail width `> rail height * 4`, bankroll/cards/actions do not overlap, cards stay at least 52px wide, all visible action controls are at least 44×44, and the dock does not overlap the table.

- [ ] **Step 2: Run visual tests and verify RED before final CSS**

Run: `npx playwright test tests/mobile-visual.spec.ts`

Expected: at least the old 202px dock-height or vertical-geometry assertion fails before final responsive overrides are complete.

- [ ] **Step 3: Fix responsive geometry and verify GREEN**

Run: `npx playwright test tests/mobile-visual.spec.ts`

Expected: 430×932, 430×760 and 932×430 all pass and screenshots are saved under `test-results/`.

- [ ] **Step 4: Perform design QA**

Compare the confirmed Image 2 mockup with the 430×932 screenshot. Update `design-qa.md` for horizontal rail hierarchy, node readability, three-column balance, card prominence and overlap. Fix every P0–P2 issue and leave `final result: passed`.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test -- --run
npm run lint
npm run build
npm run verify:mobile-bundle
npm run test:pwa
npm run test:mobile-visual
git diff --check
```

Expected: 50+ test files and 278+ tests pass, both PWA tests pass, all three visual tests pass, and the mobile bundle remains fully offline.

- [ ] **Step 6: Bump and align the patch version**

Run `npm version patch --no-git-tag-version`, then update the same version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the `poker-decision-trainer` package entry in `src-tauri/Cargo.lock`. Rebuild and verify all five version locations match.

- [ ] **Step 7: Commit and publish**

```bash
git add tests/mobile-visual.spec.ts design-qa.md package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "发布移动端横向吸附推杆"
```

Split `poker-decision-trainer` as a subtree, preserve `public/main` linear history with `git commit-tree`, push to `public/main`, and verify `git ls-remote public refs/heads/main` equals the new release commit.
