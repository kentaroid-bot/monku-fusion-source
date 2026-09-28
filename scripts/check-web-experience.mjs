// Isolated browser regression: all provider, account and publication calls are mocked.
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const mocks = {
  "@clerk/react": `const auth = { isLoaded:true, isSignedIn:true, userId:"test-user", sessionClaims:{aud:"convex"}, getToken:async()=>"test-account-token" }; export const useAuth=()=>window.anonymous ? {...auth,isSignedIn:false,userId:null} : auth; export const UserButton=()=>null;`,
  OptionalClerkProvider: `export const clerkAvailable=true; export default ({children})=>children;`,
  "next/link": `import {createElement} from "react"; export default props=>createElement("a",props);`,
  "next/script": `export default ()=>null;`,
};
const compiled = await build({
  stdin: {
    contents:
      'import {createRoot} from "react-dom/client"; import Home from "./src/app/page"; import Legal from "./src/components/LegalDocument"; import Success from "./src/app/osaisen/success/page"; createRoot(document.getElementById("root")).render(location.pathname === "/payment" ? <Success/> : location.pathname === "/" ? <Home/> : <Legal kind={location.pathname.slice(1)}/>);',
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_CONVEX_SITE_URL":
      '"https://offline-test.convex.site"',
    "process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY": '""',
  },
  plugins: [
    {
      name: "offline",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^@clerk\/react$|OptionalClerkProvider$|^next\/(link|script)$/,
          },
          ({ path }) => ({
            path: path.endsWith("OptionalClerkProvider")
              ? "OptionalClerkProvider"
              : path,
            namespace: "offline",
          }),
        );
        b.onLoad({ filter: /.*/, namespace: "offline" }, ({ path }) => ({
          contents: mocks[path],
          loader: "js",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
// The app stylesheet uses Tailwind's reset; use the built stylesheet for visual parity.
const cssPath = process.env.EXPERIENCE_CSS;
const css = cssPath
  ? readFileSync(cssPath, "utf8")
  : readFileSync("src/app/globals.css", "utf8").replace(
      '@import "tailwindcss";',
      "",
    );
const browser = await chromium.launch({
  ...(process.env.BRAVE_EXECUTABLE
    ? { executablePath: process.env.BRAVE_EXECUTABLE }
    : { channel: "chrome" }),
  headless: true,
});
const fields = [
  "entropyCore",
  "pacifyReply",
  "finiteOpposites",
  "infiniteCaption",
  "ideaTitle",
  "ideaConcept",
  "ideaReason",
];
const original = Object.fromEntries(
  fields.map((f) => [
    f,
    f === "ideaTitle" ? "Mock idea one" : "Mock result: " + f,
  ]),
);
const revised = {
  ...original,
  ideaTitle: "Mock idea two",
  entropyCore: "Keep uninterrupted work time",
};
const requests = [],
  failures = [],
  errors = [];
let failNext = false;
let retirementAccepted = false;
const screenshotDir =
  process.env.EXPERIENCE_SCREENSHOTS || "/tmp/fusion-web-experience";
mkdirSync(screenshotDir, { recursive: true });
try {
  const context = await browser.newContext({
    locale: "ja-JP",
    viewport: { width: 1280, height: 920 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin === "https://fusion.test")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',
      });
    if (
      url.origin !== "https://offline-test.convex.site" &&
      url.origin !== "https://generativelanguage.googleapis.com"
    ) {
      failures.push(req.url());
      return route.abort();
    }
    const body = req.postData() ? req.postDataJSON() : undefined;
    requests.push({
      path: url.pathname,
      search: url.search,
      body,
      headers: req.headers(),
    });
    let data,
      status = 200;
    if (url.origin === "https://generativelanguage.googleapis.com")
      data = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    ...revised,
                    genres: ["learning", "life"],
                  }),
                },
              ],
            },
          },
        ],
      };
    else if (url.pathname === "/api/account/status")
      data = { linked: true, balance: 9 };
    else if (url.pathname === "/api/incense/balance") data = { balance: 9 };
    else if (url.pathname === "/api/fusion/free-trial") {
      if (failNext) {
        status = 400;
        data = { error: "安全確認に失敗しました。" };
        failNext = false;
      } else
        data = {
          result: body.options.revision
            ? { ...revised, genres: ["learning", "life"] }
            : { ...original, genres: ["work"] },
        };
    } else if (url.pathname === "/api/fusion/check-safety")
      data = { sanitizedText: body.text, options: body.options };
    else if (url.pathname === "/api/fusion/save")
      data = { id: "mock-publication" };
    else if (url.pathname === "/api/fusion/delete") data = { ok: true };
    else if (url.pathname === "/api/incense/verify-session")
      data = { ok: true };
    else if (url.pathname === "/api/account/retire") {
      retirementAccepted = true;
      data = { accepted: true };
    } else if (url.pathname === "/api/account/retire-status")
      data = { status: retirementAccepted ? "complete" : "unknown" };
    else if (
      ["/api/fusion/list", "/api/fusion/liked", "/api/fusion/mine"].includes(
        url.pathname,
      )
    )
      data = {
        items: [
          {
            ...original,
            id: "archive-one",
            createdAt: 0,
            monku: "Publisher reviewed context",
            mode: "lab",
            genres: ["work"],
          },
          { ...original, id: "archive-old", createdAt: 0 },
        ]
          .filter(
            (item) =>
              !url.searchParams.get("genre") ||
              item.genres?.includes(url.searchParams.get("genre")),
          )
          .map((item) => ({
            ...item,
            liked: url.pathname === "/api/fusion/liked",
          })),
        isDone: true,
      };
    else throw new Error("Unexpected API: " + url.pathname);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  async function mount(page, path = "/") {
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("https://fusion.test" + path);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
  }
  const page = await context.newPage();
  await mount(page);
  await page.getByText("利用回数：残り9回", { exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-skin"), "a15");
  await page.screenshot({
    path: screenshotDir + "/a15-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "例文を入れる", exact: true }).click();
  const input = await page.locator("#noise").inputValue();
  assert.ok(input.includes("会議"));
  await page.getByRole("button", { name: "1回分で生成する" }).click();
  await page.getByRole("region", { name: "生成結果" }).waitFor();
  await page
    .getByRole("button", { name: "結果全体をコピー", exact: true })
    .click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.includes(input));
  assert.ok(copied.includes("ジャンル: 働き方"));
  for (const value of Object.values(original))
    assert.ok(copied.includes(value));
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "テキストを保存", exact: true })
    .click();
  const download = await downloadEvent;
  assert.match(download.suggestedFilename(), /\.txt$/);
  assert.equal(readFileSync(await download.path(), "utf8"), copied);
  assert.equal(requests.filter((r) => r.path === "/api/fusion/save").length, 0);
  // Changing appearance and output language cannot silently regenerate or replace a result.
  await page.getByRole("button", { name: "設定", exact: true }).click();
  assert.equal(await page.locator(".mode-description").count(), 4);
  assert.equal(
    await page.getByRole("combobox", { name: "モード", exact: true }).count(),
    0,
  );
  await page.locator(".mode-description.skin-b").click();
  assert.equal(
    await page.locator(".mode-description.skin-b").getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "つくる", exact: true }).click();
  assert.equal(
    await page.getByLabel("モード", { exact: true }).inputValue(),
    "b",
  );
  assert.equal(await page.locator("#noise").inputValue(), input);
  await page.getByLabel("画面の言語", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const output = page.getByLabel("Language of the generated result");
  assert.equal(await output.inputValue(), "auto");
  await output.selectOption("en");
  assert.ok(
    (
      await page.getByRole("region", { name: "Generated result" }).innerText()
    ).includes("Yohaku"),
  );
  assert.equal(
    requests.filter((r) => r.path === "/api/fusion/free-trial").length,
    1,
  );
  assert.equal(await page.locator(".refinement").getAttribute("open"), null);
  assert.equal(
    await page
      .getByRole("button", { name: "Rework this part", exact: true })
      .count(),
    0,
  );
  await page.locator(".refinement > summary").click();
  await page
    .getByRole("button", { name: "Rework this part", exact: true })
    .first()
    .click();
  assert.equal(
    await page.getByLabel("Part to rework", { exact: true }).inputValue(),
    "entropyCore",
  );
  await page
    .locator("#revision-feedback")
    .fill("Keep my boundary; do not make me agreeable.");
  failNext = true;
  await page
    .getByRole("button", {
      name: "Create a revision using the method above",
      exact: true,
    })
    .click();
  await page.getByRole("status").filter({ hasText: "safety check" }).waitFor();
  assert.ok(
    (await page.locator(".result-fields").innerText()).includes(
      original.ideaTitle,
    ),
  );
  assert.equal(
    await page.locator("#revision-feedback").inputValue(),
    "Keep my boundary; do not make me agreeable.",
  );
  await page
    .getByRole("button", {
      name: "Create a revision using the method above",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", { name: "Compare results from this page" })
    .waitFor();
  await page
    .getByText("Compare with the previous result", { exact: true })
    .click();
  assert.ok(
    (await page.locator(".result-workspace").innerText()).includes(
      original.entropyCore,
    ),
  );
  const generated = requests
    .filter((r) => r.path === "/api/fusion/free-trial")
    .at(-1).body;
  assert.equal(generated.noiseText, input);
  assert.equal(generated.options.mode, "lab");
  assert.equal(generated.options.outputLanguage, "en");
  assert.deepEqual(generated.options.revision.previous, original);
  const history = page.getByRole("combobox", {
    name: "Compare results from this page",
  });
  await history.selectOption({ index: 0 });
  assert.ok(
    (await page.locator(".result-fields").innerText()).includes(
      original.ideaTitle,
    ),
  );
  await history.selectOption({ index: 1 });
  await page.getByText("Publish this idea", { exact: true }).click();
  await page.locator("#public-monku").fill("My reviewed context");
  await page.getByRole("checkbox", { name: "Learning", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Work", exact: true }).check();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Relationships", exact: true })
      .isEnabled(),
    false,
  );
  // Saving a different current skin cannot change the mode recorded on this result.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByLabel("Mode", { exact: true }).selectOption("c");
  assert.equal(
    await page.getByRole("checkbox", { name: "Work", exact: true }).isChecked(),
    true,
  );
  assert.ok(
    (await page.locator(".result-workspace .idea-tags").innerText()).includes(
      "Monku Labo",
    ),
  );
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Review and publish", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Withdraw publication", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("checkbox", { name: "Work", exact: true }).isEnabled(),
    false,
  );
  const published = requests.find((r) => r.path === "/api/fusion/save").body;
  assert.deepEqual(published, {
    result: revised,
    monku: "My reviewed context",
    mode: "lab",
    genres: ["work", "life"],
    publishConsent: true,
  });
  await page
    .getByRole("button", { name: "Withdraw publication", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByLabel("Mode", { exact: true }).selectOption("b");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(await page.locator(".byok-settings").getAttribute("open"), null);
  await page.locator(".byok-settings > summary").click();
  await page
    .getByLabel("API key", { exact: true })
    .fill("mock-page-only-api-key");
  await page
    .getByRole("button", { name: "Back to your input", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate with my key" }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".result-workspace select option").length >=
      3 + 8,
  );
  const ownKey = requests.find((r) => r.headers["x-goog-api-key"]);
  assert.equal(ownKey.headers["x-goog-api-key"], "mock-page-only-api-key");
  for (const req of requests.filter((r) => !r.headers["x-goog-api-key"]))
    assert.ok(!JSON.stringify(req).includes("mock-page-only-api-key"));
  const stored = await page.evaluate(() => ({ ...localStorage }));
  assert.deepEqual(Object.keys(stored), ["fusion_preferences"]);
  assert.deepEqual(JSON.parse(stored.fusion_preferences), {
    locale: "en",
    skin: "b",
    outputLanguage: "en",
  });
  await page.screenshot({
    path: screenshotDir + "/b-result.png",
    fullPage: true,
  });
  for (const id of ["a15", "b", "c", "t"]) {
    await page.getByLabel("Mode", { exact: true }).selectOption(id);
    assert.equal(await page.locator("html").getAttribute("data-skin"), id);
    await page.setViewportSize({ width: 1280, height: 920 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: screenshotDir + `/${id}-en-desktop.png`,
      fullPage: false,
    });
    await page
      .getByLabel("Interface language", { exact: true })
      .selectOption("ja");
    await page.screenshot({
      path: screenshotDir + `/${id}-ja-desktop.png`,
      fullPage: false,
    });
    await page.getByLabel("画面の言語", { exact: true }).selectOption("en");
    await page.setViewportSize({ width: 360, height: 800 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      id + " mobile overflow",
    );
    await page.screenshot({ path: screenshotDir + `/${id}-mobile.png` });
  }
  await page.getByRole("button", { name: "Ideas", exact: true }).click();
  await page.locator(".archive-item").first().waitFor();
  assert.equal(await page.locator(".archive-item details[open]").count(), 0);
  await page
    .getByText("Read the context and full result", { exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", {
      name: "Context reviewed by the publisher",
      exact: true,
    })
    .waitFor();
  await page
    .getByText("Read the context and full result", { exact: true })
    .last()
    .click();
  await page
    .getByText("Inferred wish (AI hypothesis at generation)", { exact: true })
    .waitFor();
  await page.getByText("Mode not recorded", { exact: true }).waitFor();
  await page.getByText("Genre unspecified", { exact: true }).waitFor();
  await page
    .getByLabel("Filter by genre", { exact: true })
    .selectOption("work");
  await page.locator(".archive-item").waitFor();
  assert.equal(await page.locator(".archive-item").count(), 1);
  assert.ok(
    (await page.locator(".archive-item .idea-tags").innerText()).includes(
      "Monku Labo",
    ),
  );
  await page.getByRole("button", { name: "My likes", exact: true }).click();
  await page.locator(".archive-item").waitFor();
  assert.equal(
    requests.filter((r) => r.path === "/api/fusion/liked").at(-1).search,
    "?genre=work",
  );
  await page
    .getByLabel("Filter by genre", { exact: true })
    .selectOption("learning");
  await page.getByText("No ideas match this genre.", { exact: true }).waitFor();
  await page.getByLabel("Filter by genre", { exact: true }).selectOption("");
  await page.locator(".archive-item").first().waitFor();
  await page.screenshot({
    path: screenshotDir + "/archive-metadata-mobile.png",
    fullPage: true,
  });
  await mount(page); // Preferences survive a new page; key and drafts do not.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(await page.locator(".byok-settings").getAttribute("open"), null);
  await page.locator(".byok-settings > summary").click();
  assert.equal(
    await page.getByLabel("API key", { exact: true }).inputValue(),
    "",
  );
  assert.equal(await page.locator("html").getAttribute("data-skin"), "t");
  for (const kind of ["privacy", "terms", "commerce"]) {
    const legal = await context.newPage();
    await mount(legal, "/" + kind);
    await legal
      .getByRole("link", { name: "Back to Monku Fusion", exact: true })
      .waitFor();
    const text = await legal.locator("main").innerText();
    assert.ok(
      !/[ぁ-んァ-ン]/.test(text.replace("日本語", "")),
      kind + " has untranslated Japanese prose",
    );
    await legal
      .getByLabel("Interface language", { exact: true })
      .selectOption("ja");
    await legal
      .getByRole("link", { name: "Monku Fusionに戻る", exact: true })
      .waitFor();
    await legal.getByLabel("画面の言語", { exact: true }).selectOption("fr");
    await legal
      .getByRole("link", { name: "Retour à Monku Fusion", exact: true })
      .waitFor();
    assert.ok(
      !/[ぁ-んァ-ン]/.test(await legal.locator("main").innerText()),
      kind + " French prose",
    );
    await legal
      .getByLabel("Langue de l’interface", { exact: true })
      .selectOption("en");
    await legal.close();
  }
  const payment = await context.newPage();
  await mount(payment, "/payment?session_id=cs_mock");
  await payment
    .getByRole("status")
    .filter({ hasText: "Payment confirmed" })
    .waitFor();
  const count = requests.filter(
    (r) => r.path === "/api/incense/verify-session",
  ).length;
  await payment
    .getByLabel("Interface language", { exact: true })
    .selectOption("ja");
  await payment
    .getByRole("status")
    .filter({ hasText: "決済を確認しました" })
    .waitFor();
  assert.equal(
    requests.filter((r) => r.path === "/api/incense/verify-session").length,
    count,
  );
  // French, direct key focus, own withdrawal and retirement consent use the real components.
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page
    .getByLabel("Interface language", { exact: true })
    .selectOption("fr");
  await page
    .getByLabel("Langue du résultat généré", { exact: true })
    .selectOption("fr");
  for (const id of ["a15", "b", "c", "t"]) {
    await page.getByLabel("Mode", { exact: true }).selectOption(id);
    for (const width of [360, 820, 1280]) {
      await page.setViewportSize({ width, height: 920 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        id + " French overflow " + width,
      );
      await page.screenshot({ path: screenshotDir + `/${id}-fr-${width}.png` });
    }
  }
  await page.getByText("Utiliser votre clé Gemini", { exact: true }).click();
  await page
    .getByRole("button", { name: "Configurer ma clé", exact: true })
    .click();
  assert.equal(await page.locator(".byok-settings").getAttribute("open"), "");
  assert.equal(
    await page
      .getByLabel("Clé API", { exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "Idées", exact: true }).click();
  await page
    .getByRole("button", { name: "Mes publications", exact: true })
    .click();
  await page.locator(".archive-item").first().waitFor();
  assert.equal(await page.locator(".archive-item").count(), 2);
  await page
    .getByRole("button", { name: "Retirer la publication", exact: true })
    .first()
    .click();
  await expect(page.locator(".archive-item")).toHaveCount(1);
  assert.equal(
    requests.filter((r) => r.path === "/api/fusion/delete").at(-1).body.id,
    "archive-one",
  );
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  for (const id of ["a15", "b", "c", "t"]) {
    await page.locator(`.mode-description.skin-${id}`).click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "French settings " + id,
    );
  }
  await page.screenshot({
    path: screenshotDir + "/settings-fr-360.png",
    fullPage: true,
  });
  await page.locator(".retirement > summary").click();
  assert.equal(
    await page
      .locator(".retirement")
      .getByRole("button", { name: "Supprimer le compte", exact: true })
      .isEnabled(),
    false,
  );
  await page
    .getByLabel("Conserver mes publications anonymement", { exact: true })
    .check();
  await page.locator(".retirement input[type=checkbox]").check();
  await page
    .locator(".retirement")
    .screenshot({ path: screenshotDir + "/retire-fr-360.png" });
  page.removeAllListeners("dialog");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .locator(".retirement")
    .getByRole("button", { name: "Supprimer le compte", exact: true })
    .click();
  assert.equal(
    requests.filter((r) => r.path === "/api/account/retire").length,
    0,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator(".retirement")
    .getByRole("button", { name: "Supprimer le compte", exact: true })
    .click();
  await page
    .getByText(
      "Votre compte a été supprimé. Merci d’avoir utilisé Monku Fusion.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    requests.filter((r) => r.path === "/api/account/retire").at(-1).body
      .keepPosts,
    true,
  );
  assert.equal(
    requests.filter((r) => r.path === "/api/account/retire").at(-1).body
      .confirmForfeit,
    true,
  );
  await page
    .getByLabel("Langue de l’interface", { exact: true })
    .selectOption("en");
  // Fresh English browser gets English independently of output language and default skin.
  const fresh = await context.newPage();
  await fresh.goto("https://fusion.test/");
  await fresh.evaluate(() => {
    localStorage.clear();
    window.anonymous = true;
    Object.defineProperty(navigator, "language", { value: "en-US" });
  });
  await fresh.addStyleTag({ content: css });
  await fresh.addScriptTag({ content: compiled.outputFiles[0].text });
  await fresh
    .getByText("Not connected · 3 free trials", { exact: true })
    .waitFor();
  assert.equal(await fresh.locator(".usage-options details[open]").count(), 0);
  assert.equal(
    await fresh
      .getByText("First visit: connect to get started", { exact: true })
      .count(),
    0,
  );
  assert.equal(await fresh.locator("html").getAttribute("data-skin"), "a15");
  assert.equal(
    await fresh.getByLabel("Language of the generated result").inputValue(),
    "auto",
  );
  assert.equal(
    await fresh.getByRole("button", { name: "Generate · 1 use" }).isEnabled(),
    false,
  );
  await fresh.screenshot({
    path: screenshotDir + "/first-visit-en.png",
    fullPage: true,
  });
  await fresh.locator(".trial-guide > summary").click();
  await fresh
    .getByText("First visit: connect to get started", { exact: true })
    .waitFor();
  await fresh.locator(".trial-guide > summary").click();
  await fresh
    .getByText("First visit: connect to get started", { exact: true })
    .waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(
    "Web experience passed: composer mode/skin coupling, explanatory settings, collapsed revision/usage guides, recorded modes, editable genre suggestions, filtered archive/likes, legacy metadata, four skins, mobile overflow, locale/output independence, full export, revision recovery/history, publication scope, BYOK isolation, preference persistence and translated flows. All external calls mocked.",
  );
} finally {
  await browser.close();
}
