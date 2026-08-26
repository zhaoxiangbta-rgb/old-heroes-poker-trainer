import { expect, test } from "@playwright/test";

for (const viewport of [{ name: "portrait", width: 430, height: 932 }, { name: "landscape", width: 932, height: 430 }]) {
  test(`${viewport.name} keeps the live table and actions usable`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "移动导航" })).toBeVisible();
    await expect(page.locator(".mobile-poker-table")).toBeVisible();
    await expect(page.getByRole("region", { name: "行动选择" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "本街投入到" })).toBeVisible();
    await expect(page.locator(".mobile-pot")).toBeVisible();
    await expect(page.locator(".mobile-action-sheet")).toHaveCount(0);
    const metrics = await page.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      table: (() => { const r = document.querySelector(".mobile-poker-table")!.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; })(),
      action: (() => { const r = document.querySelector(".mobile-floating-actions")!.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width:r.width }; })(),
      rail: (() => { const r = document.querySelector(".mobile-bet-rail")!.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width:r.width }; })(),
      hero: (() => { const r = document.querySelector(".mobile-seat-0")!.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; })(),
      board: (() => { const r = document.querySelector(".mobile-board")!.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; })(),
    }));
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.action.left).toBeGreaterThanOrEqual(0);
    expect(metrics.action.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.action.bottom).toBeGreaterThan(0);
    expect(metrics.action.width).toBeLessThanOrEqual(130);
    expect(metrics.rail.left).toBeGreaterThanOrEqual(0);
    expect(metrics.rail.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.rail.width).toBeLessThanOrEqual(90);
    expect(metrics.hero.left).toBeGreaterThanOrEqual(0);
    expect(metrics.hero.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.board.left).toBeGreaterThanOrEqual(0);
    expect(metrics.board.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.table.bottom).toBeGreaterThan(metrics.board.bottom);
    await page.screenshot({ path: `test-results/mobile-${viewport.name}.png`, fullPage: true });
  });
}
