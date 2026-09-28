/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { digest } from "../convex/security";
import { fields } from "../shared/fusion";
const modules = import.meta.glob("../convex/**/*.ts");
const sample = Object.fromEntries(
  fields.map((key) => [key, "Fictional test result"]),
);
const token = "a".repeat(64),
  receipt = "b".repeat(64);
const post = (data: unknown, bearer = "") => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  },
  body: JSON.stringify(data),
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_mock");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("No external request allowed")),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.incense.createWallet, {
    tokenHash: await digest(token),
  });
  const wallet = (await t.query(internal.incense.authenticate, {
    tokenHash: await digest(token),
  }))!;
  await t.mutation(internal.incense.linkAccount, {
    subject: "alice",
    tokenHash: await digest(token),
  });
  const id = await t.mutation(internal.fusions.saveFusion, {
    ownerId: wallet._id,
    hash: "public-test",
    result: sample,
  });
  return { t, wallet, id, alice: t.withIdentity({ subject: "alice" }) };
}
describe("own posts and categories", () => {
  it("lists only the signed-in owner's posts and enforces withdrawal ownership", async () => {
    const { t, alice, id } = await setup();
    expect((await t.fetch("/api/fusion/mine")).status).toBe(400);
    expect(
      (
        await (
          await t.withIdentity({ subject: "bob" }).fetch("/api/fusion/mine")
        ).json()
      ).items,
    ).toEqual([]);
    expect(
      (await (await alice.fetch("/api/fusion/mine")).json()).items[0].id,
    ).toBe(id);
    expect(
      (await (await alice.fetch("/api/fusion/mine?genre=work")).json()).items,
    ).toEqual([]);
    const otherWallet = await t.run((ctx) =>
      ctx.db.insert("wallets", { balance: 0, createdAt: Date.now() }),
    );
    await expect(
      t.mutation(internal.fusions.remove, { id, ownerId: otherWallet }),
    ).rejects.toThrow("削除できません");
    await t.mutation(internal.fusions.setLike, {
      subject: "bob",
      id,
      liked: true,
    });
    expect((await alice.fetch("/api/fusion/delete", post({ id }))).status).toBe(
      200,
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await t.run((ctx) => ctx.db.query("accountLikes").collect()),
    ).toEqual([]);
  });
  it("backfills only unchanged public untagged posts and updates liked filters", async () => {
    const { t, id, alice, wallet } = await setup();
    await t.mutation(internal.fusions.setLike, {
      subject: "alice",
      id,
      liked: true,
    });
    const tagged = await t.mutation(internal.fusions.saveFusion, {
      ownerId: wallet._id,
      hash: "tagged",
      result: sample,
      genres: ["life"],
      mode: "deep",
    });
    expect(
      (await t.query(internal.categoryBackfill.preview, {})).items.map(
        (i) => i.id,
      ),
    ).toEqual([id]);
    expect(
      await t.mutation(internal.categoryBackfill.apply, {
        items: [
          { id, hash: "stale", genres: ["work"] },
          { id: tagged, hash: "tagged", genres: ["work"] },
        ],
      }),
    ).toEqual({ updated: 0, skipped: 2 });
    expect(
      await t.mutation(internal.categoryBackfill.apply, {
        items: [{ id, hash: "public-test", genres: ["work", "learning"] }],
      }),
    ).toEqual({ updated: 1, skipped: 0 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await (await alice.fetch("/api/fusion/liked?genre=work")).json())
        .items[0].id,
    ).toBe(id);
    const rows = await t.run(async (ctx) => [
      await ctx.db.get(id),
      await ctx.db.get(tagged),
    ]);
    expect(rows[0]?.mode).toBeUndefined();
    expect(rows[1]?.mode).toBe("deep");
    expect(rows[1]?.genre1).toBe("life");
    expect(
      await t.mutation(internal.categoryBackfill.apply, {
        items: [{ id, hash: "public-test", genres: ["life"] }],
      }),
    ).toEqual({ updated: 0, skipped: 1 });
  });
});
describe("account retirement", () => {
  it("requires login, complete configuration, explicit choice and consent before any change", async () => {
    const { t, alice, wallet } = await setup();
    const payload = { receipt, keepPosts: false, confirmForfeit: true };
    expect(
      (await t.fetch("/api/account/retire", post(payload, token))).status,
    ).toBe(400);
    expect(
      (
        await alice.fetch(
          "/api/account/retire",
          post({ receipt, keepPosts: false }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await alice.fetch(
          "/api/account/retire",
          post({ receipt, confirmForfeit: true }),
        )
      ).status,
    ).toBe(400);
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(
      (await alice.fetch("/api/account/retire", post(payload))).status,
    ).toBe(400);
    expect((await t.run((ctx) => ctx.db.get(wallet._id)))?.balance).toBe(5);
    expect(await t.run((ctx) => ctx.db.query("retirements").collect())).toEqual(
      [],
    );
  });
  for (const keepPosts of [true, false])
    it(`completes cleanup with keepPosts=${keepPosts}, revokes stale access and keeps financial records`, async () => {
      const { t, alice, wallet, id } = await setup();
      await t.mutation(internal.incense.fulfillPayment, {
        sessionId: "cs_test_retire",
        walletId: wallet._id,
      });
      await t.mutation(internal.incense.createPairing, {
        walletId: wallet._id,
        codeHash: "pairing",
      });
      await t.mutation(internal.fusions.setLike, {
        subject: "alice",
        id,
        liked: true,
      });
      await t.mutation(internal.fusions.setLike, {
        subject: "bob",
        id,
        liked: true,
      });
      const request = await t.mutation(internal.incense.reserve, {
        walletId: wallet._id,
        requestId: "test-retire-request",
        inputHash: "not-raw-input",
      });
      const fetcher = vi.fn(
        async (_url: string, init: RequestInit) =>
          new Response(
            JSON.stringify(
              init.method === "DELETE" ? { deleted: true } : { id: "alice" },
            ),
            { status: 200 },
          ),
      );
      vi.stubGlobal("fetch", fetcher);
      const payload = {
        receipt,
        keepPosts,
        confirmForfeit: true,
        subject: "bob",
      };
      expect(
        (await alice.fetch("/api/account/retire", post(payload))).status,
      ).toBe(200);
      expect(
        (await alice.fetch("/api/account/retire", post(payload))).status,
      ).toBe(200);
      expect(
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(token),
        }),
      ).toBeNull();
      await expect(
        t.mutation(internal.incense.reserve, {
          walletId: wallet._id,
          requestId: "test-retire-request",
          inputHash: "not-raw-input",
        }),
      ).rejects.toThrow();
      await expect(
        t.mutation(internal.incense.complete, {
          id: request.id,
          result: sample,
        }),
      ).rejects.toThrow();
      await t.mutation(internal.incense.refund, { id: request.id });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[0][0]).toBe(
        "https://api.clerk.com/v1/users/alice",
      );
      const row = await t.run((ctx) => ctx.db.get(id));
      if (keepPosts) {
        expect(row?.ownerId).toBeUndefined();
        expect(row?.hash).toBe(`retained:${id}`);
        expect(row?.ideaTitle).toBe(sample.ideaTitle);
      } else expect(row).toBeNull();
      const data = await t.run(async (ctx) => ({
        wallet: await ctx.db.get(wallet._id),
        accounts: await ctx.db.query("accountWallets").collect(),
        credentials: await ctx.db.query("credentials").collect(),
        requests: await ctx.db.query("requests").collect(),
        likes: await ctx.db.query("accountLikes").collect(),
        purchases: await ctx.db.query("purchases").collect(),
        jobs: await ctx.db.query("retirements").collect(),
      }));
      expect(data.wallet?.balance).toBe(0);
      expect(data.wallet?.closedAt).toBeDefined();
      expect(data.accounts).toEqual([]);
      expect(data.credentials).toEqual([]);
      expect(data.requests).toEqual([]);
      expect(data.likes.map((like) => like.subject)).toEqual(
        keepPosts ? ["bob"] : [],
      );
      expect(data.purchases).toHaveLength(1);
      expect(data.jobs).toHaveLength(1);
      expect(data.jobs[0].subject).toBeUndefined();
      expect(
        (
          await (
            await t.fetch("/api/account/retire-status", post({ receipt }))
          ).json()
        ).status,
      ).toBe("complete");
      expect(
        (
          await (
            await t.fetch(
              "/api/account/retire-status",
              post({ receipt: "c".repeat(64) }),
            )
          ).json()
        ).status,
      ).toBe("unknown");
      for (const path of [
        "/api/account/status",
        "/api/fusion/list",
        "/api/fusion/mine",
        "/api/fusion/liked",
      ])
        expect((await alice.fetch(path)).status).toBe(400);
      expect(
        (await alice.fetch("/api/fusion/like", post({ id, liked: true })))
          .status,
      ).toBe(400);
    });
  it("retries a failed/lost provider response without accepting client claims of deletion", async () => {
    const { t, alice } = await setup();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "alice" }), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error("lost provider response"))
      .mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    await alice.fetch(
      "/api/account/retire",
      post({ receipt, keepPosts: false, confirmForfeit: true, deleted: true }),
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      (
        await t.query(internal.accountRetirement.status, {
          receiptHash: await digest(receipt),
        })
      ).status,
    ).toBe("complete");
  });
  it("retires an unlinked account without touching an unrelated anonymous wallet", async () => {
    const { t, wallet } = await setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, init: RequestInit) =>
          new Response(
            JSON.stringify(
              init.method === "DELETE" ? { deleted: true } : { id: "unlinked" },
            ),
            { status: 200 },
          ),
      ),
    );
    await t
      .withIdentity({ subject: "unlinked" })
      .fetch(
        "/api/account/retire",
        post({ receipt, keepPosts: false, confirmForfeit: true }),
      );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(token),
        })
      )?._id,
    ).toBe(wallet._id);
  });
});

it("refunds a checkout fulfilled after retirement once, without reviving credits", async () => {
  const { t, wallet } = await setup();
  vi.stubEnv("STRIPE_API_KEY", "sk_test_mock");
  await t.run((ctx) =>
    ctx.db.patch(wallet._id, {
      closedAt: Date.now(),
      balance: 0,
      freeBalance: 0,
      paidBalance: 0,
    }),
  );
  const session = {
    id: "cs_test_late",
    mode: "payment",
    payment_status: "paid",
    amount_total: 100,
    currency: "jpy",
    payment_intent: "pi_test_late",
    metadata: {
      type: "monku-fusion-v1",
      incenseCount: "10",
      walletId: wallet._id,
    },
  };
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init.method! });
      let data;
      if (url.includes("/checkout/sessions/")) data = session;
      else if (url.includes("/refunds") && init.method === "GET")
        data = { object: "list", data: [], has_more: false };
      else if (url.endsWith("/refunds") && init.method === "POST")
        data = {
          id: "re_test_late",
          object: "refund",
          status: "succeeded",
          amount: 100,
        };
      else throw new Error("Unexpected external request");
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  await t.action(internal.stripe.verifySession, { sessionId: session.id });
  await t.action(internal.stripe.verifySession, { sessionId: session.id });
  expect(
    calls.filter(
      (call) => call.url.endsWith("/refunds") && call.method === "POST",
    ),
  ).toHaveLength(1);
  expect((await t.run((ctx) => ctx.db.get(wallet._id)))?.balance).toBe(0);
  expect(
    await t.run((ctx) => ctx.db.query("purchases").collect()),
  ).toMatchObject([{ refundRequired: true, refundId: "re_test_late" }]);
});

it("does not lock or delete data when the server key points at the wrong Clerk identity", async () => {
  const { t, alice, wallet } = await setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "different-app-user" }), {
          status: 200,
        }),
      ),
  );
  expect(
    (
      await alice.fetch(
        "/api/account/retire",
        post({ receipt, keepPosts: false, confirmForfeit: true }),
      )
    ).status,
  ).toBe(400);
  expect((await t.run((ctx) => ctx.db.get(wallet._id)))?.balance).toBe(5);
  expect(await t.run((ctx) => ctx.db.query("retirements").collect())).toEqual(
    [],
  );
});
