// Real extension UI, isolated storage and mocked network; no user profile or provider calls.
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const compiled = await build({
  entryPoints: ["extension/sidepanel.tsx"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: {
    FUSION_API_URL: '"https://offline-test.convex.site"',
    "process.env.NODE_ENV": '"production"',
  },
});
const css = readFileSync("dist/extension/sidepanel.css", "utf8");
const browser = await chromium.launch({
  ...(process.env.BRAVE_EXECUTABLE
    ? { executablePath: process.env.BRAVE_EXECUTABLE }
    : { channel: "chrome" }),
  headless: true,
});
const tokenA = "a".repeat(64),
  tokenB = "b".repeat(64);
const sample = {
  entropyCore: "Fictional wish",
  pacifyReply: "Fictional reply",
  finiteOpposites: "Two values",
  infiniteCaption: "A third possibility",
  ideaTitle: "Fictional idea",
  ideaConcept: "Fictional concept",
  ideaReason: "Fictional reason",
  genres: ["work"],
};
try {
  const context = await browser.newContext({
    locale: "ja-JP",
    viewport: { width: 380, height: 850 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(
    ({ tokenA }) => {
      const initial = {
        fusionToken: tokenA,
        geminiApiKey: "",
        fusionPreferences: {
          locale: "ja",
          skin: "a15",
          outputLanguage: "auto",
        },
        freeTrialRemaining: 3,
        lastSelectedText: "legacy input",
      };
      window.saved =
        JSON.parse(localStorage.getItem("mock-storage") || "null") || initial;
      window.selected = {
        lastSelectedText: "Fictional selected text",
        lastSelectedTime: Date.now(),
      };
      window.opened = [];
      window.listeners = [];
      window.accessLevel = "";
      const area = (store, persistent) => ({
        get: async (keys) =>
          Object.fromEntries(
            keys.filter((key) => key in store).map((key) => [key, store[key]]),
          ),
        set: async (value) => {
          Object.assign(store, value);
          if (persistent)
            localStorage.setItem("mock-storage", JSON.stringify(store));
        },
        remove: async (keys) => {
          for (const key of typeof keys === "string" ? [keys] : keys)
            delete store[key];
          if (persistent)
            localStorage.setItem("mock-storage", JSON.stringify(store));
        },
        setAccessLevel: async ({ accessLevel }) => {
          window.accessLevel = accessLevel;
        },
      });
      window.chrome = {
        storage: {
          local: area(window.saved, true),
          session: area(window.selected, false),
        },
        tabs: {
          create: async (value) => {
            window.opened.push(value.url);
          },
        },
        runtime: {
          getManifest: () => ({ version: "0.3.0" }),
          onMessage: {
            addListener: (fn) => window.listeners.push(fn),
            removeListener: (fn) => {
              window.listeners = window.listeners.filter((old) => old !== fn);
            },
          },
        },
      };
    },
    { tokenA },
  );
  const page = await context.newPage();
  const errors = [],
    blocked = [],
    generations = [],
    publications = [],
    googleCalls = [];
  let balance = 9,
    accountLinked = true,
    expired = false,
    failPair = false;
  let liked = false,
    withdrawn = false,
    generationFailure = false;
  const ideas = Array.from({ length: 26 }, (_, i) => ({
    ...sample,
    id: `idea-${i}`,
    ideaTitle: `Idea ${i}`,
    createdAt: 1000 + i,
    mode: "lab",
    liked: false,
  }));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin === "https://extension.test")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    let data,
      status = 200;
    const body = req.method() === "POST" ? req.postDataJSON() : undefined;
    if (url.hostname === "generativelanguage.googleapis.com") {
      googleCalls.push({ headers: req.headers(), body });
      const safety = JSON.stringify(body).includes("has_pii");
      data = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify(
                    safety ? { has_pii: false, is_threat: false } : sample,
                  ),
                },
              ],
            },
          },
        ],
      };
    } else if (url.origin === "https://offline-test.convex.site") {
      assert.ok(
        !JSON.stringify(req.headers()).includes("test-gemini-key"),
        "BYOK key must never reach Convex",
      );
      if (url.pathname !== "/api/session/redeem")
        assert.match(req.headers().authorization || "", /^Bearer [ab]{64}$/);
      switch (url.pathname) {
        case "/api/extension/connection":
          data = {
            connected: !expired,
            accountLinked: accountLinked && !expired,
            expired,
            balance,
            expiresAt: Date.now() + 86400000,
          };
          break;
        case "/api/incense/balance":
          data = { balance };
          break;
        case "/api/fusion/free-trial":
          generations.push(body);
          if (generationFailure) {
            status = 400;
            data = { error: "AIの処理に失敗しました。" };
          } else {
            balance--;
            data = { result: sample };
          }
          break;
        case "/api/fusion/check-safety":
          data = { sanitizedText: body.text, options: body.options };
          break;
        case "/api/fusion/save":
          publications.push(body);
          data = { id: "published-test" };
          break;
        case "/api/fusion/delete":
          withdrawn = true;
          data = { success: true };
          break;
        case "/api/fusion/like":
          liked = body.liked;
          data = { liked };
          break;
        case "/api/fusion/liked":
          data = {
            items: liked ? [{ ...ideas[0], liked: true }] : [],
            isDone: true,
          };
          break;
        case "/api/fusion/mine":
          data = { items: withdrawn ? [] : [ideas[0]], isDone: true };
          break;
        case "/api/fusion/list": {
          const items = accountLinked
            ? url.searchParams.get("cursor")
              ? ideas.slice(20)
              : ideas.slice(0, 20)
            : ideas.slice(0, 5);
          data = {
            items: items
              .filter(
                (item) =>
                  !url.searchParams.get("genre") ||
                  item.genres.includes(url.searchParams.get("genre")),
              )
              .map((item) => ({
                ...item,
                liked: item.id === "idea-0" && liked,
              })),
            isDone: !accountLinked || !!url.searchParams.get("cursor"),
            cursor: "next",
          };
          break;
        }
        case "/api/session/redeem":
          if (failPair) {
            status = 400;
            data = { error: "接続コードが無効です。" };
          } else {
            accountLinked = true;
            expired = false;
            data = { token: tokenB };
          }
          break;
        case "/api/extension/disconnect":
          data = { success: true };
          break;
        case "/api/incense/create-checkout":
          data = { url: "https://checkout.stripe.com/c/pay/mock" };
          break;
        default:
          throw new Error(`Unexpected API ${url.pathname}`);
      }
    } else {
      blocked.push(url.href);
      return route.abort();
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  async function mount() {
    await page.goto("https://extension.test/");
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    await expect(page.locator(".composer textarea")).toHaveValue(
      "Fictional selected text",
    );
    await expect(page.locator(".composer .primary")).toBeEnabled();
  }
  const nav = (name) =>
    page.getByRole("navigation").getByRole("button", { name, exact: true });
  await mount();
  assert.equal(
    await page.evaluate(() => window.accessLevel),
    "TRUSTED_CONTEXTS",
  );
  assert.equal(await page.evaluate(() => window.saved.fusionToken), tokenA);
  assert.equal(
    await page.evaluate(
      () =>
        "freeTrialRemaining" in window.saved ||
        "lastSelectedText" in window.saved,
    ),
    false,
  );
  assert.deepEqual(await page.evaluate(() => window.selected), {});
  await expect(
    page.getByText("利用回数：残り9回", { exact: true }),
  ).toBeVisible();
  for (const skin of ["a15", "b", "c", "t"]) {
    await page.getByLabel("モード", { exact: true }).selectOption(skin);
    await expect(page.locator("html")).toHaveAttribute("data-skin", skin);
    for (const width of [320, 440, 600]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${skin} overflow at ${width}`,
      );
      if (process.env.EXTENSION_SCREENSHOTS) {
        mkdirSync(process.env.EXTENSION_SCREENSHOTS, { recursive: true });
        await page.screenshot({
          path: `${process.env.EXTENSION_SCREENSHOTS}/${skin}-${width}.png`,
          fullPage: true,
        });
      }
    }
  }
  await page.setViewportSize({ width: 380, height: 850 });
  await page.getByLabel("返信・アイデアの言語").selectOption("fr");
  await page.locator(".composer .primary").click();
  await expect(page.locator(".result-workspace")).toBeVisible();
  assert.equal(generations[0].options.mode, "steps");
  assert.equal(generations[0].options.outputLanguage, "fr");
  assert.equal(await page.locator(".refinement").getAttribute("open"), null);
  await page.getByRole("button", { name: "返信をコピー", exact: true }).click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    sample.pacifyReply,
  );
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "テキストを保存", exact: true })
    .click();
  assert.match((await downloadEvent).suggestedFilename(), /^monku-fusion-/);
  await page.locator(".refinement summary").click();
  await page.locator("#revision-feedback").fill("Keep the original wish");
  await page.locator(".refinement .primary").click();
  await expect(
    page.getByLabel("このページで作った結果を見比べる"),
  ).toBeVisible();
  assert.equal(
    generations[1].options.revision.feedback,
    "Keep the original wish",
  );
  assert.equal(publications.length, 0);
  await page.locator(".publish-panel summary").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "確認して公開する", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "公開を取り下げる", exact: true }),
  ).toBeVisible();
  assert.equal(publications[0].mode, "steps");
  assert.deepEqual(publications[0].genres, ["work"]);
  assert.equal(publications[0].publishConsent, true);
  assert.equal("noiseText" in publications[0], false);
  const beforeFailure = balance;
  generationFailure = true;
  await page.locator(".composer .primary").click();
  await expect(page.getByRole("status")).toContainText("AIの処理に失敗");
  await expect(page.locator(".result-workspace")).toBeVisible();
  assert.equal(balance, beforeFailure);
  generationFailure = false;
  await nav("アイデア").click();
  await expect(page.locator(".archive-item")).toHaveCount(20);
  await page.getByRole("button", { name: "さらに表示", exact: true }).click();
  await expect(page.locator(".archive-item")).toHaveCount(26);
  await page
    .locator(".archive-item")
    .first()
    .getByRole("button", { name: "♡ いいね", exact: true })
    .click();
  await page.getByRole("button", { name: "いいね", exact: true }).click();
  await expect(page.locator(".archive-item")).toHaveCount(1);
  await page
    .locator(".archive-item")
    .first()
    .getByRole("button", { name: "♥ いいね済み", exact: true })
    .click();
  await expect(page.locator(".archive-item")).toHaveCount(0);
  await page.getByRole("button", { name: "自分の投稿", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "公開を取り下げる", exact: true })
    .click();
  await expect(page.locator(".archive-item")).toHaveCount(0);
  await nav("設定").click();
  await page.getByRole("button", { name: "Webを開く", exact: true }).click();
  assert.equal(
    (await page.evaluate(() => window.opened)).at(-1),
    "https://fusion.monku.ai/?view=settings",
  );
  await page.getByText("自分のGemini APIキーで使う", { exact: true }).click();
  await page.getByLabel("APIキー", { exact: true }).fill("test-gemini-key");
  await page.getByRole("button", { name: "キーを保存", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.saved.geminiApiKey))
    .toBe("test-gemini-key");
  await nav("つくる").click();
  const before = balance;
  await page.locator(".composer .primary").click();
  await expect.poll(() => googleCalls.length).toBeGreaterThan(0);
  await expect(page.locator(".composer .primary")).toBeEnabled();
  assert.equal(balance, before);
  await page.evaluate(() =>
    window.listeners.forEach((fn) =>
      fn({ type: "FUSION_TARGET_RECEIVED", text: "New selection" }),
    ),
  );
  await expect(
    page.getByRole("button", { name: "選択した文章を使う", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#noise")).toHaveValue("Fictional selected text");
  await page
    .getByRole("button", { name: "選択した文章を使う", exact: true })
    .click();
  await expect(page.locator("#noise")).toHaveValue("New selection");
  for (const language of ["en", "fr", "ja"]) {
    await page.locator(".language-switch select").selectOption(language);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await mount();
  assert.equal(
    await page.evaluate(() => window.saved.geminiApiKey),
    "test-gemini-key",
  );
  assert.equal(await page.evaluate(() => window.saved.fusionToken), tokenA);
  await expect(page.getByLabel("モード", { exact: true })).toHaveValue("t");
  await expect(page.getByLabel("返信・アイデアの言語")).toHaveValue("fr");
  await expect(page.locator(".result-workspace")).toHaveCount(0);
  await nav("設定").click();
  await page.getByText("自分のGemini APIキーで使う", { exact: true }).click();
  await page.getByRole("button", { name: "キーを消去", exact: true }).click();
  assert.equal(await page.evaluate(() => window.saved.geminiApiKey), undefined);
  await page.getByLabel("接続コード", { exact: true }).fill("test-code");
  failPair = true;
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "接続する", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("接続コードが無効");
  assert.equal(await page.evaluate(() => window.saved.fusionToken), tokenA);
  failPair = false;
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "接続する", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.saved.fusionToken))
    .toBe(tokenB);
  accountLinked = false;
  await page
    .getByRole("button", { name: "接続・残数を更新", exact: true })
    .click();
  await nav("アイデア").click();
  await expect(page.locator(".archive-item")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "自分の投稿", exact: true }),
  ).toHaveCount(0);
  accountLinked = true;
  expired = true;
  await nav("設定").click();
  await page
    .getByRole("button", { name: "接続・残数を更新", exact: true })
    .click();
  await expect(page.getByText(/^接続の有効期限が切れました/)).toBeVisible();
  assert.equal(await page.evaluate(() => window.saved.fusionToken), tokenB);
  await nav("つくる").click();
  await expect(page.locator(".composer .primary")).toBeDisabled();
  await nav("設定").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "この接続を解除", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.saved.fusionToken))
    .toBeUndefined();
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  console.log(
    "Extension QA passed: 4 skins / 3 languages / 320–600px, balance migration, generation/revision/BYOK/export/publication, pagination/likes/own posts, reconnect/expiry/revoke, safe selection; no external requests.",
  );
} finally {
  await browser.close();
}
