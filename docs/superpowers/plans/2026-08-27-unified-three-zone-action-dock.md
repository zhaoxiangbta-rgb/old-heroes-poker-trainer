# Unified Three-Zone Action Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按确认样图将移动端和 PC 端操作区统一为上层金额轨道、下层尺寸/手牌/动作三区。

**Architecture:** 保留本地规则引擎和现有提交锁。复用合法金额、池比目标和轨道节点纯函数；移动与桌面组件分别组装同一信息架构，使用各自响应式 CSS。

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Playwright, Vite PWA.

## Global Constraints

- 不修改规则引擎、筹码结算、动画、声音和防连点逻辑。
- 轨道五档视觉上均匀分布，仍允许所有合法整数金额。
- 左侧尺寸只改金额，右侧动作才提交。
- 右侧始终三个固定位，非法动作禁用但不移除。
- 不新增依赖、远程资源或第二套规则。

---

### Task 1: Even Rail Landmarks

**Files:**
- Modify: `src/mobile/mobileBetRail.ts`
- Modify: `src/mobile/mobileBetRail.test.ts`
- Modify: `src/mobile/HorizontalBetSlider.tsx`
- Modify: `src/mobile/HorizontalBetSlider.test.tsx`

**Interfaces:**
- Consumes: `mobileBetPresetTarget(game, preset)`, `mobileBetChoices(game)`.
- Produces: five stable `BetRailNode` entries with legal `amount/index`, plus uniformly spaced marker positions.

- [ ] Write failing tests asserting all five labels remain present even when target amounts coincide, node marker styles are `0% / 25% / 50% / 75% / 100%`, and arbitrary range values still emit legal amounts.
- [ ] Run `npm test -- --run src/mobile/mobileBetRail.test.ts src/mobile/HorizontalBetSlider.test.tsx` and verify RED.
- [ ] Remove visual-node deduplication, keep snapping by legal index, and position marker labels by ordinal while preserving the native range's legal-value index mapping.
- [ ] Re-run focused tests and verify GREEN.

### Task 2: Mobile Low-Height Three-Zone Dock

**Files:**
- Modify: `src/mobile/MobileFloatingControls.test.tsx`
- Modify: `src/mobile/MobileFloatingControls.tsx`
- Modify: `src/mobile/mobile.css`
- Modify: `tests/mobile-visual.spec.ts`

**Interfaces:**
- Produces: `.mobile-size-zone`, `.mobile-hand-zone`, `.mobile-action-zone`, three preset controls, two cards, bankroll metadata at lower-left, and three fixed action slots.

- [ ] Write failing component tests for three preset buttons, metadata inside the left zone, cards-only center zone, three fixed action buttons, disabled illegal actions, preset-without-submit, and existing anti-double-submit behavior.
- [ ] Run the focused component test and verify RED.
- [ ] Implement the three-zone DOM using `mobileBetPresetTarget`; render fold/check/primary slots unconditionally and disable each from `game.legal`/`primary`.
- [ ] Run component tests and verify GREEN.
- [ ] Update visual assertions for dock height `<=142`, six controls `>=48px`, cards `>=56px`, zone non-overlap and even rail-node spacing; run once to verify RED.
- [ ] Replace the rejected asymmetric CSS with the low-height leather/brass three-zone layout and verify all three mobile viewports GREEN.

### Task 3: PC Three-Zone Dock

**Files:**
- Create: `src/components/ActionControls.test.tsx`
- Modify: `src/components/ActionControls.tsx`
- Modify: `src/card-action-layout.css`
- Modify: `src/actions.css`
- Create: `tests/desktop-action-visual.spec.ts`

**Interfaces:**
- Consumes: the same amount choices, preset targets, rail nodes and `actionForTarget` used by mobile.
- Produces: `.desktop-action-dock`, `.desktop-size-zone`, `.desktop-hand-zone`, `.desktop-action-zone` and an editable horizontal amount rail.

- [ ] Write failing component tests for the desktop three-zone structure, editable amount, preset selection without submission, three fixed action slots, keyboard shortcuts and fold confirmation.
- [ ] Run the new test and verify RED.
- [ ] Recompose `ActionControls` without changing its action semantics; render hero cards with `PlayingCard`, bankroll metadata in the left zone and disabled illegal actions in fixed slots.
- [ ] Run component tests and verify GREEN.
- [ ] Add PC CSS using the same material language while keeping the dock inside the table-side section.
- [ ] Add Playwright geometry tests at 1440×900 and 1100×760 for analysis-panel separation, zone alignment, card/button sizes and no overflow; build and verify GREEN.

### Task 4: QA, Full Verification, Version and Release

**Files:**
- Modify: `design-qa.md`
- Modify: `package.json`, `package-lock.json`
- Modify: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`

- [ ] Update QA with the confirmed sample path, mobile/PC screenshots, rail spacing and three-zone measurements.
- [ ] Run `npm test -- --run && npm run lint && npm run build && npm run verify:mobile-bundle && npm run test:pwa && npm run test:mobile-visual && npx playwright test tests/desktop-action-visual.spec.ts && git diff --check`.
- [ ] Bump and align the next patch version in all five version locations, then rerun build and focused browser tests.
- [ ] Commit the implementation. Publish only after the user confirms the final real screenshots.
