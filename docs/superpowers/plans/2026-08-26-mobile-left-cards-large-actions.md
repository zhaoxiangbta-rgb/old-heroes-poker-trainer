# Mobile Left Cards and Large Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将移动端横向推杆下方改为左侧手牌与右侧 64 px 大筹码操作的居中紧凑布局。

**Architecture:** `MobileFloatingControls` 保留现有规则、金额和提交数据流，仅将手牌与余码整合到左翼，并把右翼规则动作限制为两个固定大筹码位。CSS 负责竖屏和横屏的比例；Playwright 验证真实几何尺寸与无遮挡。

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Playwright, Vite PWA.

## Global Constraints

- 不修改规则引擎、合法金额、提交锁、筹码动画和声音。
- 右侧按钮直径目标 64 px，不小于 62 px。
- 手牌单张宽 58 px，点数和花色不缩小。
- 下层组合总宽不超过 360 px，左右间距 10–14 px。
- 操作区高度保持 142–150 px，不侵入牌桌。
- 不新增依赖、远程资源或移动端规则分支。

---

### Task 1: Left Card Wing and Two Legal Action Slots

**Files:**
- Modify: `src/mobile/MobileFloatingControls.test.tsx`
- Modify: `src/mobile/MobileFloatingControls.tsx`

**Interfaces:**
- Consumes: `GameState`, `game.legal`, `mobilePrimaryAction(game, amount)`, existing `send(action)`.
- Produces: `.mobile-left-hand`, `.mobile-hand-meta`, `.mobile-right-actions`; at most two legal buttons.

- [ ] **Step 1: Write failing component tests**

Assert that `.mobile-player-bankroll` and `.mobile-bankroll-stack` are absent, `.mobile-left-hand` contains two cards and text matching `余码 200 ·`, and `.mobile-right-actions button` has at most two elements. Add a check-capable state assertion that the left slot is `过牌` while the primary slot remains the sized bet.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/mobile/MobileFloatingControls.test.tsx`

Expected: FAIL because the old bankroll block exists and hand metadata is absent.

- [ ] **Step 3: Implement the minimal DOM change**

Move the existing `PlayingCard` pair into `.mobile-left-hand`, render `<small className="mobile-hand-meta">余码 {hero.stack} · {positionLabel(hero.position).name}</small>`, remove the decorative bankroll stack, and retain only legal actions. Preserve `send`, `locked`, receipt and error logic byte-for-byte where possible.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- --run src/mobile/MobileFloatingControls.test.tsx src/mobile/HorizontalBetSlider.test.tsx`

Expected: all component and slider tests pass.

### Task 2: 45:55 Visual Balance and 58 px Chip Controls

**Files:**
- Modify: `src/mobile/mobile.css`
- Modify: `tests/mobile-visual.spec.ts`

**Interfaces:**
- Consumes: `.mobile-left-hand`, `.mobile-hand-meta`, `.mobile-right-actions`.
- Produces: non-overlapping left/right wings in portrait, compact portrait and landscape.

- [ ] **Step 1: Write failing geometry assertions**

Measure the left wing, right wing, hand cards and action buttons. Assert card width `>= 54`, every visible action is `>= 56` in both dimensions, right wing width exceeds the old 98 px allocation, wing rectangles do not intersect, and the dock remains `<= 150` px in portrait.

- [ ] **Step 2: Run visual tests and verify RED**

Run: `npx playwright test tests/mobile-visual.spec.ts --reporter=line`

Expected: FAIL because existing actions are 44×42 px and the old three-column bankroll layout remains.

- [ ] **Step 3: Implement responsive CSS**

Remove the `.mobile-player-bankroll` and `.mobile-bankroll-stack` layout rules from the active dock override. Position `.mobile-left-hand` at the left safe area with cards at 56×79 px and metadata below. Allocate the right wing approximately 55% of the lower visual weight, set two chip controls to 58×58 px, keep fixed slots without layout growth for ALL IN, and override compact/landscape positions without scaling below 56 px.

- [ ] **Step 4: Verify visual GREEN and inspect screenshots**

Run: `npm run build && npx playwright test tests/mobile-visual.spec.ts --reporter=line`

Expected: all three viewports pass. Inspect `test-results/mobile-portrait.png`, `mobile-compact-portrait.png`, and `mobile-landscape.png` for optical balance, label fit and card prominence.

### Task 3: QA, Release Verification, and Publish

**Files:**
- Modify: `design-qa.md`
- Modify: `package.json`, `package-lock.json`
- Modify: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`

**Interfaces:**
- Produces: verified patch release with aligned five-location version metadata.

- [ ] **Step 1: Record design QA**

Update `design-qa.md` with the left-card/right-action hierarchy, 58 px action evidence, safe-area behavior and screenshot paths. Keep `final result: passed` only if no P0–P2 issue remains.

- [ ] **Step 2: Run full verification**

Run: `npm test -- --run && npm run lint && npm run build && npm run verify:mobile-bundle && npm run test:pwa && npm run test:mobile-visual && git diff --check`

Expected: 51+ test files pass, both PWA tests pass, three visual tests pass, build and lint exit 0.

- [ ] **Step 3: Bump and align patch version**

Run `npm version patch --no-git-tag-version`, then update the same patch version in Tauri JSON, Cargo manifest and the root Cargo lock package. Rebuild after the version change.

- [ ] **Step 4: Commit and publish**

Commit all implementation, test, QA and version changes. Split `poker-decision-trainer` as a subtree, attach its tree to the latest `public/main` parent with `git commit-tree` when necessary, push as a fast-forward, then confirm `git ls-remote public refs/heads/main` matches the release commit.
