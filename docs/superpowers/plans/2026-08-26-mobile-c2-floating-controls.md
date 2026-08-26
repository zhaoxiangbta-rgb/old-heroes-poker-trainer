# Mobile C2 Floating Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obstructive mobile action sheet with the approved C2 floating poker controls, mechanical bet rail, distinctive player emblems, sequential chip-throw feedback, local chip sounds, and gold all-in treatment.

**Architecture:** Keep the local rules engine and playback queue as the only source of legal actions and timing. Split mobile presentation into focused components: a pure action-state model, a floating control cluster, a mechanical rail, emblem mapping, and playback-driven table effects. CSS owns the C2 composition; no generated bitmap is shipped as UI.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Playwright WebKit, Web Audio, existing Tauri/Rust LAN bundle.

## Global Constraints

- Target iPhone 14 Pro Max portrait size is 430 × 932 CSS pixels; landscape must remain usable.
- Hero cards stay left, B-style mechanical bet rail stays center, action capsules stay right, and `半池` / `2/3池` / `底池` stay in one bottom row.
- No large action panel, sheet, opaque overlay, or full-width glass rectangle may cover the table.
- Pot, five community-card positions, every opponent stack, and every street wager must remain visible on hero turns.
- Slider release selects only; the dynamic primary action button submits.
- The local game engine remains the sole source of legal actions and amounts.
- All sounds are local and optional; no network audio dependency is allowed.
- Existing desktop controls and desktop table behavior must not change.

---

### Task 1: Model the Dynamic Mobile Primary Action

**Files:**
- Create: `src/mobile/mobilePrimaryAction.ts`
- Create: `src/mobile/mobilePrimaryAction.test.ts`
- Modify: `src/mobile/mobileBetSizing.ts`

**Interfaces:**
- Consumes: `GameState`, `GameAction`, `mobileBetBounds(game)`.
- Produces: `mobilePrimaryAction(game, amount): { label: string; action: GameAction; mode: "check" | "call" | "bet" | "raise" | "all-in" }`.

- [ ] **Step 1: Write the failing state-model tests**

```ts
it("uses call at the rail minimum and raise above it", () => {
  const game = facingBetGame();
  expect(mobilePrimaryAction(game, game.legal.callAmount)).toMatchObject({ mode: "call", label: `跟注 ${game.legal.callAmount}` });
  expect(mobilePrimaryAction(game, game.legal.minRaiseTo)).toMatchObject({ mode: "raise", label: `加注到 ${game.legal.minRaiseTo}` });
});

it("uses all-in only at the legal maximum", () => {
  const game = facingBetGame();
  expect(mobilePrimaryAction(game, game.legal.maxRaiseTo)).toMatchObject({ mode: "all-in", label: `ALL IN ${game.legal.maxRaiseTo}` });
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- --run src/mobile/mobilePrimaryAction.test.ts`

Expected: FAIL because `mobilePrimaryAction` does not exist.

- [ ] **Step 3: Implement the pure state model**

```ts
export function mobilePrimaryAction(game: GameState, amount: number): MobilePrimaryAction {
  if (game.legal.canCall && amount <= game.legal.callAmount)
    return { mode: "call", label: `跟注 ${game.legal.callAmount}`, action: { type: "call" } };
  if (game.legal.canCheck && !game.legal.canRaise)
    return { mode: "check", label: "过牌", action: { type: "check" } };
  const action = actionForTarget(game, amount);
  if (action.to === game.legal.maxRaiseTo)
    return { mode: "all-in", label: `ALL IN ${action.to}`, action };
  return game.currentBet === 0
    ? { mode: "bet", label: `下注到 ${action.to}`, action }
    : { mode: "raise", label: `加注到 ${action.to}`, action };
}
```

- [ ] **Step 4: Run the model and existing sizing tests**

Run: `npm test -- --run src/mobile/mobilePrimaryAction.test.ts src/mobile/mobileBetSizing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mobile/mobilePrimaryAction.ts src/mobile/mobilePrimaryAction.test.ts src/mobile/mobileBetSizing.ts
git commit -m "feat: model dynamic mobile poker action"
```

---

### Task 2: Build the B-Style Mechanical Bet Rail

**Files:**
- Modify: `src/mobile/VerticalBetSlider.tsx`
- Modify: `src/mobile/VerticalBetSlider.test.tsx`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Consumes: `min`, `max`, `value`, `disabled`, `onChange(value)`.
- Produces: the same accessible range input plus B-style rail structure and `data-progress` for styling.

- [ ] **Step 1: Write failing structure and behavior tests**

```tsx
render(<VerticalBetSlider min={16} max={168} value={48} disabled={false} onChange={onChange} />);
expect(screen.getByText("ALL IN")).toBeVisible();
expect(screen.getByTestId("mobile-rail-amount")).toHaveTextContent("48");
expect(screen.getByTestId("mobile-bet-rail")).toHaveStyle({ "--rail-progress": "21.0526%" });
fireEvent.change(screen.getByRole("slider"), { target: { value: "49" } });
expect(onChange).toHaveBeenCalledWith(49);
```

- [ ] **Step 2: Run the rail tests and confirm RED**

Run: `npm test -- --run src/mobile/VerticalBetSlider.test.tsx`

Expected: FAIL on the missing amount badge/progress style.

- [ ] **Step 3: Implement the mechanical rail markup**

```tsx
const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;
return <div className="mobile-bet-rail" style={{ "--rail-progress": `${progress}%` } as CSSProperties}>
  <span className="mobile-all-in-label">ALL IN</span>
  <div className="mobile-rail-track"><input type="range" min={min} max={max} step={1} value={value} onChange={...} /></div>
  <output data-testid="mobile-rail-amount">{value}</output>
</div>;
```

- [ ] **Step 4: Style and verify the focused component**

Use a narrow matte-black slot, warm-gold segment ticks, a brass circular thumb, and a compact amount badge. Keep the native input as the accessible hit target and preserve a minimum 44px touch width.

Run: `npm test -- --run src/mobile/VerticalBetSlider.test.tsx && npm run lint`

Expected: PASS with no lint warnings.

- [ ] **Step 5: Commit**

```bash
git add src/mobile/VerticalBetSlider.tsx src/mobile/VerticalBetSlider.test.tsx src/mobile/mobile.css
git commit -m "feat: add mechanical mobile bet rail"
```

---

### Task 3: Replace the Sheet with C2 Floating Controls

**Files:**
- Create: `src/mobile/MobileFloatingControls.tsx`
- Create: `src/mobile/MobileFloatingControls.test.tsx`
- Modify: `src/App.tsx`
- Delete: `src/mobile/MobileActionSheet.tsx`
- Delete: `src/mobile/MobileActionSheet.test.tsx`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Consumes: existing `{ game, busy, receipt, onAction }` props and `mobilePrimaryAction`.
- Produces: `MobileFloatingControls`, rendered only during `phase === "hero-turn"`.

- [ ] **Step 1: Write failing interaction tests**

```tsx
expect(screen.getByRole("button", { name: "最小" })).not.toBeInTheDocument();
expect(screen.getAllByTestId("mobile-preset").map((node) => node.textContent)).toEqual(["半池", "2/3池", "底池"]);
expect(screen.getByRole("button", { name: /跟注/ })).toBeVisible();
fireEvent.change(screen.getByRole("slider"), { target: { value: String(game.legal.minRaiseTo) } });
expect(screen.getByRole("button", { name: /加注到/ })).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: /加注到/ }));
expect(onAction).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- --run src/mobile/MobileFloatingControls.test.tsx src/mobile/MobileApp.test.tsx`

Expected: FAIL because the floating component is absent.

- [ ] **Step 3: Implement the three-column floating component**

```tsx
const primary = mobilePrimaryAction(game, amount);
return <section className="mobile-floating-controls" aria-label="行动选择">
  <div className="mobile-hero-control-cards">...</div>
  <VerticalBetSlider ... />
  <div className="mobile-action-capsules">
    {game.legal.canFold && <button className="mobile-fold-capsule">弃牌</button>}
    <button className="mobile-primary-capsule" onClick={() => send(primary.action)}>{primary.label}</button>
  </div>
  <div className="mobile-bottom-presets">...</div>
</section>;
```

Render the hero cards in this component and suppress their duplicate rendering inside the mobile hero seat while controls are visible.

- [ ] **Step 4: Add C2 layout CSS**

Use independent positioned elements with only local shadows. Do not add a background to `.mobile-floating-controls`. Keep the hero cards left, rail center, capsules right, and presets in one bottom row. Preserve 44px touch targets.

- [ ] **Step 5: Run integration tests**

Run: `npm test -- --run src/mobile/MobileFloatingControls.test.tsx src/mobile/MobilePokerTable.test.tsx src/mobile/MobileApp.test.tsx src/App.interaction.test.tsx`

Expected: PASS and no duplicate hero cards during hero turn.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/mobile/MobileFloatingControls.tsx src/mobile/MobileFloatingControls.test.tsx src/mobile/MobilePokerTable.tsx src/mobile/MobilePokerTable.test.tsx src/mobile/mobile.css
git rm src/mobile/MobileActionSheet.tsx src/mobile/MobileActionSheet.test.tsx
git commit -m "feat: add C2 floating mobile controls"
```

---

### Task 4: Add Distinct Player Emblems

**Files:**
- Create: `src/mobile/playerEmblems.ts`
- Create: `src/mobile/playerEmblems.test.ts`
- Modify: `src/mobile/MobilePokerTable.tsx`
- Modify: `src/mobile/MobilePokerTable.test.tsx`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Consumes: stable `playerId` or seat identity from each player.
- Produces: `playerEmblem(playerId): { symbol: string; tone: "silver" | "red" | "blue" | "jade" | "amber" | "ivory"; label: string }`.

- [ ] **Step 1: Write failing stable-mapping tests**

```ts
expect(new Set(game.players.map((player) => playerEmblem(player.playerId).symbol)).size).toBe(game.players.length);
expect(playerEmblem("friend-01")).toEqual(playerEmblem("friend-01"));
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run src/mobile/playerEmblems.test.ts src/mobile/MobilePokerTable.test.tsx`

Expected: FAIL because the emblem mapper is absent.

- [ ] **Step 3: Implement stable local emblem metadata**

```ts
const EMBLEMS = [
  { symbol: "狼", tone: "silver", label: "银狼徽章" },
  { symbol: "鲤", tone: "red", label: "锦鲤徽章" },
  { symbol: "隼", tone: "blue", label: "猎鹰徽章" },
  { symbol: "發", tone: "jade", label: "麻将徽章" },
  { symbol: "✥", tone: "amber", label: "罗盘徽章" },
  { symbol: "♞", tone: "ivory", label: "骑士徽章" },
] as const;
```

Map stable friend identity to the same emblem across renames and replays. Render the symbol as code-native UI, not a generated bitmap.

- [ ] **Step 4: Run component and mapping tests**

Run: `npm test -- --run src/mobile/playerEmblems.test.ts src/mobile/MobilePokerTable.test.tsx`

Expected: PASS; all visible opponents have distinct accessible emblem labels.

- [ ] **Step 5: Commit**

```bash
git add src/mobile/playerEmblems.ts src/mobile/playerEmblems.test.ts src/mobile/MobilePokerTable.tsx src/mobile/MobilePokerTable.test.tsx src/mobile/mobile.css
git commit -m "feat: add distinct mobile player emblems"
```

---

### Task 5: Add Sequential Chip Throws, Local Sounds, and Gold All-In Treatment

**Files:**
- Modify: `src/game/playback.ts`
- Modify: `src/game/playback.test.ts`
- Modify: `src/game/sound.ts`
- Modify: `src/game/sound.test.ts`
- Modify: `src/mobile/MobilePokerTable.tsx`
- Modify: `src/mobile/MobilePokerTable.test.tsx`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Consumes: existing playback frames and `VisualToken` objects.
- Produces: deterministic chip-flight metadata and one all-in token per action.

- [ ] **Step 1: Write failing playback and sound tests**

```ts
const frames = planAfterHero(game, { type: "call" }, 7, false);
const chips = frames.filter((frame) => frame.effect === "chips");
expect(chips).toHaveLength(1);
expect(chips[0].durationMs).toBeGreaterThanOrEqual(260);
expect(soundCueForPlayback("chips", "call")).toBe("chip-light");

const allInFrames = planAfterHero(shortGame, { type: "raise", to: shortGame.legal.maxRaiseTo }, 8, false);
expect(allInFrames.filter((frame) => frame.effect === "all-in")).toHaveLength(1);
```

- [ ] **Step 2: Run tests and confirm RED on timing**

Run: `npm test -- --run src/game/playback.test.ts src/game/sound.test.ts`

Expected: FAIL because chip motion is currently 70–100ms.

- [ ] **Step 3: Extend deterministic playback timing without slowing thinking**

Set chip animation duration to 260–360ms using the existing seeded `mixed` function. Keep bot thinking unchanged and preserve frame sequencing, so wager text updates only when the chip frame state becomes visible.

```ts
if (phase === "animating-chips") return 260 + (mixed(seed, actionId, 29) % 101);
```

- [ ] **Step 4: Render chip-flight particles and all-in badge**

For the active `chips` visual token, render 2–4 CSS chip particles inside the acting seat with seeded delays and a destination vector toward its wager zone. For `all-in`, render one central gold wordmark for 700–900ms and retain a compact seat badge after the overlay expires.

```tsx
{chipToken && <span className="mobile-chip-flight" aria-hidden="true"><i/><i/><i/></span>}
{allIn && <div className="mobile-all-in-overlay"><strong>ALL IN</strong></div>}
```

- [ ] **Step 5: Improve local synthesis and verify mute behavior**

Keep Web Audio local. Layer two short oscillators for `chip-heavy` and `all-in`, but return immediately when disabled. Add tests asserting no context is created when sound is off and only one cue is requested per playback frame.

- [ ] **Step 6: Run playback, sound, table, and reduced-motion tests**

Run: `npm test -- --run src/game/playback.test.ts src/game/sound.test.ts src/game/useGamePlayback.test.tsx src/mobile/MobilePokerTable.test.tsx`

Expected: PASS; reduced-motion frames stay at 40ms and do not depend on CSS animation completion.

- [ ] **Step 7: Commit**

```bash
git add src/game/playback.ts src/game/playback.test.ts src/game/sound.ts src/game/sound.test.ts src/mobile/MobilePokerTable.tsx src/mobile/MobilePokerTable.test.tsx src/mobile/mobile.css
git commit -m "feat: animate mobile chips and all-in feedback"
```

---

### Task 6: Verify Geometry, Offline Operation, Packaging, and Public Delivery

**Files:**
- Modify: `tests/mobile-visual.spec.ts`
- Modify: `tests/mobile-pwa.spec.ts`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: completed C2 UI and existing PWA/Tauri packaging.
- Produces: verified release build and published PWA.

- [ ] **Step 1: Write failing mobile geometry assertions**

```ts
await expect(page.locator(".mobile-action-sheet")).toHaveCount(0);
await expect(page.locator(".mobile-hero-control-cards")).toBeVisible();
await expect(page.locator(".mobile-bet-rail")).toBeVisible();
await expect(page.locator(".mobile-action-capsules")).toBeVisible();
expect(await page.getByTestId("mobile-preset").count()).toBe(3);
```

Collect bounding boxes for pot, board, each opponent meta block, hero cards, rail, action capsules, and presets; assert the controls do not intersect pot/board/opponent rectangles and the document width is at most the viewport width plus one pixel.

- [ ] **Step 2: Run visual tests and confirm RED before final CSS adjustment**

Run: `npm run test:mobile-visual`

Expected: FAIL until C2 geometry is complete in both orientations.

- [ ] **Step 3: Finish portrait and landscape CSS**

Tune the 430 × 932 portrait first. For landscape, preserve the existing left-table/right-controls split while reusing mechanical rail and capsule styles. Ensure hero cards and all three presets stay above the safe-area/navigation bar.

- [ ] **Step 4: Extend offline action test**

In `tests/mobile-pwa.spec.ts`, reload offline, move the rail from call to raise, verify the dynamic label, submit once, and confirm the controls hide during playback.

- [ ] **Step 5: Bump release version and document the C2 controls**

Increase the patch/minor version consistently in all five version files. Document the new no-panel control layout, local animation/sound behavior, mute setting, and unchanged offline/privacy guarantees.

- [ ] **Step 6: Run the complete verification matrix**

```bash
npm test -- --run
npm run lint
npm run build
npm run verify:mobile-bundle
npm run test:mobile-visual
npm run test:pwa
CARGO_HOME="$PWD/.cargo-local" RUSTUP_HOME="$PWD/.rustup-local" "$PWD/.cargo-local/bin/cargo" test --manifest-path src-tauri/Cargo.toml
PATH="$PWD/.cargo-local/bin:$PATH" CARGO_HOME="$PWD/.cargo-local" RUSTUP_HOME="$PWD/.rustup-local" npm run tauri build
```

Expected: all commands exit zero; the mobile visual screenshots show no obstruction; macOS `.app` and `.dmg` are produced.

- [ ] **Step 7: Commit and publish**

```bash
git add tests/mobile-visual.spec.ts tests/mobile-pwa.spec.ts README.md package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src/mobile/mobile.css
git commit -m "release: ship mobile C2 floating controls"
```

Split the `poker-decision-trainer` subtree, push it linearly to the approved public `main`, wait for the Pages workflow, and verify the live version and 430px document width in WebKit before reporting completion.
