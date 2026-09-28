// Mount the real home screen with a simulated Clerk session and API. No account,
// payment, AI request, or saved browser profile is used by this regression.
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import assert from "node:assert/strict";

const mocks = {
  "@clerk/react": `
    const auth = {
      isLoaded: true, isSignedIn: true, userId: "test-user",
      sessionClaims: { aud: "convex" },
      getToken: async (options) => {
        if (options?.template) throw new Error("No JWT template exists");
        return "test-account-token";
      },
    };
    export const useAuth = () => auth;
    export const UserButton = () => null;
  `,
  OptionalClerkProvider: `export const clerkAvailable = true; export default ({ children }) => children;`,
  Signup: `export default () => null;`,
  "next/link": `import { createElement } from "react"; export default (props) => createElement("a", props);`,
};
const compiled = await build({
  stdin: {
    contents:
      'import { createRoot } from "react-dom/client"; import Home from "./src/app/page"; createRoot(document.getElementById("root")).render(<Home />);',
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
  },
  plugins: [
    {
      name: "offline-account",
      setup(build) {
        build.onResolve(
          {
            filter:
              /@clerk\/react|OptionalClerkProvider$|components\/Signup$|^next\/link$/,
          },
          ({ path }) => ({
            path: path.endsWith("OptionalClerkProvider")
              ? "OptionalClerkProvider"
              : path.endsWith("Signup")
                ? "Signup"
                : path,
            namespace: "offline-account",
          }),
        );
        build.onLoad(
          { filter: /.*/, namespace: "offline-account" },
          ({ path }) => ({
            contents: mocks[path],
            loader: "js",
            resolveDir: process.cwd(),
          }),
        );
      },
    },
  ],
});
const options = process.env.BRAVE_EXECUTABLE
  ? { executablePath: process.env.BRAVE_EXECUTABLE }
  : { channel: "chrome" };
const browser = await chromium.launch({ ...options, headless: true });
try {
  const page = await browser.newPage({ locale: "ja-JP" });
  const errors = [];
  const blocked = [];
  let linked = false;
  let statusCalls = 0;
  let linkCalls = 0;
  let archiveCalls = 0;
  let linkOutcome = "success";
  let accountAccess = true;
  let extensionRevoked = false;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === "https://fusion.test") {
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    }
    if (url.origin !== "https://offline-test.convex.site") {
      blocked.push(request.url());
      return route.abort();
    }
    let data;
    let status = 200;
    if (url.pathname === "/api/incense/balance") {
      data = { balance: 9 };
    } else {
      assert.equal(
        request.headers().authorization,
        "Bearer test-account-token",
      );
      if (url.pathname === "/api/account/status") {
        statusCalls++;
        assert.ok(statusCalls < 10, "account checks must settle");
        if (statusCalls === 1) {
          status = 503;
          data = { error: "temporary failure" };
        } else data = { linked, balance: linked ? 9 : null };
      } else if (url.pathname === "/api/account/link") {
        linkCalls++;
        assert.deepEqual(request.postDataJSON(), {
          anonymousToken: "test-anonymous-token",
        });
        if (linkOutcome === "success") {
          linked = true;
          data = { balance: 9 };
        } else {
          status = linkOutcome === "conflict" ? 400 : 503;
          data = {
            error:
              linkOutcome === "conflict"
                ? "このアカウントには別の残数が登録されています。"
                : "temporary failure",
          };
        }
      } else if (url.pathname === "/api/session/pair") {
        assert.deepEqual(request.postDataJSON(), { accountAccess });
        data = { code: "c".repeat(64), expiresInSeconds: 600 };
      } else if (url.pathname === "/api/account/extensions") {
        data = {
          connections: extensionRevoked
            ? []
            : [
                {
                  id: "test-extension",
                  createdAt: Date.now(),
                  expiresAt: Date.now() + 86400000,
                },
              ],
        };
      } else if (url.pathname === "/api/account/extensions/revoke") {
        assert.deepEqual(request.postDataJSON(), { id: "test-extension" });
        extensionRevoked = true;
        data = { success: true };
      } else if (url.pathname === "/api/fusion/list") {
        archiveCalls++;
        data = { items: [], isDone: true };
      } else throw new Error(`Unexpected request: ${url.pathname}`);
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  async function mountWithSavedConnection() {
    await page.goto("https://fusion.test/");
    await page.evaluate(() =>
      localStorage.setItem("monku_token", "test-anonymous-token"),
    );
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
  }
  await mountWithSavedConnection();
  await page.getByRole("button", { name: "ログインと残数を再確認" }).waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("monku_token")),
    "test-anonymous-token",
  );
  assert.equal(linkCalls, 0);
  await page.getByText("利用回数を追加", { exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "100円で10回分を購入" }).isEnabled(),
    false,
  );
  await page.getByRole("button", { name: "ログインと残数を再確認" }).click();
  await page.getByText("利用回数：残り9回", { exact: true }).waitFor();
  await page.waitForFunction(
    () => localStorage.getItem("monku_token") === null,
  );
  assert.equal(linkCalls, 1);
  assert.equal(
    await page.getByRole("button", { name: "100円で10回分を購入" }).isEnabled(),
    true,
  );
  await page.getByRole("button", { name: "残数を更新", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page
    .getByText("このアカウントに残数を登録済みです。", { exact: true })
    .waitFor();
  const accountScope = page.getByLabel(
    "全件・いいね・自分の投稿も拡張と連携する",
  );
  await page.getByText("ブラウザと拡張機能をつなぐ", { exact: true }).click();
  await page
    .getByRole("button", { name: "アカウント連携コードを発行", exact: true })
    .click();
  await page.getByText("c".repeat(64), { exact: true }).waitFor();
  accountAccess = false;
  await accountScope.uncheck();
  assert.equal(
    await page.getByText("c".repeat(64), { exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "接続コードを作る", exact: true })
    .click();
  await page.getByText("c".repeat(64), { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "連携済みの拡張を確認", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "この接続を解除", exact: true })
    .click();
  await page
    .getByText("アカウント連携済みの拡張はありません。", { exact: true })
    .waitFor();
  assert.equal(extensionRevoked, true);
  const archiveResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/fusion/list"),
  );
  await page.getByRole("button", { name: "アイデア", exact: true }).click();
  await page.getByRole("button", { name: "全件", exact: true }).waitFor();
  await archiveResponse;
  assert.equal(archiveCalls, 1);

  linkOutcome = "conflict";
  const savedConnection = page.getByText("このブラウザに残っている接続", {
    exact: true,
  });
  const conflictNotice =
    page.getByText(/^別の接続がこのブラウザに残っています。/);
  for (let load = 0; load < 2; load++) {
    await mountWithSavedConnection();
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await savedConnection.waitFor();
    assert.equal(await conflictNotice.isVisible(), false);
    await savedConnection.click();
    await conflictNotice.waitFor();
    for (const tab of ["つくる", "アイデア"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      assert.equal(await conflictNotice.count(), 0);
    }
    assert.equal(
      await page.evaluate(() => localStorage.getItem("monku_token")),
      "test-anonymous-token",
    );
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.getByText("利用回数：残り9回", { exact: true }).waitFor();
    assert.equal(await conflictNotice.isVisible(), false);
  }

  linkOutcome = "unverified";
  await mountWithSavedConnection();
  const retryTransfer = page.getByRole("button", {
    name: "接続の引き継ぎを再確認",
    exact: true,
  });
  await retryTransfer.waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("monku_token")),
    "test-anonymous-token",
  );
  linkOutcome = "success";
  await retryTransfer.click();
  await page.waitForFunction(
    () => localStorage.getItem("monku_token") === null,
  );
  assert.equal(await retryTransfer.count(), 0);
  assert.equal(
    await page
      .getByText(/^ブラウザの接続の引き継ぎを確認できませんでした。/)
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  console.log(
    "Account flow passed: login/retry/balance/archive, saved-connection notice stays collapsed in settings across reloads, old connection is preserved, transient notice clears after recovery; no external requests.",
  );
} finally {
  await browser.close();
}
