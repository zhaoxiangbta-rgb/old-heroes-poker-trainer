# Image 2 Unified Poker Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用全新 Image 2 头像与筹码资产重做移动端和 PC 端牌桌，使两端共享同一套写实视觉系统且不改变牌局规则。

**Architecture:** 将资产选择集中到平台无关的 `pokerVisualAssets.ts`，移动和桌面组件只消费稳定玩家头像与筹码 URL。桌面座位改为头像、身份牌、底牌、下注筹码分层结构；移动端复用相同资产并保留现有响应式定位。现有三段式操作区只替换筹码底图和视觉令牌，不复制金额或动作规则。

**Tech Stack:** React 19, TypeScript, CSS, Image 2 raster assets, Vitest, Testing Library, Playwright, Vite PWA, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-08-27-image2-unified-poker-visual-system-design.md`

## Global Constraints

- 不修改牌局规则、策略、行动顺序、合法下注、筹码结算和持久化。
- 六个稳定玩家 ID 必须映射到固定头像，改名和重放不得换脸。
- PC 与移动端必须消费同一文件，不维护复制资产。
- 新素材必须全部本地保存并进入 PWA 预缓存。
- 不把金额、姓名或动作文字烘焙进通用筹码图片。
- 保留本地私有人名隔离，公开构建不得包含私有人名。

---

### Task 1: Generate and Register the Shared Raster Asset Set

**Files:**
- Create: `public/assets/poker-visuals/avatars/player-01.png` through `player-06.png`
- Create: `public/assets/poker-visuals/chips/wager-red.png`
- Create: `public/assets/poker-visuals/chips/wager-blue.png`
- Create: `public/assets/poker-visuals/chips/wager-green.png`
- Create: `public/assets/poker-visuals/chips/wager-black.png`
- Create: `public/assets/poker-visuals/chips/wager-gold.png`
- Create: `public/assets/poker-visuals/controls/fold.png`
- Create: `public/assets/poker-visuals/controls/check.png`
- Create: `public/assets/poker-visuals/controls/primary.png`
- Create: `public/assets/poker-visuals/controls/all-in.png`
- Create: `public/assets/poker-visuals/cards/card-paper.png`
- Create: `public/assets/poker-visuals/cards/card-back.png`
- Create: `src/ui/pokerVisualAssets.ts`
- Create: `src/ui/pokerVisualAssets.test.ts`

**Interfaces:**
- Produces: `playerPortraitFor(playerId: string, seat: number): string`, `wagerChipFor(seat: number): string`, and `POKER_CONTROL_ASSETS`.

- [ ] Crop the six confirmed sample characters as reference inputs and generate each avatar as an individual square project asset; inspect every output for identity match, distinct silhouette, face crop and absent text/watermark.
- [ ] Generate each wager/control chip as a separate square asset without baked UI text; inspect center clearance for dynamic HTML labels.
- [ ] Generate a neutral warm-ivory card-paper texture and a black-green/antique-gold branded card back; neither asset may contain a fixed rank or suit.
- [ ] Copy selected outputs into `public/assets/poker-visuals/**` without overwriting the existing `mobile-casino` set until migration passes.
- [ ] Write a failing mapping test:

```ts
expect(playerPortraitFor("friend-01", 5)).toBe("/assets/poker-visuals/avatars/player-01.png");
expect(playerPortraitFor("unknown", 2)).toBe("/assets/poker-visuals/avatars/player-03.png");
expect(new Set(Array.from({ length: 6 }, (_, seat) => wagerChipFor(seat))).size).toBe(5);
expect(POKER_CONTROL_ASSETS.allIn).toContain("/assets/poker-visuals/controls/all-in.png");
```

- [ ] Run `npm test -- --run src/ui/pokerVisualAssets.test.ts` and verify RED because the module does not exist.
- [ ] Implement the stable ID map with seat fallback and exported immutable control paths.
- [ ] Re-run the focused test and verify GREEN.
- [ ] Commit the asset set and registry.

### Task 2: Migrate Mobile Avatars, Wagers and Action Chips

**Files:**
- Modify: `src/mobile/MobilePlayerAvatar.tsx`
- Modify: `src/mobile/MobilePokerTable.tsx`
- Modify: `src/mobile/MobilePokerTable.test.tsx`
- Modify: `src/mobile/MobileFloatingControls.tsx`
- Modify: `src/mobile/MobileFloatingControls.test.tsx`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Consumes: `playerPortraitFor`, `wagerChipFor`, `POKER_CONTROL_ASSETS` from Task 1.
- Produces: `.mobile-wager-chip`, `.mobile-player-identity`, and action controls using CSS variables `--control-chip-image`.

- [ ] Update component tests to require `/assets/poker-visuals/avatars/`, one wager image next to each positive `streetBet`, and shared control asset URLs.
- [ ] Run `npm test -- --run src/mobile/MobilePokerTable.test.tsx src/mobile/MobileFloatingControls.test.tsx` and verify RED.
- [ ] Replace `mobilePortraitFor` with `playerPortraitFor`; render wager markup as an image plus a separate numeric label:

```tsx
<span className="mobile-wager">
  <img className="mobile-wager-chip" src={wagerChipFor(player.seat)} alt="" />
  <b>{player.streetBet}</b>
</span>
```

- [ ] Assign action asset paths through CSS custom properties while leaving button text, disabled state and submit handlers unchanged.
- [ ] Replace old mobile asset selectors with the shared paths; keep avatar, identity plaque, hole cards and wager as independent positioned boxes.
- [ ] Re-run focused tests and verify GREEN.
- [ ] Commit the mobile migration.

### Task 3: Recompose the Desktop Player Seat

**Files:**
- Create: `src/components/PlayerSeat.tsx`
- Create: `src/components/PlayerSeat.test.tsx`
- Modify: `src/components/PokerTable.tsx`
- Modify: `src/gameplay.css`
- Modify: `src/turn-status.css`
- Modify: `src/card-action-layout.css`

**Interfaces:**
- Consumes: player/game state, `PlayingCard`, `playerPortraitFor`, `wagerChipFor`.
- Produces: `.player-seat-avatar`, `.player-seat-plaque`, `.player-seat-hole`, `.player-seat-wager` with unchanged `.seatN` positioning hooks.

- [ ] Write a failing `PlayerSeat` test asserting image avatar, Chinese position, remaining stack, two cards, separate wager image/amount, fold mark and thinking label.
- [ ] Run `npm test -- --run src/components/PlayerSeat.test.tsx` and verify RED.
- [ ] Extract one seat from `PokerTable` into `PlayerSeat` without moving game-state decisions into the component.
- [ ] Render structure with explicit layers:

```tsx
<article className={`seat seat${visualSeat}`}>
  <img className="player-seat-avatar" src={playerPortraitFor(player.playerId, visualSeat)} />
  <div className="player-seat-plaque">...</div>
  <div className="player-seat-hole">...</div>
  <div className="player-seat-wager"><img ... /><b>{player.streetBet}</b></div>
</article>
```

- [ ] Move visual-state classes for acting, thinking, folded and ALL IN onto the relevant independent layer; do not hide committed wagers when folded.
- [ ] Rewrite desktop seat CSS to match the confirmed PC reference at 1440×900 and 1100×760, keeping table center and analysis panel clear.
- [ ] Run the focused seat test plus `src/App.interaction.test.tsx` and verify GREEN.
- [ ] Commit the desktop seat migration.

### Task 4: Rebuild the Shared Playing-Card Face

**Files:**
- Modify: `src/components/PlayingCard.tsx`
- Create: `src/components/PlayingCard.test.tsx`
- Modify: `src/styles.css`
- Modify: `src/card-action-layout.css`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Produces: one shared `.card-face-inner` structure and the visual tokens `--card-paper`, `--card-red`, `--card-black` for board, seat and action-dock cards.

- [ ] Write a failing test asserting separate rank and suit nodes, correct red/black suit classes, branded back image, and unchanged accessible card labels for all four suits.
- [ ] Run `npm test -- --run src/components/PlayingCard.test.tsx` and verify RED.
- [ ] Keep rank and suit dynamic but restyle `PlayingCard` against the shared card-paper texture; use a bold high-contrast serif rank, an independently scaled suit glyph and a compact corner composition matching the sample.
- [ ] Apply the same card tokens to public cards, seat cards and both action docks; adjust only width/height/padding per context, never the color or type system.
- [ ] Replace the striped CSS back with `card-back.png` while preserving deal/reveal animation classes.
- [ ] Re-run the card test, mobile table tests and desktop interaction tests; verify GREEN.
- [ ] Commit the shared card-face system.

### Task 5: Synchronize Desktop Action-Chip Assets and PWA Packaging

**Files:**
- Modify: `src/components/ActionControls.tsx`
- Modify: `src/components/ActionControls.test.tsx`
- Modify: `src/card-action-layout.css`
- Modify: `scripts/build-pwa-assets.mjs`
- Modify: `scripts/verify-mobile-bundle.mjs`
- Test: `src/mobile/mobileCasinoAssets.test.ts`

**Interfaces:**
- Consumes: `POKER_CONTROL_ASSETS`.
- Produces: shared action-chip backgrounds in PC/mobile builds and recursive `poker-visuals` PWA precache entries.

- [ ] Extend tests to assert each desktop action slot exposes the shared control asset variable and the mobile bundle contains every new file.
- [ ] Run the focused tests and `npm run build && npm run verify:mobile-bundle`; verify RED for missing shared package paths.
- [ ] Apply the shared fold/check/primary/ALL IN images to desktop action chips while keeping the three fixed slots and their HTML labels.
- [ ] Extend the PWA asset-copy helper to recursively copy and precache `public/assets/poker-visuals` exactly once.
- [ ] Update bundle verification to reject missing avatar/chip files and absolute subpath-incompatible URLs.
- [ ] Re-run focused tests, build and bundle verification; verify GREEN.
- [ ] Commit shared controls and offline packaging.

### Task 6: Geometry, Visual QA, Version and Delivery

**Files:**
- Modify: `tests/mobile-visual.spec.ts`
- Modify: `tests/desktop-action-visual.spec.ts`
- Modify: `design-qa.md`
- Modify: `package.json`, `package-lock.json`
- Modify: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`

**Interfaces:**
- Produces: final screenshots at five target viewports and the next aligned patch release.

- [ ] Add geometry assertions that every visible seat has a nonzero avatar, identity plaque and wager box; avatar/plaque/hole/wager pairs must not intersect, while board and pot must not intersect any seat or wager.
- [ ] Add asset assertions that all rendered avatar and chip URLs contain `/assets/poker-visuals/` and load with `naturalWidth > 0`.
- [ ] Add card readability assertions for minimum rank/suit font size, red/black contrast classes, common paper texture and branded back image across PC/mobile contexts.
- [ ] Build and capture 430×932, 430×760, 932×430, 1440×900 and 1100×760 screenshots.
- [ ] Compare the same states against both confirmed Image 2 references; log and fix all P0–P2 mismatches in `design-qa.md`.
- [ ] Run full verification:

```bash
npm test -- --run
npm run lint
npm run build
npm run verify:mobile-bundle
npm run test:pwa
npm run test:mobile-visual
npx playwright test tests/desktop-action-visual.spec.ts --config=playwright.desktop.config.ts
git diff --check
```

- [ ] Bump and align the next patch version across npm and Tauri metadata, rebuild, and rerun the five visual checks.
- [ ] Commit the verified implementation. Do not publish GitHub until the user confirms the new real screenshots.
