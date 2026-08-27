# Centered Controls And Stacked Pot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改动下注和结算逻辑的前提下，让桌面横杆严格居中、左右操作区对称居中，并将底池筹码改成随金额增高的多列立体堆。

**Architecture:** `PotChipStack` 内部引入纯函数 `potChipColumns(pot)`，只将底池金额映射为视觉列高，不参与规则计算。`ActionControls` 增加右侧平衡列，CSS 将横杆和下方操作区都改为以手牌中心为轴的对称网格。Playwright 直接测量 DOM 矩形，防止后续样式再次偏移。

**Tech Stack:** React 19, TypeScript, CSS, Vitest + Testing Library, Playwright, Vite.

## Global Constraints

- 不改动 `mobileBetChoices`、`mobileBetRailNodes`、`mobileBetPresetTarget` 或任何合法金额计算。
- 不改动底池、边池、筹码总账和赢家结算逻辑。
- 不改动移动端操作区。
- 底部操作台保持 174px 高度约束，手牌不缩小。
- 底池筹码堆宽度不超过 220px，高度不超过 82px。
- 不增加网络、第三方图库或新的运行时依赖。
- 保留现有飞筹码、弃牌、减少动画、声音和弃牌二次确认。

---

### Task 1: Deterministic Stacked Pot Model

**Files:**
- Modify: `src/components/PotChipStack.tsx`
- Modify: `src/components/PotChipStack.test.tsx`
- Modify: `src/card-action-layout.css`

**Interfaces:**
- Produces: `export function potChipColumns(pot: number): number[]`，返回每一列的筹码数，数组长度为列数。
- Consumes: `wagerChipFor(index: number): string` 和现有 `PlaybackPhase`。

- [ ] **Step 1: Write the failing column-tier tests**

```tsx
import { PotChipStack, potChipColumns } from "./PotChipStack";

it.each([
  [3, [1, 2, 1]],
  [24, [2, 3, 3, 2]],
  [77, [3, 4, 5, 4, 3]],
  [180, [4, 5, 6, 6, 5, 4]],
])("maps pot %i to stable vertical columns", (pot, expected) => {
  expect(potChipColumns(pot)).toEqual(expected);
});

it("renders one real image for every chip in every column", () => {
  render(<PotChipStack pot={77} phase="hero-turn" />);
  expect(document.querySelectorAll(".pot-chip-column")).toHaveLength(5);
  expect(document.querySelectorAll(".pot-chip-column img")).toHaveLength(19);
  expect(screen.getAllByText("底池 77")).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- --run src/components/PotChipStack.test.tsx`

Expected: FAIL because `potChipColumns` and `.pot-chip-column` do not exist.

- [ ] **Step 3: Implement the tier model and column markup**

```tsx
export function potChipColumns(pot: number) {
  if (pot < 10) return [1, 2, 1];
  if (pot < 40) return [2, 3, 3, 2];
  if (pot < 100) return [3, 4, 5, 4, 3];
  return [4, 5, 6, 6, 5, 4];
}

const columns = potChipColumns(pot);
<div className="pot-chip-pile" aria-hidden="true">
  {columns.map((height, columnIndex) => (
    <span className="pot-chip-column" style={{ "--column-index": columnIndex } as CSSProperties} key={columnIndex}>
      {Array.from({ length: height }, (_, chipIndex) => (
        <img
          src={wagerChipFor(columnIndex + chipIndex)}
          style={{ "--chip-index": chipIndex } as CSSProperties}
          alt=""
          key={chipIndex}
        />
      ))}
    </span>
  ))}
</div>
```

Update CSS so `.pot-chip-pile` aligns columns at the bottom, each `.pot-chip-column` uses a 34px-wide overlapping slot, and each 42px chip uses `bottom: calc(var(--chip-index) * 8px)` with subtle per-column rotation. Six slots therefore occupy 204px while the edge chips can overlap naturally inside the 220px bound. Keep the pile at `max-width:220px;height:82px` and retain the label above it.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- --run src/components/PotChipStack.test.tsx`

Expected: all PotChipStack tests pass; pot 77 renders 5 columns and 19 real chip images.

- [ ] **Step 5: Commit the stacked pot model**

```bash
git add src/components/PotChipStack.tsx src/components/PotChipStack.test.tsx src/card-action-layout.css
git commit -m "feat: stack pot chips vertically"
```

### Task 2: Symmetric Rail And Lower Controls

**Files:**
- Modify: `src/components/ActionControls.tsx`
- Modify: `src/card-action-layout.css`
- Modify: `tests/desktop-action-visual.spec.ts`

**Interfaces:**
- Produces: `.desktop-rail-balance` as an `aria-hidden` right-side balancing cell.
- Produces: symmetric DOM rectangles for `.desktop-size-zone`, `.desktop-hand-zone`, `.desktop-action-zone`, and `.desktop-rail-track`.
- Consumes: existing rail input and node mapping unchanged.

- [ ] **Step 1: Add failing symmetry measurements**

Extend the Playwright `measurements` object:

```ts
const rail = box(".desktop-rail-track");
const sizeContent = box(".desktop-size-buttons");
const actionContent = box(".desktop-action-zone");
const stageCenter = stage.left + stage.width / 2;

railCenterOffset: Math.abs(rail.left + rail.width / 2 - stageCenter),
sideZoneWidthDelta: Math.abs(sizeBox.width - actionBox.width),
sizeContentCenterOffset: Math.abs(sizeContent.left + sizeContent.width / 2 - (sizeBox.left + sizeBox.width / 2)),
actionContentCenterOffset: Math.abs(actionContent.left + actionContent.width / 2 - (actionBox.left + actionBox.width / 2)),
```

Assert each offset/delta is at most 2px at both 1440×900 and 1100×760.

- [ ] **Step 2: Run the desktop visual test and verify RED**

Run: `npx playwright test tests/desktop-action-visual.spec.ts --config=playwright.desktop.config.ts`

Expected: FAIL because the two-column rail is shifted right and the 33%/35% lower zones are asymmetric.

- [ ] **Step 3: Add the balancing cell without changing rail behavior**

In `ActionControls.tsx`, add after `.desktop-rail-track`:

```tsx
<span className="desktop-rail-balance" aria-hidden="true" />
```

Do not change `choices`, `nodes`, `railPosition`, `setRailPosition`, preset targets, or action submission.

- [ ] **Step 4: Replace asymmetric positioning with centered grids**

Use these CSS relationships:

```css
.desktop-amount-rail {
  width:min(100%,1000px);
  grid-template-columns:clamp(96px,12vw,132px) minmax(0,720px) clamp(96px,12vw,132px);
  gap:clamp(8px,1.5vw,20px);
}
.desktop-rail-balance { display:block; }
.desktop-action-zones {
  display:grid;
  grid-template-columns:minmax(0,1fr) 138px minmax(0,1fr);
  align-items:center;
  gap:clamp(12px,2vw,28px);
}
.desktop-size-zone,
.desktop-hand-zone,
.desktop-action-zone {
  position:static;
  width:auto;
  transform:none;
}
.desktop-size-zone,
.desktop-action-zone { justify-self:center; width:min(100%,320px); }
```

Retain current 56–60px button heights, 58×78 card size, real texture assets, disabled states and `174px` dock constraint.

- [ ] **Step 5: Rebuild and verify GREEN at both viewports**

Run: `npm run build && npx playwright test tests/desktop-action-visual.spec.ts --config=playwright.desktop.config.ts`

Expected: both viewport tests pass with rail center offset, side width delta, and left/right content center offsets ≤2px.

- [ ] **Step 6: Commit the symmetric layout**

```bash
git add src/components/ActionControls.tsx src/card-action-layout.css tests/desktop-action-visual.spec.ts
git commit -m "fix: center desktop betting controls"
```

### Task 3: Regression, Visual QA, And Delivery

**Files:**
- Modify: `design-qa.md`
- Evidence only, ignored by Git: `test-results/desktop-reference-wide.png`, `test-results/desktop-reference-compact.png`, `test-results/design-qa-comparison.png`

**Interfaces:**
- Consumes: final DOM and CSS from Tasks 1–2.
- Produces: updated `design-qa.md` with final result exactly `passed` or `blocked`.

- [ ] **Step 1: Run all automated verification**

Run:

```bash
npm test -- --run
npm run lint
npm run build
npm run verify:mobile-bundle
npx playwright test tests/desktop-action-visual.spec.ts tests/desktop-action-motion.spec.ts --config=playwright.desktop.config.ts
git diff --check
```

Expected: 0 failures, 0 lint errors, successful desktop/mobile production builds, verified mobile bundle, and 4 passing desktop visual/motion tests.

- [ ] **Step 2: Inspect both final screenshots**

Open `test-results/desktop-reference-wide.png` and `test-results/desktop-reference-compact.png`. Confirm:

- the rail is centered over the hand;
- left and right button groups have equal visual weight and are centered in equal side regions;
- the hero cards remain full-size;
- pot 3/24/77/180 states produce visibly taller/more numerous stacks;
- the chip pile does not touch board cards, pot label, player wager zones, or the dock;
- the complete rounded leather dock base remains visible.

- [ ] **Step 3: Perform same-input design QA**

Put the selected Image2 source `/Users/zhaoxiang/.codex/generated_images/01a00324-cc74-71a2-885f-69de506caed9/exec-b0482f48-5bba-4dfa-9f6e-501a9456b0dc.png` and `test-results/desktop-reference-wide.png` into one comparison image. Record typography, spacing, colors, asset quality and copy findings in `design-qa.md`. If any P0/P1/P2 remains, mark `blocked`, fix it, recapture, and compare again.

- [ ] **Step 4: Commit the verified QA update**

```bash
git add design-qa.md
git commit -m "docs: verify centered stacked table"
```

- [ ] **Step 5: Hand off the working preview**

Verify `curl -I http://127.0.0.1:8766/` returns HTTP 200, then lead the response with the clickable preview URL and report exact test counts and commit hashes. Mention that the two unrelated dirty August 26 documents were preserved and not committed.
