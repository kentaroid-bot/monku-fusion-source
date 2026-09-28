/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { digest } from "../convex/security";
import { fields } from "../shared/fusion";
const modules = import.meta.glob("../convex/**/*.ts");
const legacy = "a".repeat(64);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const post = (data: unknown, token?: string) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? auth(token) : {}),
  },
  body: JSON.stringify(data),
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.incense.createWallet, {
    tokenHash: await digest(legacy),
  });
  await t.mutation(internal.incense.linkAccount, {
    subject: "alice",
    tokenHash: await digest(legacy),
  });
  const wallet = (await t.query(internal.incense.accountWallet, {
    subject: "alice",
  }))!;
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  async function connect() {
    const issued = await alice.fetch(
      "/api/session/pair",
      post({ accountAccess: true }),
    );
    expect(issued.status).toBe(200);
    const { code } = await issued.json();
    const redeemed = await t.fetch("/api/session/redeem", post({ code }));
    expect(redeemed.status).toBe(200);
    return { token: (await redeemed.json()).token as string, code };
  }
  return { t, alice, bob, wallet, connect };
}
describe("explicit extension account delegation", () => {
  it("keeps legacy credentials anonymous and rejects attempts to claim account authority", async () => {
    const { t } = await setup();
    const state = await (
      await t.fetch("/api/extension/connection", { headers: auth(legacy) })
    ).json();
    expect(state).toMatchObject({
      connected: true,
      accountLinked: false,
      balance: 5,
    });
    for (const path of [
      "/api/fusion/mine",
      "/api/fusion/liked",
      "/api/account/extensions",
    ])
      expect((await t.fetch(path, { headers: auth(legacy) })).status).toBe(400);
    expect(
      (
        await t.fetch(
          "/api/session/pair",
          post({ accountAccess: true, subject: "alice" }, legacy),
        )
      ).status,
    ).toBe(400);
    const legacyPair = await t.fetch("/api/session/pair", post({}, legacy));
    const { code } = await legacyPair.json();
    const { token } = await (
      await t.fetch("/api/session/redeem", post({ code }))
    ).json();
    expect(
      await (
        await t.fetch("/api/extension/connection", { headers: auth(token) })
      ).json(),
    ).toMatchObject({ connected: true, accountLinked: false });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("shares archive pages, private likes and own posts only with the explicitly linked account", async () => {
    const { t, alice, bob, wallet, connect } = await setup();
    const sample = Object.fromEntries(
      fields.map((field) => [field, "Fictional result"]),
    );
    let id;
    for (let i = 0; i < 26; i++)
      id = await t.mutation(internal.fusions.saveFusion, {
        ownerId: wallet._id,
        hash: `test-${i}`,
        result: { ...sample, ideaTitle: `Idea ${i}` },
      });
    const { token, code } = await connect();
    const state = await (
      await t.fetch("/api/extension/connection", { headers: auth(token) })
    ).json();
    expect(state).toMatchObject({
      connected: true,
      accountLinked: true,
      balance: 5,
    });
    expect(state.expiresAt).toBe(Date.now() + 30 * 86400000);
    expect(state).not.toHaveProperty("subject");
    expect((await t.fetch("/api/session/redeem", post({ code }))).status).toBe(
      400,
    );
    const first = await (
      await t.fetch("/api/fusion/list", { headers: auth(token) })
    ).json();
    expect(first.items).toHaveLength(20);
    expect(first.isDone).toBe(false);
    const next = await (
      await t.fetch(
        `/api/fusion/list?cursor=${encodeURIComponent(first.cursor)}`,
        { headers: auth(token) },
      )
    ).json();
    expect(next.items).toHaveLength(6);
    expect(
      (
        await (
          await t.fetch("/api/fusion/list", { headers: auth(legacy) })
        ).json()
      ).items,
    ).toHaveLength(5);
    expect(
      (
        await t.fetch(
          "/api/fusion/like",
          post({ id, liked: true, subject: "bob" }, token),
        )
      ).status,
    ).toBe(200);
    expect(
      (await (await alice.fetch("/api/fusion/liked")).json()).items,
    ).toHaveLength(1);
    expect(
      (await (await bob.fetch("/api/fusion/liked")).json()).items,
    ).toHaveLength(0);
    expect(
      (
        await (
          await t.fetch("/api/fusion/mine", { headers: auth(token) })
        ).json()
      ).items,
    ).toHaveLength(20);
    expect(
      (await alice.fetch("/api/fusion/like", post({ id, liked: false })))
        .status,
    ).toBe(200);
    expect(
      (
        await (
          await t.fetch("/api/fusion/liked", { headers: auth(token) })
        ).json()
      ).items,
    ).toHaveLength(0);
    // Delegation cannot retire accounts, link wallets, manage other devices or issue a new account grant.
    for (const path of [
      "/api/account/retire",
      "/api/account/link",
      "/api/account/extensions/revoke",
    ])
      expect((await t.fetch(path, post({}, token))).status).toBe(400);
    expect(
      (await t.fetch("/api/session/pair", post({ accountAccess: true }, token)))
        .status,
    ).toBe(400);
    expect((await t.fetch("/api/session/pair", post({}, token))).status).toBe(
      400,
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("revokes only the chosen device and preserves the account balance and other connections", async () => {
    const { t, alice, bob, connect } = await setup();
    const first = await connect();
    const second = await connect();
    const { connections } = await (
      await alice.fetch("/api/account/extensions")
    ).json();
    expect(connections).toHaveLength(2);
    expect(connections[0]).not.toHaveProperty("tokenHash");
    expect(
      (
        await bob.fetch(
          "/api/account/extensions/revoke",
          post({ id: connections[0].id }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await alice.fetch(
          "/api/account/extensions/revoke",
          post({ id: connections[0].id }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await t.fetch("/api/incense/balance", { headers: auth(first.token) }))
        .status,
    ).toBe(400);
    expect(
      await (
        await t.fetch("/api/incense/balance", { headers: auth(second.token) })
      ).json(),
    ).toEqual({ balance: 5 });
    expect(await (await alice.fetch("/api/incense/balance")).json()).toEqual({
      balance: 5,
    });
    expect(
      (await t.fetch("/api/extension/disconnect", post({}, second.token)))
        .status,
    ).toBe(200);
    expect(
      (await t.fetch("/api/fusion/liked", { headers: auth(second.token) }))
        .status,
    ).toBe(400);
    expect(
      await (
        await t.fetch("/api/incense/balance", { headers: auth(legacy) })
      ).json(),
    ).toEqual({ balance: 5 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("expires delegated credentials without expiring old wallet tokens or losing balances", async () => {
    const { t, alice, connect } = await setup();
    const { token } = await connect();
    vi.advanceTimersByTime(30 * 86400000);
    expect(
      await (
        await t.fetch("/api/extension/connection", { headers: auth(token) })
      ).json(),
    ).toMatchObject({ connected: false, expired: true });
    expect(
      (await t.fetch("/api/fusion/liked", { headers: auth(token) })).status,
    ).toBe(400);
    expect(
      (await t.fetch("/api/incense/balance", { headers: auth(token) })).status,
    ).toBe(400);
    expect(await (await alice.fetch("/api/incense/balance")).json()).toEqual({
      balance: 5,
    });
    expect(
      await (
        await t.fetch("/api/incense/balance", { headers: auth(legacy) })
      ).json(),
    ).toEqual({ balance: 5 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("rejects foreign wallet grants and a changed owner before redemption", async () => {
    const { t, wallet } = await setup();
    await expect(
      t.mutation(internal.incense.createPairing, {
        walletId: wallet._id,
        codeHash: "foreign",
        accountSubject: "bob",
      }),
    ).rejects.toThrow();
    await t.mutation(internal.incense.createPairing, {
      walletId: wallet._id,
      codeHash: "stale",
      accountSubject: "alice",
    });
    await t.run(async (ctx) => {
      const account = await ctx.db.query("accountWallets").first();
      await ctx.db.delete(account!._id);
    });
    await expect(
      t.mutation(internal.incense.redeemPairing, {
        codeHash: "stale",
        tokenHash: "cannot-redeem",
      }),
    ).rejects.toThrow();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});
