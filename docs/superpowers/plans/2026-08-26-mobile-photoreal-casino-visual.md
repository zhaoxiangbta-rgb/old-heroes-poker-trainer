# Mobile Photoreal Casino Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将移动牌桌升级为已确认样图的写实俱乐部风格，使用 Image 2 虚构人物头像、大点数大花色牌面、实体筹码按钮和离线材质资产。

**Architecture:** 视觉资产全部作为版本化本地文件存入 `public/assets/mobile-casino/`，通过一个纯数据头像映射模块供移动牌桌消费。牌面仍由 HTML 文字和花色符号渲染，以保证清晰度与可访问性；筹码按钮使用无文字的生成材质图作背景，文字继续由 React 渲染。原有规则引擎、行动提交和 IndexedDB 数据流不变。

**Tech Stack:** React 19, TypeScript, CSS, Vite, Vitest, Playwright, Image 2, WebP/PNG, PWA Service Worker.

## Global Constraints

- 保留全离线运行，所有图像与材质必须进入构建产物和 PWA 预缓存。
- 不使用真实人物、名人、用户私人信息或旧牌友姓名。
- 头像、余码铭牌、底牌和下注标签必须独立且无交叠。
- 圆形头像有效直径不小于 48 px。
- 手牌点数不小于 24 px，公共牌点数不小于 21 px，花色视觉宽度不小于牌宽的 45%。
- 所有主操作触摸区不小于 44×44 px，不改变原有防重复提交逻辑。
- 不得使用 Emoji、文字字符、通用渐变圆或简单内联 SVG 作为最终头像或主按钮资产。
- 必须覆盖 iPhone 14 Pro Max 竖屏 430×932、紧凑竖屏 430×760 和横屏 932×430。

---

## File Structure

- Create `public/assets/mobile-casino/avatars/player-01.webp` through `player-06.webp`: six fictional portraits.
- Create `public/assets/mobile-casino/textures/felt.webp`: seamless emerald felt.
- Create `public/assets/mobile-casino/textures/leather.webp`: seamless black leather.
- Create `public/assets/mobile-casino/controls/chip-fold.webp`, `chip-primary.webp`, `chip-all-in.webp`: text-free chip surfaces.
- Create `src/mobile/mobileCasinoAssets.ts`: stable asset URLs and avatar selection.
- Create `src/mobile/mobileCasinoAssets.test.ts`: asset mapping contract.
- Modify `src/mobile/MobilePlayerAvatar.tsx`: replace inline SVG with local portrait image.
- Modify `src/mobile/MobilePokerTable.tsx`: pass stable player identity to avatar resolver.
- Modify `src/mobile/MobilePokerTable.test.tsx`: image avatar and state assertions.
- Modify `src/components/PlayingCard.tsx`: separate rank and suit elements.
- Create `src/components/PlayingCard.test.tsx`: semantic rank/suit tests.
- Modify `src/card-action-layout.css`: shared card typography and paper treatment.
- Modify `src/mobile/mobile.css`: mobile materials, spacing, controls, cards, animation and responsive layout.
- Modify `src/mobile/MobileFloatingControls.test.tsx`: button asset and accessibility checks.
- Modify `tests/mobile-visual.spec.ts`: minimum size, non-overlap and viewport checks.
- Modify `scripts/build-pwa-assets.mjs`: include public runtime image assets in mobile output and precache.
- Modify `scripts/build-pwa-assets.test.mjs`: assert recursive asset copy and precache.
- Modify `scripts/verify-mobile-bundle.mjs`: require all casino assets and reject remote image URLs.
- Create `design-qa.md`: reference-versus-build visual QA result.

### Task 1: Generate and Normalize Offline Visual Assets

**Files:**
- Create: `public/assets/mobile-casino/avatars/player-01.webp` through `player-06.webp`
- Create: `public/assets/mobile-casino/textures/felt.webp`
- Create: `public/assets/mobile-casino/textures/leather.webp`
- Create: `public/assets/mobile-casino/controls/chip-fold.webp`
- Create: `public/assets/mobile-casino/controls/chip-primary.webp`
- Create: `public/assets/mobile-casino/controls/chip-all-in.webp`

**Interfaces:**
- Produces: local image files consumed by `mobileCasinoAssets.ts` and CSS `url('/assets/mobile-casino/...')` declarations.

- [ ] **Step 1: Generate six portraits with Image 2**

Use one Image 2 request per portrait. Every prompt includes: `photorealistic fictional Chinese private poker-club regular; shoulder-up; one person; warm-gold rim light; dark club background; face centered for circular crop; no text; no logo; no watermark; no celebrity; no resemblance to a known person`. Vary the six personalities exactly as listed in the approved design spec.

- [ ] **Step 2: Generate three text-free material/control source images**

Generate seamless emerald felt, seamless black padded leather, and a square contact sheet containing red-brown, ivory, and gold realistic poker-chip surfaces. Prompts explicitly forbid text, numbers, logos and watermarks.

- [ ] **Step 3: Inspect every generated output**

Run `view_image` on all selected files. Reject portraits with cropped faces, extra people, text or repeated identity; reject textures with visible seams; reject chip surfaces containing text.

- [ ] **Step 4: Copy selected assets into the project and normalize formats**

Use workspace dependency image tools to crop portraits square, export portraits at 512×512 WebP quality 82, textures at 1024×1024 WebP quality 80, and chip surfaces at 512×512 WebP quality 86. Keep generated originals outside `public/`; commit only normalized final assets.

- [ ] **Step 5: Verify dimensions and file sizes**

Run a script that reads every output image and asserts portraits are 512×512, textures are 1024×1024, controls are 512×512, no file exceeds 450 KB, and the combined asset set does not exceed 3.5 MB.

- [ ] **Step 6: Commit**

```bash
git add public/assets/mobile-casino
git commit -m "添加移动牌桌写实视觉资产"
```

### Task 2: Add Stable Asset Mapping and Photographic Avatars

**Files:**
- Create: `src/mobile/mobileCasinoAssets.ts`
- Create: `src/mobile/mobileCasinoAssets.test.ts`
- Modify: `src/mobile/MobilePlayerAvatar.tsx`
- Modify: `src/mobile/MobilePokerTable.tsx`
- Modify: `src/mobile/MobilePokerTable.test.tsx`

**Interfaces:**
- Produces: `mobilePortraitFor(playerId: string, seat: number): string` and `MOBILE_PORTRAITS: readonly string[]`.
- Consumes: `public/assets/mobile-casino/avatars/player-01.webp` through `player-06.webp`.

- [ ] **Step 1: Write failing mapping tests**

```ts
expect(MOBILE_PORTRAITS).toHaveLength(6);
expect(new Set(MOBILE_PORTRAITS).size).toBe(6);
expect(mobilePortraitFor("same-id", 3)).toBe(mobilePortraitFor("same-id", 0));
expect(mobilePortraitFor("other-id", 3)).not.toBe("");
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- --run src/mobile/mobileCasinoAssets.test.ts`

Expected: FAIL because `mobileCasinoAssets.ts` does not exist.

- [ ] **Step 3: Implement the asset resolver**

```ts
export const MOBILE_PORTRAITS = Array.from(
  { length: 6 },
  (_, index) => `/assets/mobile-casino/avatars/player-0${index + 1}.webp`,
) as readonly string[];

export function mobilePortraitFor(playerId: string, seat: number) {
  let hash = seat + 17;
  for (const char of playerId) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return MOBILE_PORTRAITS[hash % MOBILE_PORTRAITS.length];
}
```

- [ ] **Step 4: Write the failing avatar component test**

Render `MobilePokerTable`, then assert every visible `.mobile-player-identity img` has a local `/assets/mobile-casino/avatars/` URL, non-empty alt text, and six distinct source values in a six-player hand.

- [ ] **Step 5: Run the component test and verify RED**

Run: `npm test -- --run src/mobile/MobilePokerTable.test.tsx`

Expected: FAIL because the current component renders inline SVG avatar art.

- [ ] **Step 6: Replace the avatar renderer**

Change the public interface to:

```tsx
export function MobilePlayerAvatar({ playerId, seat, name }: {
  playerId: string;
  seat: number;
  name: string;
}) {
  return <img src={mobilePortraitFor(playerId, seat)} alt={`${name}的头像`} draggable={false} />;
}
```

Pass `player.playerId`, `visualSeat`, and `player.name` from `MobilePokerTable`.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `npm test -- --run src/mobile/mobileCasinoAssets.test.ts src/mobile/MobilePokerTable.test.tsx`

Expected: both files pass.

- [ ] **Step 8: Commit**

```bash
git add src/mobile/mobileCasinoAssets.ts src/mobile/mobileCasinoAssets.test.ts src/mobile/MobilePlayerAvatar.tsx src/mobile/MobilePokerTable.tsx src/mobile/MobilePokerTable.test.tsx
git commit -m "使用本地写实人物头像"
```

### Task 3: Redesign Playing Cards for Large Ranks and Suits

**Files:**
- Create: `src/components/PlayingCard.test.tsx`
- Modify: `src/components/PlayingCard.tsx`
- Modify: `src/card-action-layout.css`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Produces: `.card-rank` and `.suit-symbol` elements inside every face-up card.
- Preserves: `PlayingCard({ card?: string, back?: boolean, className?: string })`.

- [ ] **Step 1: Write failing semantic tests**

```tsx
render(<PlayingCard card="Ah" />);
expect(screen.getByText("A")).toHaveClass("card-rank");
expect(screen.getByText("♥")).toHaveClass("suit-symbol", "suit-red");
expect(screen.getByText("♥")).toHaveAttribute("aria-hidden", "true");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --run src/components/PlayingCard.test.tsx`

Expected: FAIL because rank text is currently an unwrapped text node.

- [ ] **Step 3: Implement explicit rank and suit markup**

```tsx
<span className={`card face-up ${color} ${className}`.trim()} data-card-kind="face-up" aria-label={card}>
  <b className="card-rank">{card[0]}</b>
  <small className={`suit-symbol ${color}`} aria-hidden="true">{symbols[card[1]]}</small>
</span>
```

- [ ] **Step 4: Implement shared paper and typography tokens**

Set `.card-rank` to `font: 900 1em Georgia, serif; line-height:.88`, `.suit-symbol` to `font-size:.78em; line-height:1`, and use ivory paper texture, a 1 px warm edge, 5 px radius and restrained shadow. Mobile hand cards use 54×74 to 56×78; board cards use 46×64 to 50×70. Do not reduce card rank below the Global Constraints.

- [ ] **Step 5: Add geometry assertions**

Extend `tests/mobile-visual.spec.ts` to read computed font sizes and bounding boxes, asserting hand rank >=24 px, board rank >=21 px, suit width/card width >=0.45, all five board cards fit the viewport, and both hero cards remain fully visible.

- [ ] **Step 6: Run component and visual tests**

Run: `npm test -- --run src/components/PlayingCard.test.tsx src/App.interaction.test.tsx`

Run: `npx playwright test tests/mobile-visual.spec.ts`

Expected: all pass at 430×932, 430×760 and 932×430.

- [ ] **Step 7: Commit**

```bash
git add src/components/PlayingCard.tsx src/components/PlayingCard.test.tsx src/card-action-layout.css src/mobile/mobile.css tests/mobile-visual.spec.ts
git commit -m "放大移动牌面点数和花色"
```

### Task 4: Apply Photoreal Table Materials and Chip Controls

**Files:**
- Modify: `src/mobile/mobile.css`
- Modify: `src/mobile/MobileFloatingControls.test.tsx`
- Test: `tests/mobile-visual.spec.ts`

**Interfaces:**
- Consumes: local texture/control URLs from Task 1.
- Preserves: all button labels, `onAction` behavior and `VerticalBetSlider` value semantics.

- [ ] **Step 1: Write failing style/interaction assertions**

Assert the rendered action region has class `mobile-casino-dock`; Fold, primary action and all-in use `mobile-chip-control` plus their state class; the three buttons remain enabled/disabled exactly from engine legality; every visible action button has a bounding box at least 44×44.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/mobile/MobileFloatingControls.test.tsx`

Expected: FAIL because the new casino classes do not exist.

- [ ] **Step 3: Add semantic visual classes without changing action behavior**

Use `mobile-casino-dock`, `mobile-chip-control`, `chip-fold`, `chip-primary`, and `chip-all-in`. Keep the existing `send()` locking and error recovery untouched.

- [ ] **Step 4: Apply materials and tactile states**

Use local felt and leather textures layered over solid fallback colors. Use chip assets as text-free backgrounds with HTML labels above them. Add 80–120 ms `:active` depression, keyboard `:focus-visible`, and `prefers-reduced-motion` fallbacks. Keep the slider centerline, amount and thumb programmatic for exact control.

- [ ] **Step 5: Refine betting motion**

Keep three chip particles, set flight duration to 260 ms, and ensure the destination ends at the pot without covering community cards. Limit ALL IN gold flash to <=450 ms and remove infinite flashing.

- [ ] **Step 6: Run interaction and visual tests**

Run: `npm test -- --run src/mobile/MobileFloatingControls.test.tsx src/game/useGamePlayback.test.tsx src/game/sound.test.ts`

Run: `npx playwright test tests/mobile-visual.spec.ts`

Expected: all pass with no overlaps and touch sizes >=44 px.

- [ ] **Step 7: Commit**

```bash
git add src/mobile/mobile.css src/mobile/MobileFloatingControls.tsx src/mobile/MobileFloatingControls.test.tsx tests/mobile-visual.spec.ts
git commit -m "升级移动牌桌材质与筹码按钮"
```

### Task 5: Package All Assets into the Offline PWA

**Files:**
- Modify: `scripts/build-pwa-assets.mjs`
- Modify: `scripts/build-pwa-assets.test.mjs`
- Modify: `scripts/verify-mobile-bundle.mjs`

**Interfaces:**
- Produces: recursive `dist/mobile/assets/mobile-casino/**` copy and one precache entry per file.
- Consumes: `public/assets/mobile-casino/**`.

- [ ] **Step 1: Write failing recursive-copy test**

Create a temporary `public/assets/mobile-casino/avatars/player-01.webp` fixture, run `buildPwaAssets`, and assert the same relative file exists beneath `dist/mobile/assets/mobile-casino/` and appears in `PRECACHE`.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test scripts/build-pwa-assets.test.mjs`

Expected: FAIL because the builder currently copies only fixed PWA icons and bundled `/assets/` references.

- [ ] **Step 3: Implement recursive public asset copying**

Add a recursive `copyTree(source, destination, urlPrefix)` helper that returns copied URLs. Append those URLs to `precache` before hashing and service-worker generation.

- [ ] **Step 4: Strengthen bundle verification**

Require exactly six portrait files, two texture files and three chip files. Scan CSS/JS/HTML for `https://` image URLs and fail if any mobile casino asset resolves remotely.

- [ ] **Step 5: Run packaging tests and verification**

Run: `node --test scripts/build-pwa-assets.test.mjs`

Run: `npm run build && npm run verify:mobile-bundle`

Expected: build succeeds; verifier reports complete precache and no remote or private content.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-pwa-assets.mjs scripts/build-pwa-assets.test.mjs scripts/verify-mobile-bundle.mjs
git commit -m "预缓存移动牌桌视觉资产"
```

### Task 6: Visual QA, Offline Regression, Version and Release

**Files:**
- Create: `design-qa.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `tests/mobile-visual.spec.ts` only if QA reveals a measurable missing assertion.

**Interfaces:**
- Produces: a versioned, cache-invalidating release and `design-qa.md` with `final result: passed`.

- [ ] **Step 1: Build and capture matching states**

Run `npm run build`, serve `dist/mobile`, and capture 430×932 hero-turn screenshots with the same visible street/action state as the approved Image 2 sample. Capture compact portrait and landscape as secondary checks.

- [ ] **Step 2: Write the first design QA report**

Compare the approved sample and prototype for hierarchy, material quality, avatar crop, card readability, chip-button fidelity, spacing and overlap. Classify findings P0–P3 and write them to `design-qa.md`; set `final result: blocked` until all P0/P1/P2 items are fixed.

- [ ] **Step 3: Fix P0/P1/P2 findings with focused RED/GREEN tests**

For every measurable issue, add a failing assertion to `tests/mobile-visual.spec.ts`, reproduce the failure, make the smallest CSS/component fix, and rerun the affected test. Do not loop on P3 decoration.

- [ ] **Step 4: Complete design QA**

Recapture all three viewports and update `design-qa.md` to `final result: passed`; include remaining P3 notes, if any.

- [ ] **Step 5: Run full verification**

Run: `npm test -- --run`

Run: `npm run lint`

Run: `npm run build`

Run: `npm run verify:mobile-bundle`

Run: `npm run test:pwa`

Run: `npm run test:mobile-visual`

Expected: every command exits 0; 48+ test files and 275+ unit tests pass; all PWA and visual tests pass.

- [ ] **Step 6: Bump the patch version consistently**

Use `npm version patch --no-git-tag-version`, then apply the same new version to `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the root `poker-decision-trainer` entry in `src-tauri/Cargo.lock`. Rebuild so the service-worker cache name changes.

- [ ] **Step 7: Verify release metadata and commit**

Confirm every version file matches, `git diff --check` passes, and the working tree contains only intended files.

```bash
git add design-qa.md package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock tests/mobile-visual.spec.ts
git commit -m "发布移动写实牌桌视觉升级版"
```

- [ ] **Step 8: Publish the isolated project to GitHub**

Fetch `public/main`, create a `git subtree split --prefix=poker-decision-trainer HEAD`, preserve public linear history using `git commit-tree <split-tree> -p public/main`, push to `public/main`, and verify with `git ls-remote public refs/heads/main` plus remote `package.json` version readback.
