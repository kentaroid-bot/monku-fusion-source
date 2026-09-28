import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { digest } from "./security";

export async function assertAccountActive(
  ctx: QueryCtx | MutationCtx,
  subject: string,
) {
  const hash = await digest(subject);
  if (
    await ctx.db
      .query("retirements")
      .withIndex("by_subject_hash", (q) => q.eq("subjectHash", hash))
      .unique()
  )
    throw new Error("このアカウントは退会処理中、または退会済みです。");
}
export const active = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    await assertAccountActive(ctx, subject);
  },
});
// Verify the existing identity with the configured Clerk instance before locking
// data. A key from another application must not turn a 404 into a false success.
export const prepare = internalAction({
  args: {
    subject: v.string(),
    receiptHash: v.string(),
    keepPosts: v.boolean(),
  },
  handler: async (ctx, args): Promise<void> => {
    const prior = await ctx.runQuery(internal.accountRetirement.existing, {
      subject: args.subject,
    });
    if (!prior) {
      const response = await fetch(
        `https://api.clerk.com/v1/users/${encodeURIComponent(args.subject)}`,
        {
          headers: { Authorization: `Bearer ${processSecret()}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok || (await response.json()).id !== args.subject)
        throw new Error("退会設定を確認できません。お問い合わせください。");
    }
    await ctx.runMutation(internal.accountRetirement.begin, args);
  },
});
export const existing = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    const hash = await digest(subject);
    return !!(await ctx.db
      .query("retirements")
      .withIndex("by_subject_hash", (q) => q.eq("subjectHash", hash))
      .unique());
  },
});
export const begin = internalMutation({
  args: {
    subject: v.string(),
    receiptHash: v.string(),
    keepPosts: v.boolean(),
  },
  handler: async (ctx, args) => {
    const subjectHash = await digest(args.subject);
    const old = await ctx.db
      .query("retirements")
      .withIndex("by_subject_hash", (q) => q.eq("subjectHash", subjectHash))
      .unique();
    if (old) {
      if (
        old.receiptHash !== args.receiptHash ||
        old.keepPosts !== args.keepPosts
      )
        throw new Error("退会を受け付け済みです。完了までお待ちください。");
      return old._id;
    }
    if (
      await ctx.db
        .query("retirements")
        .withIndex("by_receipt", (q) => q.eq("receiptHash", args.receiptHash))
        .unique()
    )
      throw new Error("退会の受付情報を確認できません。");
    const account = await ctx.db
      .query("accountWallets")
      .withIndex("by_subject", (q) => q.eq("subject", args.subject))
      .unique();
    // Lock all old wallet capabilities atomically before the identity is removed.
    if (account)
      await ctx.db.patch(account.walletId, {
        closedAt: Date.now(),
        balance: 0,
        freeBalance: 0,
        paidBalance: 0,
      });
    const id = await ctx.db.insert("retirements", {
      ...args,
      subjectHash,
      walletId: account?.walletId,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.accountRetirement.runDeletion, {
      id,
    });
    return id;
  },
});
export const getJob = internalQuery({
  args: { id: v.id("retirements") },
  handler: (ctx, { id }) => ctx.db.get(id),
});
export const status = internalQuery({
  args: { receiptHash: v.string() },
  handler: async (ctx, { receiptHash }) => {
    const job = await ctx.db
      .query("retirements")
      .withIndex("by_receipt", (q) => q.eq("receiptHash", receiptHash))
      .unique();
    return {
      status: job?.status ?? "unknown",
      delayed: (job?.attempts ?? 0) > 1,
    };
  },
});
export const retry = internalMutation({
  args: { id: v.id("retirements") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job || job.status !== "pending") return;
    await ctx.db.patch(id, { attempts: job.attempts + 1 });
    // Persistent retry survives tab closure and a lost Clerk response.
    await ctx.scheduler.runAfter(
      Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6)),
      internal.accountRetirement.runDeletion,
      { id },
    );
  },
});
export const runDeletion = internalAction({
  args: { id: v.id("retirements") },
  handler: async (ctx, { id }): Promise<void> => {
    const job = await ctx.runQuery(internal.accountRetirement.getJob, { id });
    if (!job || job.status !== "pending" || !job.subject) return;
    try {
      const secret = processSecret();
      const response = await fetch(
        `https://api.clerk.com/v1/users/${encodeURIComponent(job.subject)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      // A repeated deletion after a lost response returns 404.
      if (!response.ok && response.status !== 404)
        throw new Error("Clerk deletion pending");
    } catch {
      await ctx.runMutation(internal.accountRetirement.retry, { id });
      return;
    }
    await ctx.runMutation(internal.accountRetirement.identityDeleted, { id });
  },
});
function processSecret() {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("退会設定がまだ完了していません。");
  return key;
}
export const identityDeleted = internalMutation({
  args: { id: v.id("retirements") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job || job.status !== "pending") return;
    await ctx.db.patch(id, { status: "cleaning" });
    await ctx.scheduler.runAfter(0, internal.accountRetirement.cleanup, { id });
  },
});
export const cleanup = internalMutation({
  args: { id: v.id("retirements") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job || job.status !== "cleaning" || !job.subject) return;
    let more = false;
    const likes = await ctx.db
      .query("accountLikes")
      .withIndex("by_subject", (q) => q.eq("subject", job.subject!))
      .take(100);
    for (const like of likes) await ctx.db.delete(like._id);
    more ||= likes.length === 100;
    if (job.walletId) {
      const walletId = job.walletId;
      const posts = await ctx.db
        .query("fusions")
        .withIndex("by_owner", (q) => q.eq("ownerId", walletId))
        .take(50);
      for (const post of posts) {
        if (job.keepPosts && post.published === true)
          await ctx.db.patch(post._id, {
            ownerId: undefined,
            hash: `retained:${post._id}`,
            rawNoise: "",
          });
        else {
          await ctx.db.delete(post._id);
          await ctx.scheduler.runAfter(0, internal.fusions.cleanLikes, {
            id: post._id,
          });
        }
      }
      more ||= posts.length === 50;
      const credentials = await ctx.db
        .query("credentials")
        .withIndex("by_wallet", (q) => q.eq("walletId", walletId))
        .take(100);
      const pairings = await ctx.db
        .query("pairings")
        .withIndex("by_wallet", (q) => q.eq("walletId", walletId))
        .take(100);
      const requests = await ctx.db
        .query("requests")
        .withIndex("by_wallet", (q) => q.eq("walletId", walletId))
        .take(100);
      for (const row of [...credentials, ...pairings, ...requests])
        await ctx.db.delete(row._id);
      more ||= [credentials, pairings, requests].some(
        (rows) => rows.length === 100,
      );
      // Financial records retain a closed anonymous wallet for reconciliation.
    }
    if (more) {
      await ctx.scheduler.runAfter(0, internal.accountRetirement.cleanup, {
        id,
      });
      return;
    }
    const account = await ctx.db
      .query("accountWallets")
      .withIndex("by_subject", (q) => q.eq("subject", job.subject!))
      .unique();
    if (account) await ctx.db.delete(account._id);
    await ctx.db.patch(id, {
      status: "complete",
      subject: undefined,
      walletId: undefined,
      completedAt: Date.now(),
    });
  },
});
