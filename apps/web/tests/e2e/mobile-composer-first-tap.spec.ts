import { expect, test } from "@playwright/test";

import { readRelayEnv } from "./support/relay-env";

test("focuses the mobile composer on the first tap in iOS WebKit", async ({ page }) => {
  const { RELAY_ACCESS_PASSWORD: password } = readRelayEnv();
  test.skip(!password, "RELAY_ACCESS_PASSWORD is required for the protected /mobile route.");

  await page.goto("/login?next=%2Fmobile", { waitUntil: "networkidle" });
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/mobile", { waitUntil: "networkidle" });

  const main = page.locator("main.mobile-app");
  const composer = page.locator(".mobile-composer");
  const composerShell = page.locator(".mobile-composer-input-shell");
  const textarea = page.locator("textarea.mobile-composer-input");

  await expect(main).toHaveClass(/mobile-app/);

  const beforeBox = await composer.boundingBox();
  if (!beforeBox) {
    throw new Error("mobile composer was not rendered before the first tap");
  }
  const beforeComposerTop = await composer.evaluate((element) => getComputedStyle(element).top);
  const beforeFallbackReserve = await main.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--mobile-keyboard-fallback-reserve").trim(),
  );

  await composerShell.click();
  await expect(textarea).toBeFocused();

  const afterBox = await composer.boundingBox();
  if (!afterBox) {
    throw new Error("mobile composer was not rendered after the first tap");
  }
  const afterComposerTop = await composer.evaluate((element) => getComputedStyle(element).top);
  const afterFallbackReserve = await main.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--mobile-keyboard-fallback-reserve").trim(),
  );

  expect(afterBox.y).toBeGreaterThanOrEqual(0);
  expect(afterBox.height).toBe(beforeBox.height);
  expect(afterFallbackReserve).not.toBe(beforeFallbackReserve);
  expect(afterFallbackReserve).not.toBe("0px");
  expect(afterComposerTop).not.toBe(beforeComposerTop);
});
