# Desktop Reference Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the desktop game surface to preserve the approved reference proportions, show one pot label above a central chip stack, match the reference player-seat structure, and keep the horizontal betting rail with hero cards geometrically centered.

**Architecture:** Introduce a focused stage-sizing module and a dedicated `PotChipStack` component, while retaining the rule engine and existing action APIs. `PokerTable`, `PlayerSeat`, `PlayingCard`, and `ActionControls` consume shared layout and visual contracts; Playwright validates geometry at 1440×900 and 1100×760.

**Tech Stack:** React 19, TypeScript 5.8, CSS, Vitest, Testing Library, Playwright, Vite, Tauri 2.

## Global Constraints

- The pot amount appears exactly once, directly above the center chip stack.
- The player seat separates circular portrait, Chinese position badge, name/stack plaque, hole cards, and inward-facing wager.
- The desktop action dock retains the horizontal rail and five snap points.
- Hero cards are centered against the entire desktop stage within 2 pixels.
- Validate at exactly 1440×900 and 1100×760.
- Do not change poker rules, legal action generation, persistence, replay, mobile layout, or network behavior.

---

### Task 1: Desktop stage sizing contract

**Files:**
- Create: `src/ui/desktopStage.ts`
- Create: `src/ui/desktopStage.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `desktopStageScale(availableWidth: number, availableHeight: number): number`
- Produces: CSS container `.desktop-game-stage` and inner `.desktop-game-stage-canvas`

- [ ] **Step 1: Write the failing sizing tests**

```ts
expect(desktopStageScale(1090, 800)).toBe(1);
expect(desktopStageScale(760, 620)).toBeLessThan(1);
expect(desktopStageScale(2000, 1200)).toBe(1);
```

- [ ] **Step 2: Run `npm test -- --run src/ui/desktopStage.test.ts` and verify the missing module failure.**

- [ ] **Step 3: Implement a clamped scale based on the 1090×800 reference canvas and wrap the desktop table plus action controls in the stage container.**

```ts
export function desktopStageScale(width: number, height: number) {
  return Math.min(1, width / 1090, height / 800);
}
```

- [ ] **Step 4: Run the focused test and `npm run lint`; both must pass.**

- [ ] **Step 5: Commit with `git commit -m "feat: add proportional desktop poker stage"`.**

### Task 2: Single pot label and deterministic center chip stack

**Files:**
- Create: `src/components/PotChipStack.tsx`
- Create: `src/components/PotChipStack.test.tsx`
- Modify: `src/components/PokerTable.tsx`
- Modify: `src/card-action-layout.css`

**Interfaces:**
- Consumes: `wagerChipFor(seat: number): string`
- Produces: `PotChipStack({ pot, phase }: { pot: number; phase: PlaybackPhase })`

- [ ] **Step 1: Write a failing component test that renders pot 64, asserts exactly one text node `底池 64`, and asserts 2–5 local chip images without a second numeric label.**

```tsx
render(<PotChipStack pot={64} phase="hero-turn" />);
expect(screen.getAllByText("底池 64")).toHaveLength(1);
expect(document.querySelectorAll(".pot-chip-stack img").length).toBeGreaterThanOrEqual(2);
```

- [ ] **Step 2: Run `npm test -- --run src/components/PotChipStack.test.tsx` and verify the missing component failure.**

- [ ] **Step 3: Implement deterministic tiers: 0–9 two chips, 10–39 three chips, 40–99 four chips, 100+ five chips; render the sole pot label above the images.**

- [ ] **Step 4: Replace the old `.pot` markup in `PokerTable`, add phase-specific settle classes, and place the component between board and lower table edge.**

- [ ] **Step 5: Run the focused test, `src/App.interaction.test.tsx`, and `npm run lint`; all must pass.**

- [ ] **Step 6: Commit with `git commit -m "feat: add central pot chip stack"`.**

### Task 3: Reference player-seat geometry

**Files:**
- Modify: `src/components/PlayerSeat.tsx`
- Modify: `src/components/PlayerSeat.test.tsx`
- Modify: `src/components/PokerTable.tsx`
- Modify: `src/card-action-layout.css`
- Modify: `tests/desktop-action-visual.spec.ts`

**Interfaces:**
- `PlayerSeat` retains its current game-state props.
- Adds stable zones: `.player-position-badge`, `.player-seat-avatar`, `.player-seat-plaque`, `.player-seat-hole`, `.player-seat-wager`.

- [ ] **Step 1: Extend the component test to require all five zones and verify that the position badge contains the Chinese position name while the plaque contains `余码 N`.**

- [ ] **Step 2: Run `npm test -- --run src/components/PlayerSeat.test.tsx` and verify failure for the missing position zone/copy.**

- [ ] **Step 3: Update markup so position is outside the plaque, plaque contains name and `余码 N`, wager uses a local chip image, and all-in replaces only the stack line.**

- [ ] **Step 4: Define one seat geometry contract and directional variables per seat so wager chips face inward and hole cards sit below the plaque without overlap.**

```css
.seat{--inward-x:0;--inward-y:34px}
.seat2{--inward-x:-52px;--inward-y:8px}
.seat5{--inward-x:52px;--inward-y:8px}
.player-seat-wager{transform:translate(var(--inward-x),var(--inward-y))}
```

- [ ] **Step 5: Extend Playwright measurements to assert zero overlap among the five zones and verify each wager center is closer to the table center than its avatar center.**

- [ ] **Step 6: Run focused unit and desktop visual tests; both viewport cases must pass.**

- [ ] **Step 7: Commit with `git commit -m "feat: align player seats with reference"`.**

### Task 4: Reference card-face system

**Files:**
- Modify: `src/components/PlayingCard.tsx`
- Modify: `src/components/PlayingCard.test.tsx`
- Modify: `src/card-action-layout.css`

**Interfaces:**
- `PlayingCard` retains `{ card?: string; back?: boolean; className?: string }`.
- Adds inner `.card-corner` while retaining `.card-rank` and `.suit-symbol` selectors.

- [ ] **Step 1: Update tests to require an ivory face class, a separate corner group, red hearts/diamonds, and black clubs/spades.**

- [ ] **Step 2: Run the focused test and verify it fails for the missing corner group.**

- [ ] **Step 3: Implement the corner group and CSS variables `--card-width`, `--card-height`, `--rank-size`, and `--suit-size`; use the generated paper texture with oversized rank/suit.**

- [ ] **Step 4: Apply explicit sizes for board cards, seat cards, and hero cards without duplicating card rendering logic.**

- [ ] **Step 5: Run `PlayingCard`, `PlayerSeat`, and `ActionControls` tests plus lint.**

- [ ] **Step 6: Commit with `git commit -m "feat: refine readable poker card faces"`.**

### Task 5: Centered desktop action dock

**Files:**
- Modify: `src/components/ActionControls.tsx`
- Modify: `src/components/ActionControls.test.tsx`
- Modify: `src/card-action-layout.css`
- Modify: `tests/desktop-action-visual.spec.ts`

**Interfaces:**
- Keeps existing action callbacks and amount-selection logic.
- Adds `.desktop-action-lower`, with absolute center zone `.desktop-hand-zone` and balanced side zones.

- [ ] **Step 1: Extend tests to require the horizontal rail, five snap labels, three size buttons, centered two-card hand, and three fixed action slots.**

- [ ] **Step 2: Run the focused test and verify geometry hooks are missing.**

- [ ] **Step 3: Rebuild the lower dock as a relative three-zone layer: size controls anchored left, hand centered with `left:50%; transform:translateX(-50%)`, action controls anchored right.**

- [ ] **Step 4: Keep the amount input and horizontal rail above the lower layer, spanning the full safe width with equally spaced snap nodes.**

- [ ] **Step 5: Extend Playwright to compare the hand center against `.desktop-game-stage-canvas` center with tolerance `<= 2`, and assert the rail does not intersect the lower zones.**

- [ ] **Step 6: Run focused unit and desktop visual tests at both target viewport sizes.**

- [ ] **Step 7: Commit with `git commit -m "feat: center desktop cards under bet rail"`.**

### Task 6: Full verification and visual handoff

**Files:**
- Modify: `tests/desktop-action-visual.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`

**Interfaces:**
- Produces screenshots `test-results/desktop-reference-wide.png` and `test-results/desktop-reference-compact.png`.

- [ ] **Step 1: Add final screenshot names and exact assertions for one pot label, chip-stack safe area, stage aspect ratio, seat-zone separation, inward wagers, centered hero cards, and five rail nodes.**

- [ ] **Step 2: Bump the patch version consistently in npm and Tauri manifests.**

- [ ] **Step 3: Run `npm test -- --run`, `npm run lint`, `npm run build`, `npm run verify:mobile-bundle`, `npm run test:pwa`, `npm run test:mobile-visual`, and the desktop Playwright suite.**

- [ ] **Step 4: Run `git diff --check` and inspect both screenshots at original resolution.**

- [ ] **Step 5: Commit with `git commit -m "release: polish desktop reference layout"`.**
