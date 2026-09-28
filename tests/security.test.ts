/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { digest } from "../convex/security";
import { fields, validateInput, validateFusion } from "../shared/fusion";
import { assertSafe } from "../convex/safety";
import { validatePaidSession, verifyWebhook } from "../convex/stripe";
import Stripe from "stripe";
const modules = import.meta.glob("../convex/**/*.ts");
const sample = Object.fromEntries(
  fields.map((key) => [key, "架空の安全なテスト内容"]),
);
function setup() {
  return convexTest(schema, modules);
}
async function wallet(t: ReturnType<typeof setup>) {
  const token = "a".repeat(64);
  await t.mutation(internal.incense.createWallet, {
    tokenHash: await digest(token),
  });
  const value = await t.query(internal.incense.authenticate, {
    tokenHash: await digest(token),
  });
  return { token, id: value!._id };
}
const post = (data: unknown, token?: string) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(data),
});
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("wallet boundaries and transactional credits", () => {
  it("registration retries preserve a spent pre-promotion balance", async () => {
    const t = setup();
    const w = await wallet(t);
    // Simulate a wallet created under the original three-use offer.
    await t.run((ctx) =>
      ctx.db.patch(w.id, { balance: 3, freeBalance: 3, paidBalance: 0 }),
    );
    const reservation = await t.mutation(internal.incense.reserve, {
      walletId: w.id,
      requestId: "registration-retry",
      inputHash: "hash",
    });
    await t.mutation(internal.incense.complete, {
      id: reservation.id,
      result: sample,
    });
    const retry = await t.mutation(internal.incense.createWallet, {
      tokenHash: await digest(w.token),
    });
    expect(retry.balance).toBe(2);
    expect(
      await t.run((ctx) => ctx.db.query("wallets").collect()),
    ).toHaveLength(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("counts only new registrations and slows a signup burst", async () => {
    vi.stubEnv("SIGNUP_BURST_LIMIT", "2");
    const t = setup();
    await t.mutation(internal.incense.createWallet, { tokenHash: "first" });
    await t.mutation(internal.incense.createWallet, { tokenHash: "second" });
    expect(
      await t.mutation(internal.incense.createWallet, { tokenHash: "first" }),
    ).toEqual({ balance: 5 });
    await expect(
      t.mutation(internal.incense.createWallet, { tokenHash: "third" }),
    ).rejects.toThrow("利用が集中");
    expect(await t.query(internal.incense.abuseStatus, {})).toMatchObject({
      signupsToday: 2,
      signupsTenMinutes: 2,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("caps free generation while preserving paid credits and idempotent refunds", async () => {
    vi.stubEnv("FREE_DAILY_GENERATION_LIMIT", "1");
    const t = setup();
    const first = await wallet(t);
    const second = await t.mutation(internal.incense.createWallet, {
      tokenHash: "second-wallet",
    });
    expect(second.balance).toBe(5);
    const secondWallet = await t.query(internal.incense.authenticate, {
      tokenHash: "second-wallet",
    });
    const free = await t.mutation(internal.incense.reserve, {
      walletId: first.id,
      requestId: "free-request",
      inputHash: "input",
    });
    expect(await t.query(internal.incense.abuseStatus, {})).toMatchObject({
      freeGenerationsToday: 1,
      freeGenerationLimit: 1,
    });
    await expect(
      t.mutation(internal.incense.reserve, {
        walletId: secondWallet!._id,
        requestId: "blocked-free",
        inputHash: "input",
      }),
    ).rejects.toThrow("無料のお試しは本日の上限");
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: "second-wallet",
        })
      )?.balance,
    ).toBe(5);

    await t.mutation(internal.incense.fulfillPayment, {
      walletId: secondWallet!._id,
      sessionId: "cs_test_paid_credit",
    });
    const paid = await t.mutation(internal.incense.reserve, {
      walletId: secondWallet!._id,
      requestId: "paid-request",
      inputHash: "input",
    });
    expect(paid.status).toBe("new");
    expect(
      await t.mutation(internal.incense.reserve, {
        walletId: secondWallet!._id,
        requestId: "paid-request",
        inputHash: "input",
      }),
    ).toMatchObject({ id: paid.id, status: "pending" });
    expect(
      await t.query(internal.incense.authenticate, {
        tokenHash: "second-wallet",
      }),
    ).toMatchObject({ balance: 14, freeBalance: 5, paidBalance: 9 });
    await t.mutation(internal.incense.refund, { id: paid.id });
    await t.mutation(internal.incense.refund, { id: paid.id });
    expect(
      await t.query(internal.incense.authenticate, {
        tokenHash: "second-wallet",
      }),
    ).toMatchObject({ balance: 15, freeBalance: 5, paidBalance: 10 });
    await t.mutation(internal.incense.refund, { id: free.id });
    expect(
      await t.query(internal.incense.authenticate, {
        tokenHash: await digest(first.token),
      }),
    ).toMatchObject({ balance: 5, freeBalance: 5, paidBalance: 0 });
    expect(await t.query(internal.incense.abuseStatus, {})).toMatchObject({
      freeGenerationsToday: 1,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("treats existing purchasers' unsplit balance as paid credit", async () => {
    vi.stubEnv("FREE_DAILY_GENERATION_LIMIT", "0");
    const t = setup();
    const legacyId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("wallets", {
        balance: 7,
        createdAt: Date.now(),
      });
      await ctx.db.insert("purchases", {
        walletId: id,
        sessionId: "cs_legacy_purchase",
        amount: 100,
        createdAt: Date.now(),
      });
      return id;
    });
    await t.mutation(internal.incense.reserve, {
      walletId: legacyId,
      requestId: "legacy-paid",
      inputHash: "input",
    });
    expect(await t.run((ctx) => ctx.db.get(legacyId))).toMatchObject({
      balance: 6,
      freeBalance: 0,
      paidBalance: 6,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("publishes only the explicitly supplied monku and keeps legacy input private", async () => {
    const t = setup();
    const w = await wallet(t);
    await t.mutation(internal.fusions.saveFusion, {
      ownerId: w.id,
      hash: "monku",
      result: sample,
      monku: "会議が長く、作業時間が取れない。",
    });
    const items = await t.query(internal.fusions.listLatest, {});
    expect(items[0].monku).toBe("会議が長く、作業時間が取れない。");
    expect(items[0]).not.toHaveProperty("rawNoise");
    await expect(
      t.mutation(internal.fusions.saveFusion, {
        ownerId: w.id,
        hash: "empty",
        result: sample,
        monku: " ",
      }),
    ).rejects.toThrow();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it("requires bearer authentication and ignores forged userId", async () => {
    const t = setup();
    await wallet(t);
    const res = await t.fetch(
      "/api/fusion/free-trial",
      post({
        noiseText: "こんにちは",
        requestId: "a".repeat(16),
        userId: "fake",
      }),
    );
    expect(res.status).toBe(400);
  });
  it("charges once for concurrent/retried request IDs and binds input", async () => {
    const t = setup();
    const w = await wallet(t);
    const args = {
      walletId: w.id,
      requestId: "same-request-001",
      inputHash: "hash",
    };
    const a = await t.mutation(internal.incense.reserve, args);
    const b = await t.mutation(internal.incense.reserve, args);
    expect(a.status).toBe("new");
    expect(b.status).toBe("pending");
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(4);
    await expect(
      t.mutation(internal.incense.reserve, { ...args, inputHash: "different" }),
    ).rejects.toThrow();
    await t.mutation(internal.incense.refund, { id: a.id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("returns failed reservations only once and recovers abandoned requests", async () => {
    const t = setup();
    const w = await wallet(t);
    const r = await t.mutation(internal.incense.reserve, {
      walletId: w.id,
      requestId: "a",
      inputHash: "hash",
    });
    await t.mutation(internal.incense.refund, { id: r.id });
    await t.mutation(internal.incense.refund, { id: r.id });
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(5);
    await t.mutation(internal.incense.reserve, {
      walletId: w.id,
      requestId: "b",
      inputHash: "hash",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(5);
  });
  it("does not refund a successful request and expires private results", async () => {
    const t = setup();
    const w = await wallet(t);
    const r = await t.mutation(internal.incense.reserve, {
      walletId: w.id,
      requestId: "a",
      inputHash: "hash",
    });
    await t.mutation(internal.incense.complete, { id: r.id, result: sample });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(4);
    expect(await t.run((ctx) => ctx.db.get(r.id))).not.toHaveProperty("result");
  });
  it("fulfills duplicate payment once", async () => {
    const t = setup();
    const w = await wallet(t);
    const args = { walletId: w.id, sessionId: "cs_test_same" };
    await t.mutation(internal.incense.fulfillPayment, args);
    await t.mutation(internal.incense.fulfillPayment, args);
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(15);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("redeems pairing once and rejects expired pairing", async () => {
    const t = setup();
    const w = await wallet(t);
    await t.mutation(internal.incense.createPairing, {
      walletId: w.id,
      codeHash: "pair",
    });
    await t.mutation(internal.incense.redeemPairing, {
      codeHash: "pair",
      tokenHash: "new",
    });
    await expect(
      t.mutation(internal.incense.redeemPairing, {
        codeHash: "pair",
        tokenHash: "other",
      }),
    ).rejects.toThrow();
    expect(
      (await t.query(internal.incense.authenticate, { tokenHash: "new" }))?._id,
    ).toBe(w.id);
    await t.mutation(internal.incense.createPairing, {
      walletId: w.id,
      codeHash: "expires",
    });
    vi.advanceTimersByTime(600001);
    await expect(
      t.mutation(internal.incense.redeemPairing, {
        codeHash: "expires",
        tokenHash: "other",
      }),
    ).rejects.toThrow();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("rejects exhausted credits and throttles repeated costly operations", async () => {
    const t = setup();
    const w = await wallet(t);
    for (let i = 0; i < 5; i++)
      await t.mutation(internal.incense.reserve, {
        walletId: w.id,
        requestId: String(i),
        inputHash: "hash",
      });
    await expect(
      t.mutation(internal.incense.reserve, {
        walletId: w.id,
        requestId: "exhausted",
        inputHash: "hash",
      }),
    ).rejects.toThrow();
    for (let i = 0; i < 6; i++)
      await t.mutation(internal.incense.throttle, {
        walletId: w.id,
        operation: "safety",
      });
    await expect(
      t.mutation(internal.incense.throttle, {
        walletId: w.id,
        operation: "safety",
      }),
    ).rejects.toThrow();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});
describe("payment verification", () => {
  const paid = {
    id: "cs_test_1",
    mode: "payment",
    payment_status: "paid",
    amount_total: 100,
    currency: "jpy",
    metadata: {
      type: "monku-fusion-v1",
      incenseCount: "10",
      walletId: "owner",
    },
  } as unknown as Stripe.Checkout.Session;
  it("checks owner, amount, currency, paid state and product", () => {
    expect(validatePaidSession(paid, "owner")).toBe("owner");
    for (const altered of [
      { amount_total: 1 },
      { currency: "usd" },
      { payment_status: "unpaid" },
      { mode: "subscription" },
      { metadata: { type: "other" } },
    ])
      expect(() =>
        validatePaidSession(
          { ...paid, ...altered } as Stripe.Checkout.Session,
          "owner",
        ),
      ).toThrow();
    expect(() => validatePaidSession(paid, "someone-else")).toThrow();
  });
  it("rejects missing signatures even when a webhook secret exists", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    await expect(verifyWebhook("{}", null)).rejects.toThrow();
    const t = setup();
    const r = await t.fetch(
      "/api/stripe/webhook",
      post({
        type: "checkout.session.completed",
        data: { object: { metadata: { type: "monku-fusion-v1" } } },
      }),
    );
    expect(r.status).toBe(400);
    expect(await t.run((ctx) => ctx.db.query("purchases").collect())).toEqual(
      [],
    );
  });
  it("accepts an authentic test signature and rejects a tampered body", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_API_KEY", "sk_test_fake");
    const stripe = new Stripe("sk_test_fake");
    const payload = JSON.stringify({ id: "evt_test", type: "test.event" });
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_test",
    });
    expect((await verifyWebhook(payload, header)).id).toBe("evt_test");
    await expect(verifyWebhook(payload + " ", header)).rejects.toThrow();
  });
});
describe("privacy and provider failure", () => {
  it("rejects oversized input and malformed model output; redacts obvious PII", () => {
    expect(() => validateInput("x".repeat(4001))).toThrow();
    expect(validateInput("連絡 test@example.com")).not.toContain(
      "test@example.com",
    );
    expect(() => validateFusion({})).toThrow();
  });
  it("fails closed on missing key, upstream failure and malformed safety answer", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("TYPESAFE_API_KEY", "");
    await expect(assertSafe("text")).rejects.toThrow();
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    f.mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(assertSafe("text")).rejects.toThrow();
    f.mockResolvedValue(new Response("{}"));
    await expect(assertSafe("text")).rejects.toThrow();
  });
  it("uses the Gemini backup once and requires two explicit safe booleans", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const geminiAnswer = (answer: string) =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: answer }] } }],
        }),
      );
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(
        geminiAnswer('{"has_pii":false,"is_threat":false}'),
      );
    vi.stubGlobal("fetch", f);
    await expect(assertSafe("text")).resolves.toBeUndefined();
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[0][0])).toContain("api.typesafe.ai");
    expect(String(f.mock.calls[1][0])).toContain(
      "generativelanguage.googleapis.com",
    );

    vi.stubEnv("TYPESAFE_API_KEY", "");
    for (const answer of [
      "{}",
      '{"has_pii":false}',
      '{"has_pii":"false","is_threat":false}',
    ]) {
      f.mockResolvedValueOnce(geminiAnswer(answer));
      await expect(assertSafe("text")).rejects.toThrow("安全確認の応答が不正");
    }
    f.mockResolvedValueOnce(geminiAnswer('{"has_pii":true,"is_threat":false}'));
    await expect(assertSafe("text")).rejects.toThrow(
      "個人情報または危険な表現",
    );
    expect(f).toHaveBeenCalledTimes(6);
  });
  it("rejects a primary unsafe verdict without calling the backup", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    vi.stubEnv("GEMINI_API_KEY", "test");
    const f = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            has_pii: { type: "noul", noul: 0.8 },
            is_threat: { type: "noul", noul: 0 },
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", f);
    await expect(assertSafe("text")).rejects.toThrow(
      "個人情報または危険な表現",
    );
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("does not charge when service configuration is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const t = setup();
    const w = await wallet(t);
    const r = await t.fetch(
      "/api/fusion/free-trial",
      post({ noiseText: "架空入力", requestId: "a".repeat(16) }, w.token),
    );
    expect(r.status).toBe(400);
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(5);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("refunds if safety provider fails and makes no generation request", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", f);
    const t = setup();
    const w = await wallet(t);
    const r = await t.fetch(
      "/api/fusion/free-trial",
      post({ noiseText: "架空入力", requestId: "a".repeat(16) }, w.token),
    );
    expect(r.status).toBe(400);
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[0][0])).toContain("api.typesafe.ai");
    expect(String(f.mock.calls[1][0])).toContain(
      "generativelanguage.googleapis.com",
    );
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(5);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("requires publication consent and never lists legacy unreviewed records", async () => {
    const t = setup();
    const w = await wallet(t);
    const res = await t.fetch(
      "/api/fusion/save",
      post({ result: sample }, w.token),
    );
    expect(res.status).toBe(400);
    await t.run(async (ctx) => {
      await ctx.db.insert("fusions", {
        ...validateFusion(sample),
        hash: "old",
        rawNoise: "PRIVATE",
        createdAt: Date.now(),
      });
    });
    expect(await t.query(internal.fusions.listLatest, {})).toEqual([]);
    const id = await t.mutation(internal.fusions.saveFusion, {
      ownerId: w.id,
      hash: "new",
      result: sample,
    });
    const items = await t.query(internal.fusions.listLatest, {});
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty("rawNoise");
    expect(items[0]).not.toHaveProperty("ownerId");
    await t.mutation(internal.fusions.remove, { id, ownerId: w.id });
    expect(await t.query(internal.fusions.listLatest, {})).toEqual([]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});
describe("full request behavior", () => {
  it("retries HTTP registration without resetting the same wallet", async () => {
    const t = setup();
    const w = await wallet(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.id, { balance: 2 });
    });
    vi.stubEnv("TURNSTILE_SECRET", "test");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "fusion.monku.ai");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            action: "signup",
            hostname: "fusion.monku.ai",
          }),
        ),
      ),
    );
    const res = await t.fetch(
      "/api/session",
      post({ turnstileToken: "fresh-challenge", registrationToken: w.token }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: w.token, balance: 2 });
    expect(
      await t.run((ctx) => ctx.db.query("wallets").collect()),
    ).toHaveLength(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("checks the edited monku before publishing and refuses unsafe text", async () => {
    const t = setup();
    const w = await wallet(t);
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const mock = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", mock);
    const res = await t.fetch(
      "/api/fusion/save",
      post(
        { result: sample, monku: "会議が長い", publishConsent: true },
        w.token,
      ),
    );
    expect(res.status).toBe(400);
    expect(mock.mock.calls[0][1].body).toContain("会議が長い");
    expect(await t.query(internal.fusions.listLatest, {})).toEqual([]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it("checks turnstile hostname/action and rejects unverified signups", async () => {
    const t = setup();
    vi.stubEnv("TURNSTILE_SECRET", "test");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "fusion.monku.ai");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          action: "other",
          hostname: "fusion.monku.ai",
        }),
      ),
    );
    expect(
      (await t.fetch("/api/session", post({ turnstileToken: "test" }))).status,
    ).toBe(400);
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          action: "signup",
          hostname: "wrong.example",
        }),
      ),
    );
    expect(
      (await t.fetch("/api/session", post({ turnstileToken: "test" }))).status,
    ).toBe(400);
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          action: "signup",
          hostname: "fusion.monku.ai",
        }),
      ),
    );
    const res = await t.fetch("/api/session", post({ turnstileToken: "test" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.token).toMatch(/^[a-f0-9]{64}$/);
    expect(data.balance).toBe(5);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("generates privately, replays completed request without new calls or consumption", async () => {
    const t = setup();
    const w = await wallet(t);
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const safe = {
      answers: {
        has_pii: { type: "noul", noul: 0.01 },
        is_threat: { type: "noul", noul: 0.01 },
      },
    };
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(safe)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify(sample) }] } },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(safe)));
    vi.stubGlobal("fetch", f);
    const request = { noiseText: "架空の入力", requestId: "r".repeat(16) };
    const a = await t.fetch("/api/fusion/free-trial", post(request, w.token));
    expect(a.status).toBe(200);
    const b = await t.fetch("/api/fusion/free-trial", post(request, w.token));
    expect(b.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(4);
    expect(await t.query(internal.fusions.listLatest, {})).toEqual([]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("generates with Gemini safety checks when TypeSafe is not configured", async () => {
    const t = setup();
    const w = await wallet(t);
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const safe = JSON.stringify({ has_pii: false, is_threat: false });
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: safe }] } }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify(sample) }] } },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: safe }] } }],
          }),
        ),
      );
    vi.stubGlobal("fetch", f);
    const res = await t.fetch(
      "/api/fusion/free-trial",
      post({ noiseText: "架空の入力", requestId: "g".repeat(16) }, w.token),
    );
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
    expect(
      f.mock.calls.every(([url]) =>
        String(url).includes("generativelanguage.googleapis.com"),
      ),
    ).toBe(true);
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(4);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("blocks free API requests before calling providers while paid requests continue", async () => {
    vi.stubEnv("FREE_DAILY_GENERATION_LIMIT", "0");
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const t = setup();
    const w = await wallet(t);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const blocked = await t.fetch(
      "/api/fusion/free-trial",
      post({ noiseText: "架空の入力", requestId: "b".repeat(16) }, w.token),
    );
    expect(blocked.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(5);

    await t.mutation(internal.incense.fulfillPayment, {
      walletId: w.id,
      sessionId: "cs_test_paid_api",
    });
    const safe = JSON.stringify({
      answers: {
        has_pii: { type: "noul", noul: 0 },
        is_threat: { type: "noul", noul: 0 },
      },
    });
    f.mockResolvedValueOnce(new Response(safe))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify(sample) }] } },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(safe));
    const allowed = await t.fetch(
      "/api/fusion/free-trial",
      post({ noiseText: "架空の入力", requestId: "p".repeat(16) }, w.token),
    );
    expect(allowed.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
    expect(
      await t.query(internal.incense.authenticate, {
        tokenHash: await digest(w.token),
      }),
    ).toMatchObject({ balance: 14, freeBalance: 5, paidBalance: 9 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("rejects malformed AI output and refunds it", async () => {
    const t = setup();
    const w = await wallet(t);
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              answers: {
                has_pii: { type: "noul", noul: 0 },
                is_threat: { type: "noul", noul: 0 },
              },
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: "{}" }] } }],
            }),
          ),
        ),
    );
    expect(
      (
        await t.fetch(
          "/api/fusion/free-trial",
          post({ noiseText: "架空の入力", requestId: "m".repeat(16) }, w.token),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await t.query(internal.incense.authenticate, {
          tokenHash: await digest(w.token),
        })
      )?.balance,
    ).toBe(5);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("does not permit another wallet to delete a publication", async () => {
    const t = setup();
    const w = await wallet(t);
    await t.mutation(internal.incense.createWallet, { tokenHash: "other" });
    const other = await t.query(internal.incense.authenticate, {
      tokenHash: "other",
    });
    const id = await t.mutation(internal.fusions.saveFusion, {
      ownerId: w.id,
      hash: "test",
      result: sample,
    });
    await expect(
      t.mutation(internal.fusions.remove, { ownerId: other!._id, id }),
    ).rejects.toThrow();
    expect(await t.query(internal.fusions.listLatest, {})).toHaveLength(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});
