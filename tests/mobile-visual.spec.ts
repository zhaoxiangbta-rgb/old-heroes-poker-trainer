import { expect, test } from "@playwright/test";

for (const viewport of [{ name: "portrait", width: 430, height: 932 }, { name: "compact-portrait", width: 430, height: 760 }, { name: "landscape", width: 932, height: 430 }]) {
  test(`${viewport.name} keeps the live table and actions usable`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "移动导航" })).toBeVisible();
    await expect(page.locator(".mobile-poker-table")).toBeVisible();
    await expect(page.getByRole("region", { name: "行动选择" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "本街投入到" })).toBeVisible();
    await expect(page.locator(".mobile-centered-hole .suit-symbol")).toHaveCount(2);
    for (const suit of await page.locator(".mobile-centered-hole .suit-symbol").all()) {
      await expect(suit).toBeVisible();
    }
    await expect(page.locator(".mobile-pot")).toBeVisible();
    await expect(page.locator(".mobile-action-sheet")).toHaveCount(0);
    const metrics = await page.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      table: (() => { const r = document.querySelector(".mobile-poker-table")!.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; })(),
      controls: (() => { const r = document.querySelector(".mobile-floating-controls")!.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; })(),
      controlsOverlapTable: (() => {
        const controls = document.querySelector(".mobile-floating-controls")!.getBoundingClientRect();
        const table = document.querySelector(".mobile-poker-table")!.getBoundingClientRect();
        return controls.left < table.right && controls.right > table.left && controls.top < table.bottom && controls.bottom > table.top;
      })(),
      action: (() => { const r = document.querySelector(".mobile-floating-actions")!.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width:r.width }; })(),
      rail: (() => { const r = document.querySelector(".mobile-horizontal-bet-rail")!.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width:r.width, height:r.height }; })(),
      slider: (() => { const r = document.querySelector(".mobile-bet-slider")!.getBoundingClientRect(); return { width:r.width,height:r.height }; })(),
      dockHeight: document.querySelector(".mobile-floating-controls")!.getBoundingClientRect().height,
      hero: (() => { const r = document.querySelector(".mobile-seat-0")!.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; })(),
      board: (() => { const r = document.querySelector(".mobile-board")!.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; })(),
      avatarWidth: Math.max(...[...document.querySelectorAll(".mobile-player-identity")].map((avatar) => avatar.getBoundingClientRect().width)),
      boardCardWidth: document.querySelector(".mobile-board > *")!.getBoundingClientRect().width,
      heroCardWidth: document.querySelector(".mobile-floating-hole .card")!.getBoundingClientRect().width,
      railOverlapsBoard: (() => {
        const rail = document.querySelector(".mobile-horizontal-bet-rail")!.getBoundingClientRect();
        const board = document.querySelector(".mobile-board")!.getBoundingClientRect();
        return rail.left < board.right && rail.right > board.left && rail.top < board.bottom && rail.bottom > board.top;
      })(),
      avatarActionOverlaps: [...document.querySelectorAll(".mobile-seat")].filter((seat) => {
        const avatar = seat.querySelector(".mobile-player-identity")?.getBoundingClientRect();
        const action = seat.querySelector(".mobile-last-action")?.getBoundingClientRect();
        return avatar && action && avatar.left < action.right && avatar.right > action.left && avatar.top < action.bottom && avatar.bottom > action.top;
      }).length,
      statusAvatarOverlaps: [...document.querySelectorAll(".mobile-player-identity")].filter((avatar) => {
        const a = avatar.getBoundingClientRect();
        const status = document.querySelector(".mobile-table-status")!.getBoundingClientRect();
        return a.left < status.right && a.right > status.left && a.top < status.bottom && a.bottom > status.top;
      }).length,
      avatarMetaOverlaps: [...document.querySelectorAll(".mobile-seat")].filter((seat) => {
        const avatar = seat.querySelector(".mobile-player-identity")?.getBoundingClientRect();
        const meta = seat.querySelector(".mobile-player-meta")?.getBoundingClientRect();
        return avatar && meta && avatar.left < meta.right && avatar.right > meta.left && avatar.top < meta.bottom + 2 && avatar.bottom + 2 > meta.top;
      }).length,
      metaWagerOverlaps: [...document.querySelectorAll(".mobile-seat")].filter((seat) => {
        const meta = seat.querySelector(".mobile-player-meta")?.getBoundingClientRect();
        const wager = seat.querySelector(".mobile-wager")?.getBoundingClientRect();
        return meta && wager && meta.left < wager.right && meta.right > wager.left && meta.top < wager.bottom + 2 && meta.bottom + 2 > wager.top;
      }).length,
      opponentCardInfoOverlaps: [...document.querySelectorAll(".mobile-seat:not(.hero)")].filter((seat) => {
        const meta = seat.querySelector(".mobile-player-meta")?.getBoundingClientRect();
        const cards = [...seat.querySelectorAll(".mobile-hole .card")];
        return meta && cards.some((card) => {
          const c = card.getBoundingClientRect();
          return c.left < meta.right && c.right > meta.left && c.top < meta.bottom && c.bottom > meta.top;
        });
      }).length,
      opponentCardsOutOfBounds: [...document.querySelectorAll(".mobile-seat:not(.hero) .mobile-hole .card")].filter((card) => {
        const c = card.getBoundingClientRect();
        return c.left < 2 || c.right > innerWidth - 2;
      }).length,
      dockColumnOverlaps: (() => {
        const items = [".mobile-player-bankroll", ".mobile-centered-hole", ".mobile-right-actions"].map((selector) => document.querySelector(selector)!.getBoundingClientRect());
        return items.some((a, index) => items.slice(index + 1).some((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
      })(),
      undersizedActions: [...document.querySelectorAll(".mobile-right-actions button")].filter((button) => {
        const r = button.getBoundingClientRect(); return r.width < 44 || r.height < 42;
      }).length,
    }));
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.controlsOverlapTable).toBe(false);
    expect(metrics.action.left).toBeGreaterThanOrEqual(0);
    expect(metrics.action.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.action.bottom).toBeGreaterThan(0);
    expect(metrics.action.width).toBeLessThanOrEqual(130);
    expect(metrics.rail.left).toBeGreaterThanOrEqual(0);
    expect(metrics.rail.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.rail.width).toBeLessThanOrEqual(metrics.controls.right - metrics.controls.left + 1);
    expect(metrics.rail.width).toBeGreaterThan(220);
    expect(metrics.rail.width).toBeGreaterThan(metrics.rail.height * 4);
    expect(metrics.slider.width).toBeGreaterThan(metrics.slider.height * 4);
    if (viewport.width === 430) expect(metrics.dockHeight).toBeLessThanOrEqual(150);
    expect(metrics.hero.left).toBeGreaterThanOrEqual(0);
    expect(metrics.hero.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.board.left).toBeGreaterThanOrEqual(0);
    expect(metrics.board.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.avatarWidth).toBeGreaterThanOrEqual(44);
    expect(metrics.boardCardWidth).toBeGreaterThanOrEqual(46);
    expect(metrics.heroCardWidth).toBeGreaterThanOrEqual(52);
    expect(metrics.railOverlapsBoard).toBe(false);
    expect(metrics.avatarActionOverlaps).toBe(0);
    expect(metrics.statusAvatarOverlaps).toBe(0);
    expect(metrics.avatarMetaOverlaps).toBe(0);
    expect(metrics.metaWagerOverlaps).toBe(0);
    expect(metrics.opponentCardInfoOverlaps).toBe(0);
    expect(metrics.opponentCardsOutOfBounds).toBe(0);
    expect(metrics.dockColumnOverlaps).toBe(false);
    expect(metrics.undersizedActions).toBe(0);
    expect(metrics.table.bottom).toBeGreaterThan(metrics.board.bottom);
    await page.screenshot({ path: `test-results/mobile-${viewport.name}.png`, fullPage: true });
  });
}
