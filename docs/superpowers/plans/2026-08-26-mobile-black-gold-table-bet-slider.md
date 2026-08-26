# Mobile Black-Gold Poker Table and Bet Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped mobile PWA table and desktop-style action bar with an iPhone-first black-gold poker table and a hero-turn-only vertical bet slider that selects every legal integer amount without changing poker rules.

**Architecture:** Keep `GameState.legal`, `actionForTarget`, `useGamePlayback`, settlement, persistence, and desktop components as the single behavioral source. Add mobile-only presentation components selected by the existing `mobile` prop, with pure bet-sizing helpers underneath the gesture UI. Keep table rendering, amount mapping, and action submission in separate focused files so each can be tested independently.

**Tech Stack:** React 19, TypeScript 5.8, CSS, Vitest + Testing Library, Playwright WebKit, Tauri 2, Vite PWA build.

## Global Constraints

- Primary viewport is iPhone 14 Pro Max portrait, `430 × 932` CSS pixels.
- Hero is visually rotated to the bottom without changing engine seats, action order, seeds, snapshots, or replay data.
- Slider covers every integer in `[game.legal.minRaiseTo, game.legal.maxRaiseTo]`; its top value is exactly ALL IN.
- Releasing the slider never submits. Only the “下注” or “加注” button submits the selected amount.
- Side presets are `½池`, `⅔池`, `底池`, and `最小`; they only select and clamp an amount.
- The sheet is absent outside `hero-turn`; when raising is not legal it must not render a slider or raise control.
- Desktop `PokerTable` and `ActionControls` behavior and layout must remain unchanged.
- All legal action facts come from the existing local rules engine; presentation code must not recreate betting rules.
- Minimum touch target is `44 × 44` CSS pixels and reduced-motion settings must be respected.
- No new runtime dependency, network dependency, persistence field, private player name, or secret may be introduced.

---

## File Structure

- Create `src/mobile/mobileBetSizing.ts`: pure legal bounds, integer clamp, and preset target calculations.
- Create `src/mobile/mobileBetSizing.test.ts`: exhaustive boundary and preset tests.
- Create `src/mobile/VerticalBetSlider.tsx`: accessible vertical range input with controlled integer value.
- Create `src/mobile/VerticalBetSlider.test.tsx`: range, value, ALL IN, and non-submit gesture tests.
- Create `src/mobile/MobileActionSheet.tsx`: hero-turn actions, amount state, validation, locking, and error recovery.
- Create `src/mobile/MobileActionSheet.test.tsx`: all legal-state and duplicate-submit contracts.
- Create `src/components/PlayingCard.tsx`: shared face/back card renderer used by desktop and mobile tables.
- Create `src/mobile/MobilePokerTable.tsx`: hero-relative seats and black-gold mobile table DOM.
- Create `src/mobile/MobilePokerTable.test.tsx`: seat rotation, information visibility, fold, wager, and phase state tests.
- Modify `src/components/PokerTable.tsx`: consume shared `PlayingCard` without changing desktop DOM behavior.
- Modify `src/App.tsx`: select mobile table/action components only when `mobile` is true.
- Replace the table/action portion of `src/mobile/mobile.css`: black-gold layout, safe areas, sheet transitions, range styling, landscape fallback, reduced motion.
- Modify `src/mobile/MobileApp.test.tsx` and `src/App.interaction.test.tsx`: protect mobile/desktop separation.
- Modify `tests/mobile-visual.spec.ts`: portrait and landscape geometry plus live interaction assertions.
- Modify `tests/mobile-pwa.spec.ts`: retain online-cache/offline-reload coverage after the UI replacement.
- Modify `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`: release version `1.3.0` after acceptance.
- Modify `README.md`: document the mobile action model and version.

---

### Task 1: Pure Mobile Bet Amount Model

**Files:**
- Create: `src/mobile/mobileBetSizing.ts`
- Test: `src/mobile/mobileBetSizing.test.ts`

**Interfaces:**
- Consumes: `GameState` from `src/game/game.ts`.
- Produces:
  - `type MobileBetBounds = { min: number; max: number }`
  - `type MobileBetPreset = "half-pot" | "two-thirds-pot" | "pot" | "minimum"`
  - `mobileBetBounds(game: GameState): MobileBetBounds | null`
  - `clampMobileBet(value: number, bounds: MobileBetBounds): number`
  - `mobileBetPresetTarget(game: GameState, preset: MobileBetPreset): number`

- [ ] **Step 1: Write failing legal-range and preset tests**

```ts
import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { clampMobileBet, mobileBetBounds, mobileBetPresetTarget } from "./mobileBetSizing";

it("covers every integer from the legal minimum through all-in", () => {
  const game = newGame(42);
  game.legal = { canFold: true, canCheck: false, canCall: true, canRaise: true, callAmount: 6, minRaiseTo: 14, maxRaiseTo: 200 };
  expect(mobileBetBounds(game)).toEqual({ min: 14, max: 200 });
  expect(clampMobileBet(13.6, { min: 14, max: 200 })).toBe(14);
  expect(clampMobileBet(87.4, { min: 14, max: 200 })).toBe(87);
  expect(clampMobileBet(999, { min: 14, max: 200 })).toBe(200);
});

it("selects minimum and clamped pot fractions without submitting", () => {
  const game = newGame(42);
  const hero = game.players[game.heroSeat];
  hero.streetBet = 4;
  game.pot = 30;
  game.legal = { canFold: true, canCheck: false, canCall: true, canRaise: true, callAmount: 6, minRaiseTo: 16, maxRaiseTo: 38 };
  expect(mobileBetPresetTarget(game, "minimum")).toBe(16);
  expect(mobileBetPresetTarget(game, "half-pot")).toBe(25);
  expect(mobileBetPresetTarget(game, "two-thirds-pot")).toBe(30);
  expect(mobileBetPresetTarget(game, "pot")).toBe(38);
});

it("returns no slider bounds when raising is closed", () => {
  const game = newGame(42);
  game.legal.canRaise = false;
  expect(mobileBetBounds(game)).toBeNull();
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- --run src/mobile/mobileBetSizing.test.ts`

Expected: FAIL because `mobileBetSizing.ts` does not exist.

- [ ] **Step 3: Implement integer clamping and the four targets**

```ts
import type { GameState } from "../game/game";

export type MobileBetBounds = { min: number; max: number };
export type MobileBetPreset = "half-pot" | "two-thirds-pot" | "pot" | "minimum";

export function mobileBetBounds(game: GameState): MobileBetBounds | null {
  if (!game.legal.canRaise) return null;
  return { min: game.legal.minRaiseTo, max: game.legal.maxRaiseTo };
}

export function clampMobileBet(value: number, bounds: MobileBetBounds) {
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(value)));
}

export function mobileBetPresetTarget(game: GameState, preset: MobileBetPreset) {
  const bounds = mobileBetBounds(game);
  if (!bounds) throw new Error("当前不能下注或加注");
  if (preset === "minimum") return bounds.min;
  const ratio = preset === "half-pot" ? 0.5 : preset === "two-thirds-pot" ? 2 / 3 : 1;
  const hero = game.players[game.heroSeat];
  return clampMobileBet(hero.streetBet + game.legal.callAmount + game.pot * ratio, bounds);
}
```

- [ ] **Step 4: Run focused tests and full rules tests**

Run: `npm test -- --run src/mobile/mobileBetSizing.test.ts src/engine/betting.test.ts src/game/game.test.ts`

Expected: PASS with legal betting and full-hand simulation unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/mobile/mobileBetSizing.ts src/mobile/mobileBetSizing.test.ts
git commit -m "feat: model mobile bet slider amounts"
```

---

### Task 2: Accessible Vertical Slider

**Files:**
- Create: `src/mobile/VerticalBetSlider.tsx`
- Test: `src/mobile/VerticalBetSlider.test.tsx`

**Interfaces:**
- Consumes: controlled `value`, `min`, `max`, `disabled`, and `onChange(value: number)`.
- Produces: `VerticalBetSlider(props)` with `role="slider"`, `aria-orientation="vertical"`, integer step, and `data-all-in`.

- [ ] **Step 1: Write failing controlled-slider tests**

```tsx
it("exposes every legal integer and only reports value changes", () => {
  const onChange = vi.fn();
  render(<VerticalBetSlider min={14} max={200} value={68} disabled={false} onChange={onChange} />);
  const slider = screen.getByRole("slider", { name: "本街投入到" });
  expect(slider).toHaveAttribute("min", "14");
  expect(slider).toHaveAttribute("max", "200");
  expect(slider).toHaveAttribute("step", "1");
  fireEvent.change(slider, { target: { value: "199" } });
  expect(onChange).toHaveBeenCalledWith(199);
});

it("marks only the maximum value as all-in", () => {
  const { rerender } = render(<VerticalBetSlider min={14} max={200} value={199} disabled={false} onChange={vi.fn()} />);
  expect(screen.getByRole("slider")).toHaveAttribute("data-all-in", "false");
  rerender(<VerticalBetSlider min={14} max={200} value={200} disabled={false} onChange={vi.fn()} />);
  expect(screen.getByRole("slider")).toHaveAttribute("data-all-in", "true");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- --run src/mobile/VerticalBetSlider.test.tsx`

Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement the controlled native range input**

```tsx
type Props = { min: number; max: number; value: number; disabled: boolean; onChange(value: number): void };

export function VerticalBetSlider({ min, max, value, disabled, onChange }: Props) {
  return <div className="mobile-bet-rail" data-testid="mobile-bet-rail">
    <span className="mobile-all-in-label">ALL IN</span>
    <input
      className="mobile-bet-slider"
      aria-label="本街投入到"
      aria-orientation="vertical"
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      data-all-in={value === max}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
    />
  </div>;
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/mobile/VerticalBetSlider.test.tsx`

Expected: PASS; no submit callback exists in this component.

- [ ] **Step 5: Commit**

```bash
git add src/mobile/VerticalBetSlider.tsx src/mobile/VerticalBetSlider.test.tsx
git commit -m "feat: add mobile vertical bet slider"
```

---

### Task 3: Hero-Turn Mobile Action Sheet

**Files:**
- Create: `src/mobile/MobileActionSheet.tsx`
- Test: `src/mobile/MobileActionSheet.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/mobile/MobileApp.test.tsx`
- Modify: `src/App.interaction.test.tsx`

**Interfaces:**
- Consumes: `{ game: GameState; busy: boolean; receipt: string; onAction(action: GameAction): void }`.
- Produces: `MobileActionSheet`, rendered only by `App` when `mobile && phase === "hero-turn" && game.phase === "playing"`.
- Uses: Task 1 helpers, Task 2 slider, and existing `actionForTarget(game, amount)`.

- [ ] **Step 1: Write failing tests for each legal action state**

```tsx
function facingBetGame() {
  const game = newGame(42);
  game.legal = { canFold: true, canCheck: false, canCall: true, canRaise: true, callAmount: 6, minRaiseTo: 14, maxRaiseTo: 200 };
  return game;
}

it("shows check and bet without fold or call when checking is legal", () => {
  const game = newGame(42);
  game.legal = { canFold: false, canCheck: true, canCall: false, canRaise: true, callAmount: 0, minRaiseTo: 2, maxRaiseTo: 200 };
  render(<MobileActionSheet game={game} busy={false} receipt="" onAction={vi.fn()} />);
  expect(screen.getByRole("button", { name: "过牌" })).toBeVisible();
  expect(screen.getByRole("button", { name: "下注" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "弃牌" })).not.toBeInTheDocument();
});

it("shows fold, exact call, and raise when facing a bet", () => {
  const game = facingBetGame();
  render(<MobileActionSheet game={game} busy={false} receipt="" onAction={vi.fn()} />);
  expect(screen.getByRole("button", { name: "弃牌" })).toBeVisible();
  expect(screen.getByRole("button", { name: `跟注 ${game.legal.callAmount}` })).toBeVisible();
  expect(screen.getByRole("button", { name: "加注" })).toBeVisible();
});

it("removes the slider and raise action after a short all-in closes raising", () => {
  const game = facingBetGame();
  game.legal.canRaise = false;
  render(<MobileActionSheet game={game} busy={false} receipt="" onAction={vi.fn()} />);
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "加注" })).not.toBeInTheDocument();
  expect(screen.getByText("短全下未重新开放加注")).toBeVisible();
});
```

- [ ] **Step 2: Add failing tests for presets, confirmation, lock, and recovery**

```tsx
it("moves to all-in without submitting until raise is confirmed", () => {
  const game = facingBetGame();
  const onAction = vi.fn();
  render(<MobileActionSheet game={game} busy={false} receipt="" onAction={onAction} />);
  fireEvent.change(screen.getByRole("slider"), { target: { value: String(game.legal.maxRaiseTo) } });
  expect(screen.getByText("ALL IN", { selector: ".mobile-selected-amount" })).toBeVisible();
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "加注" }));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(onAction).toHaveBeenCalledWith({ type: "raise", to: game.legal.maxRaiseTo });
});

it("locks immediately so a double tap submits once", () => {
  const onAction = vi.fn();
  render(<MobileActionSheet game={facingBetGame()} busy={false} receipt="" onAction={onAction} />);
  const call = screen.getByRole("button", { name: /跟注/ });
  fireEvent.click(call);
  fireEvent.click(call);
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(call).toBeDisabled();
});
```

- [ ] **Step 3: Run and verify RED**

Run: `npm test -- --run src/mobile/MobileActionSheet.test.tsx`

Expected: FAIL because the sheet does not exist.

- [ ] **Step 4: Implement state and direct actions**

```tsx
const bounds = mobileBetBounds(game);
const [amount, setAmount] = useState(bounds?.min ?? 0);
const [submitted, setSubmitted] = useState(false);
const [error, setError] = useState("");
const locked = busy || submitted;

useEffect(() => {
  setAmount((current) => bounds ? clampMobileBet(current || bounds.min, bounds) : 0);
  setSubmitted(false);
  setError("");
}, [game.seed, game.street, game.toAct, bounds?.min, bounds?.max]);

function send(action: GameAction) {
  if (locked) return;
  setSubmitted(true);
  try { onAction(action); }
  catch (reason) {
    setSubmitted(false);
    setError(reason instanceof Error ? reason.message : "当前金额不合法");
  }
}
```

Render preset buttons only with bounds, render state-specific bottom actions, and call `send(actionForTarget(game, amount))` only from the gold confirmation button.

- [ ] **Step 5: Route mobile and desktop actions separately in `App.tsx`**

```tsx
{game.phase === "playing" && !noActionPlayback ? (
  mobile
    ? phase === "hero-turn" && <MobileActionSheet game={game} busy={busy} receipt={receipt} onAction={submit} />
    : <ActionControls game={game} busy={busy} receipt={receipt} onAction={submit} />
) : handComplete ? (
  // existing next-hand branch unchanged
```

Add a desktop regression assertion that `render(<App />)` still exposes the spinbutton and current `ActionControls`, while `render(<App mobile />)` exposes `MobileActionSheet` and no spinbutton.

- [ ] **Step 6: Run focused and interaction suites**

Run: `npm test -- --run src/mobile/MobileActionSheet.test.tsx src/mobile/MobileApp.test.tsx src/App.interaction.test.tsx`

Expected: PASS with desktop ALL IN behavior unchanged and mobile confirmation behavior new.

- [ ] **Step 7: Commit**

```bash
git add src/mobile/MobileActionSheet.tsx src/mobile/MobileActionSheet.test.tsx src/App.tsx src/mobile/MobileApp.test.tsx src/App.interaction.test.tsx
git commit -m "feat: add hero-turn mobile betting sheet"
```

---

### Task 4: Hero-Relative Mobile Poker Table

**Files:**
- Create: `src/components/PlayingCard.tsx`
- Create: `src/mobile/MobilePokerTable.tsx`
- Create: `src/mobile/MobilePokerTable.test.tsx`
- Modify: `src/components/PokerTable.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `PlayingCard({ card?: string; back?: boolean; className?: string })` using the existing `.card`, `.face-up`, `.suit-red`, `.suit-black`, and `.suit-symbol` contract.
- Produces: `mobileVisualSeat(engineSeat: number, heroSeat: number, playerCount: number): number`, where hero maps to the bottom visual seat without mutating game data.
- Produces: `MobilePokerTable` with the same props as `PokerTable`.

- [ ] **Step 1: Write failing shared-card and visual-seat tests**

```tsx
it("rotates only the visual seat so hero is always mobile seat zero", () => {
  expect(mobileVisualSeat(4, 4, 6)).toBe(0);
  expect(mobileVisualSeat(5, 4, 6)).toBe(1);
  expect(mobileVisualSeat(0, 4, 6)).toBe(2);
  expect(mobileVisualSeat(3, 4, 6)).toBe(5);
});

it("renders readable table facts without changing engine seats", () => {
  const game = newGame(42);
  render(<MobilePokerTable game={game} phase="hero-turn" frame={undefined} visualTokens={[]} recentActions={[]} themeId="classic-green" />);
  expect(screen.getByTestId(`mobile-seat-${game.heroSeat}`)).toHaveAttribute("data-visual-seat", "0");
  expect(screen.getByText(`底池 ${game.pot}`)).toBeVisible();
  expect(screen.getByText(/轮到你/)).toBeVisible();
  expect(document.querySelectorAll(".mobile-hero-hole .card")).toHaveLength(2);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- --run src/mobile/MobilePokerTable.test.tsx src/App.interaction.test.tsx`

Expected: FAIL because the mobile table and shared card do not exist.

- [ ] **Step 3: Extract the existing card renderer without desktop markup drift**

Move the current suit/color logic to `PlayingCard.tsx`, use it from `PokerTable.tsx`, and keep the same DOM classes and `data-card-kind`. Run the existing desktop card-color test immediately.

Run: `npm test -- --run src/App.interaction.test.tsx -t "same face-up card contract"`

Expected: PASS.

- [ ] **Step 4: Implement the hero-relative mobile table**

```ts
export function mobileVisualSeat(engineSeat: number, heroSeat: number, playerCount: number) {
  return (engineSeat - heroSeat + playerCount) % playerCount;
}
```

Render engine seat identity in `data-engine-seat`, visual mapping in `data-visual-seat`, the current phase status, pot, board, each player's name/Chinese position/stack/street bet/fold/all-in/action state, and hero hole cards. Reuse the existing deal visibility and playback `frame` facts; never reveal opponent hole cards unless `player.revealed` is true.

- [ ] **Step 5: Select the table from `App.tsx`**

```tsx
{mobile
  ? <MobilePokerTable game={game} phase={phase} frame={frame} visualTokens={visualTokens} recentActions={recentActions} themeId={gameplaySettings.tableThemeId} />
  : <PokerTable game={game} phase={phase} frame={frame} visualTokens={visualTokens} recentActions={recentActions} themeId={gameplaySettings.tableThemeId} />}
```

- [ ] **Step 6: Run table and gameplay tests**

Run: `npm test -- --run src/mobile/MobilePokerTable.test.tsx src/game/actionDealing.test.ts src/game/playback.test.ts src/App.interaction.test.tsx`

Expected: PASS; hidden cards, deal order, fold state, wagers, and desktop table remain correct.

- [ ] **Step 7: Commit**

```bash
git add src/components/PlayingCard.tsx src/components/PokerTable.tsx src/mobile/MobilePokerTable.tsx src/mobile/MobilePokerTable.test.tsx src/App.tsx
git commit -m "feat: add hero-relative mobile poker table"
```

---

### Task 5: Black-Gold Layout, Safe Areas, and Motion

**Files:**
- Modify: `src/mobile/mobile.css`
- Modify: `tests/mobile-visual.spec.ts`

**Interfaces:**
- Consumes the semantic classes emitted by Tasks 2–4.
- Produces portrait and landscape layouts with no page-width overflow or action/card overlap.

- [ ] **Step 1: Replace the old visual test expectations with failing mobile contracts**

```ts
await expect(page.locator(".mobile-poker-table")).toBeVisible();
await expect(page.locator(".mobile-action-sheet")).toBeVisible();
await expect(page.getByRole("slider", { name: "本街投入到" })).toBeVisible();
const geometry = await page.evaluate(() => {
  const viewport = { width: innerWidth, height: innerHeight };
  const board = document.querySelector(".mobile-board")!.getBoundingClientRect();
  const sheet = document.querySelector(".mobile-action-sheet")!.getBoundingClientRect();
  const hero = document.querySelector(".mobile-hero-hole")!.getBoundingClientRect();
  return { viewport, board, sheet, hero, pageWidth: document.documentElement.scrollWidth };
});
expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport.width + 1);
expect(geometry.board.bottom).toBeLessThan(geometry.sheet.top);
expect(geometry.hero.bottom).toBeLessThanOrEqual(geometry.viewport.height);
```

Also exercise each preset, drag/select the slider to its maximum, verify `ALL IN`, click “加注”, and assert the sheet disappears while one opponent enters thinking state.

- [ ] **Step 2: Run the production visual test and verify RED**

Run: `npm run test:mobile-visual`

Expected: FAIL on missing black-gold layout classes or overlap assertions.

- [ ] **Step 3: Implement portrait black-gold CSS**

Use explicit mobile tokens:

```css
:root.mobile-client {
  --mobile-felt: #13251f;
  --mobile-felt-center: #1c382e;
  --mobile-ink: #080e0b;
  --mobile-gold: #d0a244;
  --mobile-gold-soft: #765d2b;
  --mobile-ivory: #f4ecd9;
  --mobile-muted: #aaa38f;
  --mobile-danger: #ed9994;
}
.mobile-action-sheet {
  position: fixed;
  z-index: 70;
  left: max(7px, env(safe-area-inset-left));
  right: max(7px, env(safe-area-inset-right));
  bottom: calc(66px + env(safe-area-inset-bottom));
  height: clamp(360px, 46dvh, 430px);
  animation: mobile-sheet-in 180ms cubic-bezier(.2,.8,.2,1);
}
```

Style hero-relative seat locations, large cards, pot, fold stamp, street wager, gold acting state, the vertical range thumb/track, presets, and state-dependent bottom button grids. Remove the old scaled desktop `.table` and sticky `.action-area` mobile rules.

- [ ] **Step 4: Add landscape and reduced-motion rules**

Landscape may place the sheet on the right while preserving all actions. Set all interactive controls to at least `44px`, and under `prefers-reduced-motion: reduce` disable sheet, amount, chip, and acting-state animations.

- [ ] **Step 5: Run production visual tests and inspect screenshots**

Run: `npm run test:mobile-visual`

Expected: PASS for `430 × 932` portrait and `932 × 430` landscape. Inspect `test-results/mobile-portrait.png` and `test-results/mobile-landscape.png` for readable cards, names, stack/wager labels, and no overlap.

- [ ] **Step 6: Commit**

```bash
git add src/mobile/mobile.css tests/mobile-visual.spec.ts
git commit -m "feat: apply mobile black-gold poker layout"
```

---

### Task 6: Full-Hand, Offline, Release, and Public Delivery

**Files:**
- Modify: `tests/mobile-pwa.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `README.md`

**Interfaces:**
- Consumes the complete production mobile UI and existing PWA lifecycle.
- Produces version `1.3.0`, updated versioned cache, documentation, and GitHub Pages release.

- [ ] **Step 1: Add a failing production PWA hand-flow test**

Extend `tests/mobile-pwa.spec.ts` with the following interaction contract. The exact direct action is chosen from the legal buttons so the test remains valid across deterministic seed changes:

```ts
test("production mobile table closes its sheet after one action and survives offline reload", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("已可离线使用")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".mobile-poker-table")).toBeVisible();
  const sheet = page.locator(".mobile-action-sheet");
  await expect(sheet).toBeVisible();

  const check = page.getByRole("button", { name: "过牌" });
  const call = page.getByRole("button", { name: /跟注 \d+/ });
  if (await check.isVisible()) await check.click();
  else await call.click();

  await expect(sheet).toBeHidden();
  await expect(page.locator(".mobile-seat.thinking")).toHaveCount(1, { timeout: 10_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.evaluate(() => location.reload());
  await expect(page.locator(".mobile-poker-table")).toBeVisible();
  await expect(page.getByText("当前离线运行")).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run and verify RED before the final integration is complete**

Run: `npm run test:pwa`

Expected: FAIL if the production bundle still exposes old controls, the sheet does not close, or offline resources omit a new module.

- [ ] **Step 3: Update version and user documentation**

Set all five package/Tauri version locations to `1.3.0`. Add README instructions: the sheet only appears on the hero turn, slider release does not submit, the top is ALL IN, and legal action labels change between check/bet and fold/call/raise.

- [ ] **Step 4: Run the complete clean verification matrix**

Run in order:

```bash
git diff --check
npm test
node --test scripts/build-pwa-assets.test.mjs
npm run lint
npm run build
npm run verify:mobile-bundle
npm run test:pwa
npm run test:mobile-visual
PATH="$PWD/.cargo-local/bin:$PATH" CARGO_HOME="$PWD/.cargo-local" RUSTUP_HOME="$PWD/.rustup-local" cargo test --manifest-path src-tauri/Cargo.toml
node scripts/verify-desktop-data.mjs
node scripts/verify-anonymous-identities.mjs
```

Expected: all frontend, Rust, privacy, persistence, visual, and offline suites pass.

- [ ] **Step 5: Build and inspect the production mobile bundle**

Verify `dist/mobile/index.html`, `manifest.webmanifest`, `service-worker.js`, icons, hashed worker assets, cache version `1.3.0`, no fixed LAN IP, no private names, and no API key material.

- [ ] **Step 6: Commit**

```bash
git add tests/mobile-pwa.spec.ts package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json README.md
git commit -m "release: prepare mobile table v1.3.0"
```

- [ ] **Step 7: Publish and verify the fixed URL**

Push the poker project subtree to public `main`, wait for the `pages.yml` workflow, then verify `https://zhaoxiangbta-rgb.github.io/old-heroes-poker-trainer/` with WebKit emulating iPhone 14 Pro Max. Confirm online `应用 1.3.0 · 缓存 1.3.0`, then set the context offline, reload, and confirm `当前离线运行` with the black-gold table present.

Expected: GitHub Actions build/deploy succeeds and the fixed URL runs the new UI offline.
