import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

import { assertAccountActive } from "./accountRetirement";

const day = 86400000;
const tenMinutes = 600000;

function configuredLimit(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d{1,4}$/.test(raw)) throw new Error("利用上限の設定が不正です。");
  const limit = Number(raw);
  if (limit > 1000) throw new Error("利用上限の設定が不正です。");
  return limit;
}

function quotaKey(key: string, ms: number): string {
  return `${key}:${Math.floor(Date.now() / ms)}`;
}

async function takeQuota(
  ctx: MutationCtx,
  key: string,
  max: number,
  ms: number,
): Promise<boolean> {
  const fullKey = quotaKey(key, ms);
  const entry = await ctx.db
    .query("limits")
    .withIndex("by_key", (q) => q.eq("key", fullKey))
    .unique();
  if ((entry?.count || 0) >= max) return false;
  if (entry) await ctx.db.patch(entry._id, { count: entry.count + 1 });
  else {
    const id = await ctx.db.insert("limits", {
      key: fullKey,
      count: 1,
      expiresAt: Date.now() + ms * 2,
    });
    await ctx.scheduler.runAfter(ms * 2, internal.incense.deleteLimit, { id });
  }
  return true;
}

async function quota(ctx: MutationCtx, key: string, max: number, ms: number) {
  if (!(await takeQuota(ctx, key, max, ms)))
    throw new Error("利用が集中しています。時間をおいてお試しください。");
}

async function hasPurchase(ctx: MutationCtx, walletId: Id<"wallets">) {
  return !!(await ctx.db
    .query("purchases")
    .withIndex("by_wallet", (q) => q.eq("walletId", walletId))
    .first());
}

async function credits(ctx: MutationCtx, wallet: Doc<"wallets">) {
  if (wallet.freeBalance !== undefined && wallet.paidBalance !== undefined) {
    if (wallet.freeBalance + wallet.paidBalance !== wallet.balance)
      throw new Error("残数を確認できませんでした。");
    return { free: wallet.freeBalance, paid: wallet.paidBalance };
  }
  if (wallet.freeBalance !== undefined || wallet.paidBalance !== undefined)
    throw new Error("残数を確認できませんでした。");
  // Preserve access for legacy purchasers: their unsplit balance is paid credit.
  return (await hasPurchase(ctx, wallet._id))
    ? { free: 0, paid: wallet.balance }
    : { free: wallet.balance, paid: 0 };
}
export const deleteLimit = internalMutation({
  args: { id: v.id("limits") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
export const authenticate = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (
      !credential ||
      (credential.expiresAt !== undefined && credential.expiresAt <= Date.now())
    )
      return null;
    const wallet = await ctx.db.get(credential.walletId);
    return wallet?.closedAt === undefined ? wallet : null;
  },
});
export const accountWallet = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    await assertAccountActive(ctx, subject);
    const account = await ctx.db
      .query("accountWallets")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
    return account ? await ctx.db.get(account.walletId) : null;
  },
});
export const linkAccount = internalMutation({
  args: { subject: v.string(), tokenHash: v.string() },
  handler: async (ctx, { subject, tokenHash }) => {
    await assertAccountActive(ctx, subject);
    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!credential) throw new Error("接続情報を確認してください。");
    const wallet = await ctx.db.get(credential.walletId);
    if (!wallet || wallet.closedAt !== undefined)
      throw new Error("接続情報を確認してください。");
    const existing = await ctx.db
      .query("accountWallets")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
    if (existing) {
      if (existing.walletId !== wallet._id)
        throw new Error(
          "このアカウントには別の残数が登録されています。接続を切り替える前に確認してください。",
        );
      return { balance: wallet.balance };
    }
    const claimed = await ctx.db
      .query("accountWallets")
      .withIndex("by_wallet", (q) => q.eq("walletId", wallet._id))
      .unique();
    if (claimed) throw new Error("この接続は別のアカウントに登録済みです。");
    await ctx.db.insert("accountWallets", {
      subject,
      walletId: wallet._id,
      createdAt: Date.now(),
    });
    return { balance: wallet.balance };
  },
});
export const createWallet = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const existing = await ctx.db
      .query("credentials")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (existing) {
      const wallet = await ctx.db.get(existing.walletId);
      if (!wallet || wallet.closedAt !== undefined)
        throw new Error("接続情報を確認してください。");
      return { balance: wallet.balance };
    }
    await quota(
      ctx,
      "signup-burst",
      configuredLimit("SIGNUP_BURST_LIMIT", 30),
      tenMinutes,
    );
    await quota(ctx, "signups", 100, day);
    // Promotional grant; the standard public offer remains three uses.
    const walletId = await ctx.db.insert("wallets", {
      balance: 5,
      freeBalance: 5,
      paidBalance: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("credentials", { tokenHash, walletId });
    return { balance: 5 };
  },
});
export const throttle = internalMutation({
  args: { walletId: v.id("wallets"), operation: v.string() },
  handler: async (ctx, { walletId, operation }) => {
    await quota(ctx, `${walletId}:${operation}`, 6, 60000);
    if (operation !== "generate")
      await quota(ctx, `global:${operation}`, 1000, day);
  },
});
export const createPairing = internalMutation({
  args: {
    walletId: v.id("wallets"),
    codeHash: v.string(),
    accountSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet || wallet.closedAt !== undefined)
      throw new Error("接続情報を確認してください。");
    if (args.accountSubject) {
      await assertAccountActive(ctx, args.accountSubject);
      const account = await ctx.db
        .query("accountWallets")
        .withIndex("by_subject", (q) => q.eq("subject", args.accountSubject!))
        .unique();
      if (account?.walletId !== wallet._id)
        throw new Error("ログインと接続を確認してください。");
    }
    const id = await ctx.db.insert("pairings", {
      ...args,
      expiresAt: Date.now() + 600000,
    });
    await ctx.scheduler.runAfter(600000, internal.incense.deletePairing, {
      id,
    });
  },
});
export const deletePairing = internalMutation({
  args: { id: v.id("pairings") },
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});
export const redeemPairing = internalMutation({
  args: { codeHash: v.string(), tokenHash: v.string() },
  handler: async (ctx, { codeHash, tokenHash }) => {
    const pairing = await ctx.db
      .query("pairings")
      .withIndex("by_code", (q) => q.eq("codeHash", codeHash))
      .unique();
    if (!pairing || pairing.expiresAt <= Date.now())
      throw new Error("接続コードが無効、使用済み、または期限切れです。");
    const wallet = await ctx.db.get(pairing.walletId);
    if (!wallet || wallet.closedAt !== undefined)
      throw new Error("接続情報を確認してください。");
    if (pairing.accountSubject) {
      await assertAccountActive(ctx, pairing.accountSubject);
      const account = await ctx.db
        .query("accountWallets")
        .withIndex("by_subject", (q) =>
          q.eq("subject", pairing.accountSubject!),
        )
        .unique();
      if (account?.walletId !== wallet._id)
        throw new Error("接続コードが無効です。");
    }
    await ctx.db.delete(pairing._id);
    await ctx.db.insert("credentials", {
      walletId: pairing.walletId,
      tokenHash,
      ...(pairing.accountSubject
        ? {
            accountSubject: pairing.accountSubject,
            expiresAt: Date.now() + 30 * day,
            createdAt: Date.now(),
          }
        : {}),
    });
  },
});
// Only a code explicitly issued by a signed-in owner can grant archive access.
// Legacy wallet tokens never inherit account authority when their wallet is linked.
export const extensionConnection = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!credential)
      return { connected: false, accountLinked: false, expired: false };
    if (
      credential.expiresAt !== undefined &&
      credential.expiresAt <= Date.now()
    )
      return { connected: false, accountLinked: false, expired: true };
    const wallet = await ctx.db.get(credential.walletId);
    if (!wallet || wallet.closedAt !== undefined)
      return { connected: false, accountLinked: false, expired: false };
    let subject: string | undefined;
    if (credential.accountSubject) {
      await assertAccountActive(ctx, credential.accountSubject);
      const account = await ctx.db
        .query("accountWallets")
        .withIndex("by_subject", (q) =>
          q.eq("subject", credential.accountSubject!),
        )
        .unique();
      if (account?.walletId !== wallet._id)
        throw new Error("接続情報を確認してください。");
      subject = credential.accountSubject;
    }
    return {
      connected: true,
      accountLinked: !!subject,
      expired: false,
      balance: wallet.balance,
      expiresAt: credential.expiresAt,
      subject,
    };
  },
});
export const listExtensionConnections = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    await assertAccountActive(ctx, subject);
    const account = await ctx.db
      .query("accountWallets")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
    if (!account) return [];
    const credentials = await ctx.db
      .query("credentials")
      .withIndex("by_wallet", (q) => q.eq("walletId", account.walletId))
      .collect();
    return credentials
      .filter((c) => c.accountSubject === subject)
      .map((c) => ({
        id: c._id,
        createdAt: c.createdAt,
        expiresAt: c.expiresAt,
      }));
  },
});
export const revokeExtensionConnection = internalMutation({
  args: { subject: v.string(), id: v.id("credentials") },
  handler: async (ctx, { subject, id }) => {
    await assertAccountActive(ctx, subject);
    const credential = await ctx.db.get(id);
    if (!credential) return;
    const account = await ctx.db
      .query("accountWallets")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
    if (
      credential.accountSubject !== subject ||
      credential.walletId !== account?.walletId
    )
      throw new Error("この接続は解除できません。");
    await ctx.db.delete(id);
  },
});
export const disconnectExtensionConnection = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!credential) return;
    if (!credential.accountSubject)
      throw new Error("アカウント連携された接続ではありません。");
    await ctx.db.delete(credential._id);
  },
});
export const reserve = internalMutation({
  args: {
    walletId: v.id("wallets"),
    requestId: v.string(),
    inputHash: v.string(),
  },
  handler: async (ctx, args) => {
    const currentWallet = await ctx.db.get(args.walletId);
    if (!currentWallet || currentWallet.closedAt !== undefined)
      throw new Error("接続情報を確認してください。");
    const old = await ctx.db
      .query("requests")
      .withIndex("by_request", (q) =>
        q.eq("walletId", args.walletId).eq("requestId", args.requestId),
      )
      .unique();
    if (old) {
      if (old.inputHash !== args.inputHash)
        throw new Error("同じ処理IDを別の入力には使えません。");
      return { id: old._id, status: old.status, result: old.result };
    }
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet || wallet.balance < 1)
      throw new Error("利用回数が残っていません。追加購入してください。");
    const available = await credits(ctx, wallet);
    let creditSource: "free" | "paid";
    if (
      available.free > 0 &&
      (await takeQuota(
        ctx,
        "free-generations",
        configuredLimit("FREE_DAILY_GENERATION_LIMIT", 60),
        day,
      ))
    ) {
      creditSource = "free";
      available.free -= 1;
    } else if (available.paid > 0) {
      creditSource = "paid";
      available.paid -= 1;
    } else {
      throw new Error(
        "無料のお試しは本日の上限に達しました。時間をおいてお試しください。",
      );
    }
    await ctx.db.patch(wallet._id, {
      balance: wallet.balance - 1,
      freeBalance: available.free,
      paidBalance: available.paid,
    });
    const id = await ctx.db.insert("requests", {
      ...args,
      status: "pending",
      creditSource,
      createdAt: Date.now(),
    });
    // Crash recovery: atomic, idempotent refund even if the action is terminated.
    await ctx.scheduler.runAfter(180000, internal.incense.refund, { id });
    await ctx.scheduler.runAfter(86400000, internal.incense.expireResult, {
      id,
    });
    return { id, status: "new" };
  },
});
export const complete = internalMutation({
  args: { id: v.id("requests"), result: v.any() },
  handler: async (ctx, { id, result }) => {
    const request = await ctx.db.get(id);
    if (!request || request.status !== "pending")
      throw new Error("処理の期限が切れました。");
    const wallet = await ctx.db.get(request.walletId);
    if (!wallet || wallet.closedAt !== undefined)
      throw new Error("処理の期限が切れました。");
    await ctx.db.patch(id, { status: "complete", result });
  },
});
export const refund = internalMutation({
  args: { id: v.id("requests") },
  handler: async (ctx, { id }) => {
    const request = await ctx.db.get(id);
    if (!request || request.status !== "pending") return;
    const wallet = await ctx.db.get(request.walletId);
    if (wallet && wallet.closedAt === undefined) {
      const available = await credits(ctx, wallet);
      const source =
        request.creditSource ||
        ((await hasPurchase(ctx, wallet._id)) ? "paid" : "free");
      await ctx.db.patch(wallet._id, {
        balance: wallet.balance + 1,
        freeBalance: available.free + (source === "free" ? 1 : 0),
        paidBalance: available.paid + (source === "paid" ? 1 : 0),
      });
    }
    await ctx.db.patch(id, { status: "refunded" });
  },
});
export const expireResult = internalMutation({
  args: { id: v.id("requests") },
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await ctx.db.patch(id, { result: undefined });
  },
});
export const fulfillPayment = internalMutation({
  args: { sessionId: v.string(), walletId: v.id("wallets") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("purchases")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (existing)
      return {
        refundRequired: existing.refundRequired === true && !existing.refundId,
      };
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet) throw new Error("Wallet not found");
    if (wallet.closedAt !== undefined) {
      await ctx.db.insert("purchases", {
        ...args,
        amount: 100,
        createdAt: Date.now(),
        refundRequired: true,
      });
      return { refundRequired: true };
    }
    const available = await credits(ctx, wallet);
    await ctx.db.insert("purchases", {
      ...args,
      amount: 100,
      createdAt: Date.now(),
    });
    await ctx.db.patch(wallet._id, {
      balance: wallet.balance + 10,
      freeBalance: available.free,
      paidBalance: available.paid + 10,
    });
    return { refundRequired: false };
  },
});

export const abuseStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const count = async (key: string, ms: number) =>
      (
        await ctx.db
          .query("limits")
          .withIndex("by_key", (q) => q.eq("key", quotaKey(key, ms)))
          .unique()
      )?.count || 0;
    return {
      signupsToday: await count("signups", day),
      signupsTenMinutes: await count("signup-burst", tenMinutes),
      freeGenerationsToday: await count("free-generations", day),
      freeGenerationLimit: configuredLimit("FREE_DAILY_GENERATION_LIMIT", 60),
    };
  },
});

export const recordRetiredRefund = internalMutation({
  args: { sessionId: v.string(), refundId: v.string() },
  handler: async (ctx, { sessionId, refundId }) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (!purchase?.refundRequired) throw new Error("Refund not expected");
    if (!purchase.refundId) await ctx.db.patch(purchase._id, { refundId });
  },
});
