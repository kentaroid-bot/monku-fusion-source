/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import type { ActionCtx } from "../convex/_generated/server";
import { digest } from "../convex/security";
import { fields } from "../shared/fusion";
import http from "../convex/http";

const modules = import.meta.glob("../convex/**/*.ts");
const setup = () => convexTest(schema, modules);
const sample = Object.fromEntries(fields.map((key) => [key, "架空のテスト内容"]));
const post = (data: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

describe("account and archive boundaries", () => {
  it("requires a verified login and possession of the anonymous token before linking paid credits", async () => {
    const t = setup();
    const token = "a".repeat(64);
    await t.mutation(internal.incense.createWallet, { tokenHash: await digest(token) });
    const wallet = await t.query(internal.incense.authenticate, {
      tokenHash: await digest(token),
    });
    await t.mutation(internal.incense.fulfillPayment, {
      walletId: wallet!._id,
      sessionId: "cs_test_account",
    });
    const anonymousBalance = await t.fetch("/api/incense/balance", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(anonymousBalance.status).toBe(200);
    expect(await anonymousBalance.json()).toEqual({ balance: 15 });

    expect((await t.fetch("/api/account/link", post({ anonymousToken: token }))).status).toBe(400);
    const alice = t.withIdentity({ subject: "user_alice" });
    expect((await alice.fetch("/api/account/link", post({ anonymousToken: "b".repeat(64) }))).status).toBe(400);
    const linked = await alice.fetch("/api/account/link", post({ anonymousToken: token }));
    expect(linked.status).toBe(200);
    expect(await linked.json()).toEqual({ balance: 15 });
    expect((await alice.fetch("/api/account/link", post({ anonymousToken: token }))).status).toBe(200);
    expect((await t.withIdentity({ subject: "user_bob" }).fetch("/api/account/link", post({ anonymousToken: token }))).status).toBe(400);
    expect((await alice.fetch("/api/account/status")).status).toBe(200);
    expect(await (await alice.fetch("/api/account/status")).json()).toEqual({ linked: true, balance: 15 });
    expect(await (await alice.fetch("/api/incense/balance")).json()).toEqual({ balance: 15 });
    expect((await t.withIdentity({ subject: "user_bob" }).fetch("/api/incense/balance")).status).toBe(400);
    expect(await t.run((ctx) => ctx.db.query("wallets").collect())).toHaveLength(1);
  });

  it("shows five public items anonymously and paginates all public items for login", async () => {
    const t = setup();
    const walletId = await t.run((ctx) =>
      ctx.db.insert("wallets", { balance: 0, freeBalance: 0, paidBalance: 0, createdAt: Date.now() }),
    );
    for (let i = 0; i < 26; i++)
      await t.mutation(internal.fusions.saveFusion, {
        ownerId: walletId,
        hash: `public-${i}`,
        result: { ...sample, ideaTitle: `Idea ${i}` },
      });
    await t.run((ctx) =>
      ctx.db.insert("fusions", {
        ...sample,
        hash: "private-legacy",
        rawNoise: "PRIVATE",
        createdAt: Date.now(),
      } as never),
    );
    const anon = await (await t.fetch("/api/fusion/list")).json();
    expect(anon.items).toHaveLength(5);
    expect(anon.items.some((item: { ideaTitle: string }) => item.ideaTitle === "PRIVATE")).toBe(false);

    // convex-test does not reject opaque Bearer tokens like production HTTP
    // actions do. Exercise the real route with that JWT verifier behavior.
    const getUserIdentity = vi.fn().mockRejectedValue(new Error("Invalid JWT"));
    const archive = http.lookup("/api/fusion/list", "GET")![0] as unknown as {
      _handler: (ctx: ActionCtx, request: Request) => Promise<Response>;
    };
    const extensionResponse = await t.action(async (ctx) => {
      const response = await archive._handler(
        { ...ctx, auth: { getUserIdentity } },
        new Request("https://example.convex.site/api/fusion/list", {
          headers: { Authorization: `Bearer ${"a".repeat(64)}` },
        }),
      );
      return { status: response.status, body: await response.json() };
    });
    expect(extensionResponse.status).toBe(200);
    expect(extensionResponse.body).toEqual(anon);
    expect(getUserIdentity).not.toHaveBeenCalled();

    // Invalid login JWTs must still be verified and rejected, not silently
    // treated as extension credentials or granted account archive access.
    const invalidLoginStatus = await t.action(async (ctx) => {
      const response = await archive._handler(
        { ...ctx, auth: { getUserIdentity } },
        new Request("https://example.convex.site/api/fusion/list", {
          headers: { Authorization: "Bearer invalid.jwt.token" },
        }),
      );
      return response.status;
    });
    expect(invalidLoginStatus).toBe(400);
    expect(getUserIdentity).toHaveBeenCalledTimes(1);

    const alice = t.withIdentity({ subject: "user_alice" });
    const first = await (await alice.fetch("/api/fusion/list")).json();
    expect(first.items).toHaveLength(20);
    expect(first.isDone).toBe(false);
    const second = await (await alice.fetch(`/api/fusion/list?cursor=${encodeURIComponent(first.cursor)}`)).json();
    expect(second.items).toHaveLength(6);
    expect(second.isDone).toBe(true);
    expect([...first.items, ...second.items].every((item: { rawNoise?: string }) => !item.rawNoise)).toBe(true);
  });

  it("keeps likes private to the signed-in account and ignores repeated likes", async () => {
    const t = setup();
    const walletId = await t.run((ctx) =>
      ctx.db.insert("wallets", { balance: 0, freeBalance: 0, paidBalance: 0, createdAt: Date.now() }),
    );
    const id = await t.mutation(internal.fusions.saveFusion, {
      ownerId: walletId,
      hash: "liked-public",
      result: sample,
    });
    const alice = t.withIdentity({ subject: "user_alice" });
    expect((await t.fetch("/api/fusion/like", post({ id, liked: true }))).status).toBe(400);
    expect((await alice.fetch("/api/fusion/like", post({ id, liked: true }))).status).toBe(200);
    expect((await alice.fetch("/api/fusion/like", post({ id, liked: true }))).status).toBe(200);
    expect(await t.run((ctx) => ctx.db.query("accountLikes").collect())).toHaveLength(1);
    expect((await (await alice.fetch("/api/fusion/liked")).json()).items).toHaveLength(1);
    expect((await (await t.withIdentity({ subject: "user_bob" }).fetch("/api/fusion/liked")).json()).items).toHaveLength(0);
    expect((await alice.fetch("/api/fusion/like", post({ id, liked: false }))).status).toBe(200);
    expect((await (await alice.fetch("/api/fusion/liked")).json()).items).toHaveLength(0);
  });
});
