// Load the built Manifest V3 package in an isolated Chromium profile.
// Storage and browser APIs are real; all backend requests are intercepted.
import { chromium, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const profile = await mkdtemp(resolve(tmpdir(), "fusion-extension-qa-"));
const extension = resolve("dist/extension");
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    locale: "ja-JP",
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const errors = [],
    blocked = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "chrome-extension:") return route.continue();
    if (
      url.origin === "https://hip-hound-497.convex.site" &&
      url.pathname === "/api/extension/connection"
    ) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          connected: true,
          accountLinked: true,
          expired: false,
          balance: 9,
          expiresAt: Date.now() + 86400000,
        }),
      });
    }
    blocked.push(url.href);
    return route.abort();
  });
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      fusionToken: "a".repeat(64),
      geminiApiKey: "fictional-key",
      fusionPreferences: { locale: "fr", skin: "b", outputLanguage: "ja" },
    });
    await chrome.storage.session.set({
      lastSelectedText: "Fictional selected text",
      lastSelectedTime: Date.now(),
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await expect(page.locator("#noise")).toHaveValue("Fictional selected text");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("html")).toHaveAttribute("data-skin", "b");
  await expect(page.locator(".composer .primary")).toBeEnabled();
  assert.equal(
    await worker.evaluate(
      async () =>
        (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
    ),
    true,
  );
  assert.equal(
    await worker.evaluate(() => chrome.runtime.getManifest().version),
    "0.3.0",
  );
  assert.deepEqual(
    await worker.evaluate(() => chrome.storage.session.get(null)),
    {},
  );
  await page.locator("#noise").fill("Unsaved private draft");
  await page.reload();
  await expect(page.locator("#noise")).toHaveValue("");
  await expect(page.locator("html")).toHaveAttribute("data-skin", "b");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  assert.equal(
    await worker.evaluate(
      async () => (await chrome.storage.local.get("geminiApiKey")).geminiApiKey,
    ),
    "fictional-key",
  );
  await worker.evaluate(() =>
    chrome.runtime.sendMessage({
      type: "FUSION_TARGET_RECEIVED",
      text: "Another selection",
    }),
  );
  await expect(
    page.getByRole("button", {
      name: "Utiliser le texte sélectionné",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Utiliser le texte sélectionné", exact: true })
    .click();
  await expect(page.locator("#noise")).toHaveValue("Another selection");
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  console.log(
    "Installed package QA passed: Manifest V3, real local/session storage, locale, theme, toolbar side-panel configuration, selection messaging, reload privacy and CSP; mocked network only.",
  );
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
