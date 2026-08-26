import { expect, test } from "@playwright/test";

test("mobile app restarts from its cache while offline", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "移动导航" })).toBeVisible();
  await expect(page.getByText("已可离线使用")).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.evaluate(() => location.reload());

  await expect(page.getByRole("navigation", { name: "移动导航" })).toBeVisible();
  await expect(page.getByText("当前离线运行")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".mobile-poker-table")).toBeVisible();
  await expect(page.getByRole("region", { name: "行动选择" })).toBeVisible();
  const slider = page.getByRole("slider", { name: "本街投入到" });
  await expect(slider).toBeVisible();
  await slider.fill(await slider.getAttribute("max") ?? "0");
  await expect(page.getByTestId("mobile-rail-amount")).toHaveText("ALL IN");
  await page.getByRole("button", { name: "ALL IN", exact: true }).click();
  await expect(page.getByRole("region", { name: "行动选择" })).toBeHidden();
});

test("manifest and service worker are scoped to the published subdirectory", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect(await manifest.json()).toMatchObject({ start_url: "./", scope: "./", display: "standalone" });
  const worker = await request.get("/service-worker.js");
  expect(worker.ok()).toBeTruthy();
  expect(await worker.text()).toContain("old-heroes-pwa-");
});
