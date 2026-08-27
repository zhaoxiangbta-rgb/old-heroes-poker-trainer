# Mobile Table Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为移动端增加由本地规则播放事件驱动的筹码入池、弃牌收牌、思考呼吸和赢家收池动画。

**Architecture:** 保留 `useGamePlayback` 和 `GameState` 作为唯一事实源，新增纯函数动效模型和独立 `MobileTableEffects` 组件。`MobilePokerTable` 只传入当前阶段、视觉事件和已结算结果，CSS 根据英雄相对座位负责轨迹，不修改游戏数据。

**Tech Stack:** React 19、TypeScript、Vitest + Testing Library、Playwright、CSS keyframes、Vite PWA。

## Global Constraints

- 规则引擎仍是唯一事实源；动画不计算底池、边池、赢家或余码。
- 不改变底部操作区高度、按钮顺序和下注横杆映射。
- 单次主动画为 220–420ms；只有思考呼吸可循环。
- 同时飞行筹码图片不超过 12 枚，动效层必须 `pointer-events: none`。
- 使用现有筹码、牌背和头像图片资产，不使用文字、CSS 图形或内联 SVG 伪造可见资产。
- `prefers-reduced-motion: reduce` 下禁用飞行、呼吸和闪光，最终状态仍正确显示。
- iPhone 14 Pro Max 竖屏是主验收尺寸，并验证 430×760 和 932×430。

---

### Task 1: 建立纯函数动效模型

**Files:**
- Create: `src/mobile/mobileTableMotion.ts`
- Test: `src/mobile/mobileTableMotion.test.ts`

**Interfaces:**
- Consumes: `VisualToken`, `GameResult`, `mobileVisualSeat(engineSeat, heroSeat, playerCount)`
- Produces: `mobileActionFlights(tokens, heroSeat, playerCount): MobileActionFlight[]`
- Produces: `mobileSettlementFlights(result, heroSeat, playerCount): MobileSettlementFlight[]`

- [ ] **Step 1: Write failing tests for action flights**

```ts
it("maps chip and fold tokens to hero-relative seats with bounded assets", () => {
  const flights = mobileActionFlights([
    token("chips", 4, { amount: 50, kind: "raise" }),
    token("fold", 1),
  ], 4, 6);
  expect(flights).toEqual([
    expect.objectContaining({ kind: "chips", visualSeat: 0, chipCount: 4 }),
    expect.objectContaining({ kind: "fold", visualSeat: 3, cardCount: 2 }),
  ]);
  expect(flights.reduce((sum, flight) => sum + (flight.chipCount ?? 0), 0)).toBeLessThanOrEqual(12);
});
```

- [ ] **Step 2: Run the action-flight test and verify RED**

Run: `npm test -- src/mobile/mobileTableMotion.test.ts`

Expected: FAIL because `mobileTableMotion.ts` does not exist.

- [ ] **Step 3: Implement the action-flight model**

```ts
export type MobileActionFlight =
  | { key: string; kind: "chips"; actorSeat: number; visualSeat: number; chipCount: number }
  | { key: string; kind: "fold"; actorSeat: number; visualSeat: number; cardCount: 2 };

export function mobileActionFlights(tokens: VisualToken[], heroSeat: number, playerCount: number) {
  return tokens.flatMap((token): MobileActionFlight[] => {
    if (token.actorSeat === undefined) return [];
    const visualSeat = mobileVisualSeat(token.actorSeat, heroSeat, playerCount);
    if (token.effect === "fold") return [{ key: `fold-${token.id}`, kind: "fold", actorSeat: token.actorSeat, visualSeat, cardCount: 2 }];
    if (token.effect !== "chips") return [];
    const chipCount = token.action?.kind === "all-in" ? 6 : (token.action?.amount ?? 0) >= 30 ? 4 : 3;
    return [{ key: `chips-${token.id}`, kind: "chips", actorSeat: token.actorSeat, visualSeat, chipCount }];
  });
}
```

- [ ] **Step 4: Write failing tests for single-winner, split-pot and side-pot flights**

```ts
it("uses settled pots without recalculating winners", () => {
  const result = {
    winners: [0, 2], summary: "平分", reason: "showdown" as const,
    pots: [
      { label: "主池", amount: 120, eligible: [0, 1, 2], winners: [0, 2] },
      { label: "边池 1", amount: 40, eligible: [1, 2], winners: [2] },
    ],
  };
  expect(mobileSettlementFlights(result, 0, 6)).toEqual([
    expect.objectContaining({ winnerSeat: 0, visualSeat: 0, amount: 60 }),
    expect.objectContaining({ winnerSeat: 2, visualSeat: 2, amount: 60 }),
    expect.objectContaining({ winnerSeat: 2, visualSeat: 2, amount: 40 }),
  ]);
});
```

- [ ] **Step 5: Implement settlement-flight mapping with a 12-chip cap**

```ts
export type MobileSettlementFlight = {
  key: string;
  winnerSeat: number;
  visualSeat: number;
  amount: number;
  chipCount: 2;
};

export function mobileSettlementFlights(result: GameResult | undefined, heroSeat: number, playerCount: number) {
  const pots = result?.pots ?? [];
  return pots.flatMap((pot, potIndex) => pot.winners.map((winnerSeat, winnerIndex) => ({
    key: `collect-${potIndex}-${winnerIndex}-${winnerSeat}`,
    winnerSeat,
    visualSeat: mobileVisualSeat(winnerSeat, heroSeat, playerCount),
    amount: Math.floor(pot.amount / pot.winners.length),
    chipCount: 2 as const,
  }))).slice(0, 6);
}
```

- [ ] **Step 6: Run model tests and commit**

Run: `npm test -- src/mobile/mobileTableMotion.test.ts`

Expected: PASS.

```bash
git add src/mobile/mobileTableMotion.ts src/mobile/mobileTableMotion.test.ts
git commit -m "feat: model mobile table motion"
```

### Task 2: 实现独立移动端动效层

**Files:**
- Create: `src/mobile/MobileTableEffects.tsx`
- Test: `src/mobile/MobileTableEffects.test.tsx`
- Modify: `src/mobile/MobilePokerTable.tsx`
- Modify: `src/mobile/MobilePokerTable.test.tsx`

**Interfaces:**
- Consumes: `game: GameState`, `phase: PlaybackPhase`, `tokens: VisualToken[]`
- Produces: `<MobileTableEffects game={game} phase={phase} tokens={visualTokens} />`

- [ ] **Step 1: Write failing component tests**

```tsx
it("renders real chip images and two card backs from the action model", () => {
  render(<MobileTableEffects game={game} phase="animating-chips" tokens={[chipToken, foldToken]} />);
  expect(screen.getByTestId("mobile-chip-flight").querySelectorAll("img")).toHaveLength(3);
  expect(screen.getByTestId("mobile-fold-flight").querySelectorAll("img")).toHaveLength(2);
});

it("renders one bounded collection bundle per settled winner allocation", () => {
  render(<MobileTableEffects game={settledGame} phase="settling-pot" tokens={[]} />);
  expect(screen.getAllByTestId("mobile-pot-award")).toHaveLength(3);
  expect(document.querySelectorAll(".mobile-pot-award img").length).toBeLessThanOrEqual(12);
});
```

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm test -- src/mobile/MobileTableEffects.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the non-interactive effect layer**

```tsx
export function MobileTableEffects({ game, phase, tokens }: Props) {
  const actions = mobileActionFlights(tokens, game.heroSeat, game.players.length);
  const awards = phase === "settling-pot"
    ? mobileSettlementFlights(game.result, game.heroSeat, game.players.length)
    : [];
  return <div className="mobile-table-effects" aria-hidden="true">
    {actions.map((flight) => flight.kind === "chips"
      ? <span className={`mobile-action-chip-flight toward-pot from-visual-seat-${flight.visualSeat}`} data-testid="mobile-chip-flight" key={flight.key}>{Array.from({ length: flight.chipCount }, (_, index) => <img src={wagerChipFor(flight.actorSeat + index)} alt="" key={index} />)}</span>
      : <span className={`mobile-fold-flight from-visual-seat-${flight.visualSeat}`} data-testid="mobile-fold-flight" key={flight.key}><img src={POKER_CARD_ASSETS.back} alt="" /><img src={POKER_CARD_ASSETS.back} alt="" /></span>)}
    {awards.map((award) => <span className={`mobile-pot-award to-visual-seat-${award.visualSeat}`} data-testid="mobile-pot-award" key={award.key}>{Array.from({ length: award.chipCount }, (_, index) => <img src={wagerChipFor(award.winnerSeat + index)} alt="" key={index} />)}</span>)}
  </div>;
}
```

- [ ] **Step 4: Integrate the layer and remove the old per-seat chip-flight markup**

Insert `<MobileTableEffects game={game} phase={phase} tokens={visualTokens} />` directly under `.mobile-table-ring`. Remove `chipToken`, `.mobile-chip-flight` markup and its `CSSProperties` dependency from `MobilePokerTable` so each action renders once.

- [ ] **Step 5: Mark receiving winners without changing stacks**

```ts
const receivingPot = phase === "settling-pot" && Boolean(game.result?.winners.includes(player.seat));
```

Append ` receiving-pot` to the seat class only when `receivingPot` is true. Add a test that non-winners never receive this class.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- src/mobile/MobileTableEffects.test.tsx src/mobile/MobilePokerTable.test.tsx src/game/useGamePlayback.test.tsx`

Expected: PASS.

```bash
git add src/mobile/MobileTableEffects.tsx src/mobile/MobileTableEffects.test.tsx src/mobile/MobilePokerTable.tsx src/mobile/MobilePokerTable.test.tsx
git commit -m "feat: animate mobile table actions"
```

### Task 3: 完成轨迹、呼吸和降级样式

**Files:**
- Modify: `src/mobile/mobile.css`
- Modify: `tests/mobile-visual.spec.ts`

**Interfaces:**
- Consumes: `.from-visual-seat-0..5`, `.to-visual-seat-0..5`, `.mobile-seat.thinking`, `.mobile-seat.receiving-pot`
- Produces: pointer-safe, bounded animations that do not overlap board, pot label, avatars or controls

- [ ] **Step 1: Extend visual tests with effect-layer safety contracts**

Add measurements and assertions:

```ts
effectLayerPointerEvents: getComputedStyle(document.querySelector(".mobile-table-effects")!).pointerEvents,
effectLayerWithinTable: (() => {
  const layer = document.querySelector(".mobile-table-effects")!.getBoundingClientRect();
  const table = document.querySelector(".mobile-poker-table")!.getBoundingClientRect();
  return layer.left >= table.left && layer.right <= table.right && layer.top >= table.top && layer.bottom <= table.bottom;
})(),
```

Expect `pointer-events` to equal `none` and the layer to stay inside the table at all three viewports.

- [ ] **Step 2: Run the visual test and verify RED**

Run: `npm run build && npx playwright test --config playwright.pwa.config.ts tests/mobile-visual.spec.ts`

Expected: FAIL because `.mobile-table-effects` has no bounded layout contract.

- [ ] **Step 3: Add base effect-layer and thinking styles**

```css
.mobile-table-effects{position:absolute;z-index:24;inset:0;overflow:hidden;pointer-events:none}
.mobile-seat.thinking .mobile-player-identity{animation:mobile-avatar-breathe 900ms ease-in-out infinite alternate}
.mobile-seat.receiving-pot .mobile-player-meta strong{animation:mobile-stack-win 360ms ease-out both}
@keyframes mobile-avatar-breathe{to{box-shadow:0 0 0 3px #e5b75455,0 0 22px #e5b754aa,0 4px 12px #000b}}
@keyframes mobile-stack-win{50%{color:#ffe199;transform:scale(1.16)}100%{color:#e7e1d0;transform:scale(1)}}
```

- [ ] **Step 4: Add seat-relative action and fold trajectories**

Define `--motion-x` and `--motion-y` for each `.from-visual-seat-N`, then animate real image assets toward the central pot. Fold cards use a two-stage keyframe: converge during 0–40%, then translate to the center during 40–100%. Keep each action between 260ms and 380ms.

- [ ] **Step 5: Add winner collection trajectories**

Define inverse destination vectors for `.to-visual-seat-N`. Start award bundles at the central pot, stagger their two chip images by 35ms, and complete within 420ms. Use `transform` and `opacity` only.

- [ ] **Step 6: Add reduced-motion override**

```css
@media (prefers-reduced-motion:reduce){
  .mobile-action-chip-flight img,.mobile-fold-flight img,.mobile-pot-award img,
  .mobile-seat.thinking .mobile-player-identity,.mobile-seat.receiving-pot .mobile-player-meta strong{
    animation:none!important;transition:none!important;
  }
}
```

- [ ] **Step 7: Run visual and focused motion tests, then commit**

Run: `npm run build && npx playwright test --config playwright.pwa.config.ts tests/mobile-visual.spec.ts`

Expected: 3 viewports PASS.

```bash
git add src/mobile/mobile.css tests/mobile-visual.spec.ts
git commit -m "style: finish mobile poker motion"
```

### Task 4: 全量回归、离线校验与交付

**Files:**
- Modify only if verification exposes a defect in the files listed by Tasks 1–3

**Interfaces:**
- Consumes: completed mobile motion implementation
- Produces: verified desktop/mobile build and LAN-ready PWA artifact

- [ ] **Step 1: Run all unit and interaction tests**

Run: `npm test`

Expected: all 57 test files and at least 302 tests PASS, including all newly added motion tests.

- [ ] **Step 2: Run static checks and production build**

Run: `npm run lint && npm run build && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 3: Verify the standalone mobile bundle**

Run: `npm run verify:mobile-bundle`

Expected: complete precache, no private identities, no API keys or secrets.

- [ ] **Step 4: Run mobile browser regression**

Run: `npx playwright test --config playwright.pwa.config.ts tests/mobile-visual.spec.ts`

Expected: 430×932, 430×760 and 932×430 all PASS with no control, board, avatar, wager or effect-layer overlap.

- [ ] **Step 5: Confirm the LAN artifact endpoints**

Run:

```bash
curl -I http://127.0.0.1:8765/mobile/
curl -I http://127.0.0.1:8765/mobile-app.js
```

Expected: both return HTTP 200 and `mobile-app.js` has a JavaScript content type.

- [ ] **Step 6: Commit any verification-only correction and report evidence**

If verification required no correction, do not create an empty commit. Report exact test counts, visual viewport count, bundle file count, commit hashes and the current LAN mobile URL.
