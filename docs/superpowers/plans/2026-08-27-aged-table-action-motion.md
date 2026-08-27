# Aged Table Action Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 Image2 第 2 套做旧黑皮革/黄铜设计重做电脑端牌桌与尺度键，并在不改变规则引擎结果的前提下加入 0.6–0.9 秒的玩家轮流行动。

**Architecture:** 继续使用 `playback.ts` 生成的确定性播放帧作为动画事实源，不让 React/CSS 反向修改 `GameState`。`useGamePlayback` 保留短期视觉令牌，`PokerTable` 将令牌映射为飞行筹码、弃牌收牌和座位状态。所有主动画仅驱动 `transform`/`opacity`，并对 `prefers-reduced-motion` 降级。

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, CSS keyframes, Playwright, Vite/Tauri, existing offline Web Audio sound player.

## Global Constraints

- 规则引擎和 `GameState` 是唯一筹码事实源；动画层不计算、分配或修改筹码。
- 每位对手完整行动约 0.6–0.9 秒，连续行动间隔 80–120ms，英雄提交后 100ms 内显示锁定反馈。
- 底池筹码整体放大约 40%，底池数字只显示一处。
- 台布与操作台遵循做旧黑皮革、钝化黄铜和压痕缝线方向；公共牌区不得因纹理降低可读性。
- 不以整张效果图作为交互背景；按钮、横杆和牌均保持真实 DOM 可交互。
- 保留当前桌布主题颜色设置、非等比横杆和所有移动端现有功能。

---

### Task 1: Fast-realistic playback timing

**Files:**
- Modify: `src/game/playback.ts`
- Modify: `src/game/playback.test.ts`
- Modify: `src/game/useGamePlayback.test.tsx`

**Interfaces:**
- Consumes: `durationFor(seed, actionId, phase, reducedMotion)` and `thinkingDuration(seed, frameId, kind, reducedMotion)`.
- Produces: deterministic per-action playback whose thinking + action frame is 600–900ms and whose visual token may overlap the next thinking frame without changing `GameState` order.

- [ ] **Step 1: Write failing timing tests**

Add table-driven assertions that normal bot thinking is 180–280ms, chip/fold action is 320–420ms, settle handoff is 80–120ms, and reduced motion frames are 100–160ms. Add a hook test proving `busy` locks synchronously while assessment and frame planning continue on the next task.

- [ ] **Step 2: Run the playback tests and confirm RED**

Run: `npm test -- --run src/game/playback.test.ts src/game/useGamePlayback.test.tsx`

Expected: current 45–110ms thinking and 70–100ms action durations fail the new ranges.

- [ ] **Step 3: Implement deterministic duration bands**

Use seeded `mixed(...)` values to return bounded durations. Keep `submitting` at 20ms, set `bot-thinking` to 180–280ms, `animating-chips` to 320–420ms, `settling-pot` to 90ms, and reduced motion action frames to 120ms. Set chip overlap so the next thinking pulse may begin during the final 80–120ms of chip settling.

- [ ] **Step 4: Run the playback tests and confirm GREEN**

Run: `npm test -- --run src/game/playback.test.ts src/game/useGamePlayback.test.tsx`

- [ ] **Step 5: Commit timing changes**

```bash
git add src/game/playback.ts src/game/playback.test.ts src/game/useGamePlayback.test.tsx
git commit -m "feat: add brisk sequential action timing"
```

### Task 2: Transient chip-flight and fold-flight layers

**Files:**
- Create: `src/components/TableActionEffects.tsx`
- Create: `src/components/TableActionEffects.test.tsx`
- Modify: `src/components/PokerTable.tsx`
- Modify: `src/game/useGamePlayback.ts`
- Modify: `src/game/useGamePlayback.test.tsx`
- Modify: `src/gameplay.css`

**Interfaces:**
- Consumes: `VisualToken { id, effect, actorSeat, action, expiresAt }[]` and seat index 0–5.
- Produces: `<TableActionEffects tokens={visualTokens} />` with `.flying-wager.from-seat-N`, `.fold-flight.from-seat-N`, and one `aria-hidden` transient layer per live effect.

- [ ] **Step 1: Write failing component and lifecycle tests**

Assert a chip token renders a chip group with `from-seat-2`, a fold token renders two overlapping card backs with `from-seat-4`, check/thinking tokens render no flight object, and expired tokens are removed. Assert the action amount is exposed through `data-action-amount` for deterministic visual tiers.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- --run src/components/TableActionEffects.test.tsx src/game/useGamePlayback.test.tsx`

- [ ] **Step 3: Implement `TableActionEffects` and token metadata**

Render existing `wagerChipFor(...)` and card-back assets. Use seat-specific CSS custom properties for origin, a shared destination near `.pot-chip-stack`, and `cubic-bezier(.2,.78,.2,1)` motion. Fold cards first converge with `translateX`, then travel inward and fade. Do not add event callbacks that mutate the game.

- [ ] **Step 4: Add transform-only CSS and reduced-motion fallback**

Animate `transform`, `opacity`, and a pseudo-element shadow. Add 100–160ms reduced-motion fades and remove rotation/bounce under `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Run focused tests and commit**

```bash
npm test -- --run src/components/TableActionEffects.test.tsx src/game/useGamePlayback.test.tsx
git add src/components/TableActionEffects.tsx src/components/TableActionEffects.test.tsx src/components/PokerTable.tsx src/game/useGamePlayback.ts src/game/useGamePlayback.test.tsx src/gameplay.css
git commit -m "feat: animate chips and folded cards across table"
```

### Task 3: Folded seat state and action handoff

**Files:**
- Modify: `src/components/PlayerSeat.tsx`
- Modify: `src/components/PlayerSeat.test.tsx`
- Modify: `src/gameplay.css`
- Modify: `src/card-action-layout.css`

**Interfaces:**
- Consumes: `effect?: VisualEffectKind`, `folded`, `thinking`, and `acting` props already supplied by `PokerTable`.
- Produces: `.folding` during a fold token and `.folded` after the state transition; avatar/plaque/wager grayscale only after the flight begins.

- [ ] **Step 1: Write failing seat-state tests**

Assert `effect="fold"` adds `.folding`, folded seats add `.folded`, acting seats keep `.acting`, and the two states are not confused. Verify hole cards stay in DOM during `.folding` so CSS can animate them.

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test -- --run src/components/PlayerSeat.test.tsx`

- [ ] **Step 3: Implement class mapping and visual transitions**

Add the `.folding` class, animate `.player-seat-hole` convergence, and transition avatar/plaque/position/wager to grayscale after 180ms. Replace the old whole-seat opacity reduction so stack/name remain readable.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- --run src/components/PlayerSeat.test.tsx
git add src/components/PlayerSeat.tsx src/components/PlayerSeat.test.tsx src/gameplay.css src/card-action-layout.css
git commit -m "feat: animate fold and dim inactive seats"
```

### Task 4: Larger dynamic pot stack and aged table surface

**Files:**
- Modify: `src/components/PotChipStack.tsx`
- Modify: `src/components/PotChipStack.test.tsx`
- Modify: `src/table-themes.css`
- Modify: `src/card-action-layout.css`
- Modify: `tests/desktop-action-visual.spec.ts`

**Interfaces:**
- Consumes: numeric `pot` and existing `wagerChipFor(index)` assets.
- Produces: deterministic `chipCountForPot` tiers of 3/5/7/9 visual chips and a 1.4x desktop pile, while retaining one `.pot-chip-label`.

- [ ] **Step 1: Write failing pot-tier and visual tests**

Assert pots 3, 20, 80, and 180 render 3, 5, 7, and 9 chips. Extend the desktop Playwright test to assert pile width at least 72px, label count exactly one, table texture present, and no pot/board overlap at 1440×900 and 1100×760.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- --run src/components/PotChipStack.test.tsx`

- [ ] **Step 3: Implement tiers and aged materials**

Increase pile images and overlapping spread without enlarging the label. Layer the existing real felt texture over each theme's color variables with low opacity, center cleanup vignette, worn perimeter mask, old leather rail, and thin tarnished-brass inset. Keep the board region contrast at or above the current implementation.

- [ ] **Step 4: Verify focused tests and commit**

```bash
npm test -- --run src/components/PotChipStack.test.tsx
git add src/components/PotChipStack.tsx src/components/PotChipStack.test.tsx src/table-themes.css src/card-action-layout.css tests/desktop-action-visual.spec.ts
git commit -m "feat: age the table and enlarge the pot stack"
```

### Task 5: Image2 brass plaque sizing controls

**Files:**
- Create: `public/assets/poker-visuals/controls/sizing-plaque.png`
- Modify: `src/components/ActionControls.tsx`
- Modify: `src/components/ActionControls.test.tsx`
- Modify: `src/card-action-layout.css`
- Modify: `tests/desktop-action-visual.spec.ts`

**Interfaces:**
- Consumes: the three existing `MobileBetPreset` actions and the selected Image2 reference `/Users/zhaoxiang/.codex/generated_images/01a00324-cc74-71a2-885f-69de506caed9/exec-b0482f48-5bba-4dfa-9f6e-501a9456b0dc.png`.
- Produces: three semantic buttons with `.sizing-plaque`, `.selected`, hover/active/disabled states, and a real project-local raster material asset.

- [ ] **Step 1: Add failing control-state tests**

Assert all three buttons use `.sizing-plaque`, clicking one adds `.selected` without submitting an action, disabled states remain rendered, and the background asset path exists.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- --run src/components/ActionControls.test.tsx src/ui/pokerVisualAssets.test.ts`

- [ ] **Step 3: Generate and install the material asset**

Use Image2 to create one transparent or seamless black-enamel/aged-brass rounded plaque material at the measured button aspect ratio. Save it as `public/assets/poker-visuals/controls/sizing-plaque.png`; do not reference a generated-image cache path from production code.

- [ ] **Step 4: Implement selected, press, disabled, and reduced-motion states**

Track the selected preset independently from the exact slider amount. Clicking a preset updates both amount and selected state; dragging or typing clears selected state unless the amount exactly equals a preset target. Active press translates 2px, hover translates -1px, and reduced-motion removes transitions.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- --run src/components/ActionControls.test.tsx src/ui/pokerVisualAssets.test.ts
git add public/assets/poker-visuals/controls/sizing-plaque.png src/components/ActionControls.tsx src/components/ActionControls.test.tsx src/card-action-layout.css tests/desktop-action-visual.spec.ts
git commit -m "feat: add aged brass sizing plaques"
```

### Task 6: Full regression, performance, and design QA

**Files:**
- Modify: `design-qa.md`
- Modify: `tests/desktop-action-visual.spec.ts`
- Create: `tests/desktop-action-motion.spec.ts`

**Interfaces:**
- Consumes: selected Image2 reference and the final browser-rendered 1440×900 implementation.
- Produces: passing unit/build/PWA/desktop visual suite and `design-qa.md` with `final result: passed` only if no P0/P1/P2 findings remain.

- [ ] **Step 1: Add deterministic browser motion assertions**

Use a fixed game seed to submit one action and assert: a visible response occurs within 100ms; at least one flying chip appears for wager actions; a fold flight is followed by a grayscale seat; the pot number changes after the flight begins; no transient effect nodes remain after playback.

- [ ] **Step 2: Run the complete verification suite**

```bash
npm test -- --run
npm run lint
npm run build
npm run verify:mobile-bundle
npm run test:pwa
npx playwright test tests/desktop-action-visual.spec.ts tests/desktop-action-motion.spec.ts --config=playwright.desktop.config.ts
git diff --check
```

- [ ] **Step 3: Capture and compare visual evidence**

Capture 1440×900 static, chip-flight, and folded-seat screenshots. Put the selected Image2 target and static implementation into one comparison image, inspect typography, layout, colors, material quality, copy, and responsive behavior, then update `design-qa.md`.

- [ ] **Step 4: Fix all P0/P1/P2 findings and rerun affected checks**

Do not mark QA passed while controls overlap, transient layers persist, table texture lowers card contrast, pot overlaps the board, or action timing exceeds the agreed ranges.

- [ ] **Step 5: Commit verified delivery**

```bash
git add design-qa.md tests/desktop-action-visual.spec.ts tests/desktop-action-motion.spec.ts
git commit -m "test: verify aged animated poker table"
```
