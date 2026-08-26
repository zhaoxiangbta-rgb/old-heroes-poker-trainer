import { expect, test } from "@playwright/test";

test("embedded LAN bundle boots in WebKit without a black screen", async ({ page }) => {
  const url = process.env.LAN_TEST_URL;
  test.skip(!url, "requires a running desktop LAN service");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(url!, { waitUntil: "networkidle" });
  await expect(page.getByRole("navigation")).toBeVisible();
  expect(errors).toEqual([]);
});

test("embedded LAN page does not depend on a second main-script request", async ({ page }) => {
  const url = process.env.LAN_TEST_URL;
  test.skip(!url, "requires a running desktop LAN service");
  await page.route(/\/mobile-app\.js$/, (route) => route.abort());
  await page.goto(url!);
  await expect(page.getByRole("navigation")).toBeVisible();
});
