import { expect, test } from "@playwright/test";

test("a wager responds immediately and throws chips toward the pot", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const primary = page.getByRole("button", { name: "确认金额" });
  await expect(primary).toBeVisible();
  await primary.click();
  await expect(page.getByTestId("submit-receipt")).toContainText("✓", { timeout: 100 });
  await expect(page.locator(".flying-wager").first()).toBeVisible({ timeout: 800 });
  await expect(page.locator(".flying-wager img").first()).toHaveAttribute("src", /wager-/);
});

test("folding closes the cards and leaves the seat visibly inactive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "弃牌" }).click();
  await page.getByRole("button", { name: "确认弃牌" }).click();
  await expect(page.locator(".fold-flight").first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".seat.hero")).toHaveClass(/folded/);
  await expect(page.locator(".seat.hero .player-seat-avatar")).toHaveCSS("filter", /grayscale/);
});
