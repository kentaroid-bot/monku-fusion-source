// Offline regression for asynchronously rendered/replaced Clerk inputs.
// It does not create accounts, access saved browser profiles, or call services.
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import assert from "node:assert/strict";
const compiled = await build({
  entryPoints: ["src/lib-auth-input.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "authInputs",
  platform: "browser",
});
const options = process.env.BRAVE_EXECUTABLE
  ? { executablePath: process.env.BRAVE_EXECUTABLE }
  : { channel: "chrome" };
const browser = await chromium.launch({ ...options, headless: true });
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(
    '<div id="auth"></div><input id="outside" name="emailAddress" autocomplete="email">',
  );
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  await page.evaluate(() => {
    window.stopGuard = window.authInputs.suppressAddressSuggestions(
      document.querySelector("#auth"),
    );
    document.querySelector("#auth").innerHTML =
      '<input name="emailAddress"><input type="password" autocomplete="new-password">';
  });
  await page.waitForFunction(
    () => document.querySelector("#auth input").autocomplete === "off",
  );
  const email = page.locator("#auth input[name=emailAddress]");
  await email.pressSequentially("test@example.com", { delay: 30 });
  assert.equal(await email.inputValue(), "test@example.com");
  assert.equal(
    await page.locator("input[type=password]").getAttribute("autocomplete"),
    "new-password",
  );
  assert.equal(
    await page.locator("#outside").getAttribute("autocomplete"),
    "email",
  );
  // Simulate a Clerk rerender restoring the original attribute.
  await email.evaluate((el) => (el.autocomplete = "email"));
  await page.waitForFunction(
    () => document.querySelector("#auth input").autocomplete === "off",
  );
  // Switching sign-in steps replaces the field. OTP/password fields must remain intact.
  await page.evaluate(() => {
    document.querySelector("#auth").innerHTML =
      '<input name="identifier"><input name="code" autocomplete="one-time-code"><input type="password" autocomplete="current-password">';
  });
  await page.waitForFunction(
    () =>
      document.querySelector("input[name=identifier]").autocomplete === "off",
  );
  assert.equal(
    await page.locator("input[name=code]").getAttribute("autocomplete"),
    "one-time-code",
  );
  assert.equal(
    await page.locator("input[type=password]").getAttribute("autocomplete"),
    "current-password",
  );
  await page.evaluate(() => {
    window.stopGuard();
    document.querySelector("#auth").innerHTML =
      '<input name="emailAddress" autocomplete="email">';
  });
  await page.locator("#auth input").focus();
  assert.equal(
    await page.locator("#auth input").getAttribute("autocomplete"),
    "email",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Auth input regression passed: typing, delayed fields, replacement, rerender, password/OTP isolation, cleanup; no external requests.",
  );
} finally {
  await browser.close();
}
