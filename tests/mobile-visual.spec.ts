import { expect, test } from "@playwright/test";

for (const viewport of [{ name: "portrait", width: 430, height: 932 }, { name: "landscape", width: 932, height: 430 }]) {
  test(`${viewport.name} keeps the live table and actions usable`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "移动导航" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ALL IN" })).toBeVisible();
    const metrics = await page.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      action: (() => { const r = document.querySelector(".action-area")!.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })(),
    }));
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.action.left).toBeGreaterThanOrEqual(0);
    expect(metrics.action.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.action.bottom).toBeGreaterThan(0);
    if (viewport.name === "landscape") {
      const layout = await page.evaluate(() => {
        const table = document.querySelector(".felt")!.getBoundingClientRect();
        const action = document.querySelector(".action-area")!.getBoundingClientRect();
        const teaching = document.querySelector("aside")!.getBoundingClientRect();
        return { table: { left: table.left, right: table.right, top: table.top, bottom: table.bottom }, action: { left: action.left, right: action.right, top: action.top, bottom: action.bottom }, teaching: { left: teaching.left, right: teaching.right, top: teaching.top, bottom: teaching.bottom } };
      });
      const tableActionOverlap = layout.table.left < layout.action.right && layout.table.right > layout.action.left && layout.table.top < layout.action.bottom && layout.table.bottom > layout.action.top;
      expect(tableActionOverlap).toBe(false);
      expect(layout.teaching.left).toBeGreaterThanOrEqual(viewport.width * .6);
      expect(layout.teaching.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(layout.teaching.bottom).toBeLessThanOrEqual(viewport.height - 48);
    }
    await page.screenshot({ path: `test-results/mobile-${viewport.name}.png`, fullPage: true });
  });
}
