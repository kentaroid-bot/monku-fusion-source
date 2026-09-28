import { internalQuery, internalMutation } from "./_generated/server";
import { assertAccountActive } from "./accountRetirement";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { validateFusion, validateInput } from "../shared/fusion";
import { validateGenres } from "../shared/idea-metadata";
import { genreValidator, modeValidator } from "./ideaMetadata";
export const saveFusion = internalMutation({
  args: {
    ownerId: v.id("wallets"),
    hash: v.string(),
    result: v.any(),
    monku: v.optional(v.string()),
    mode: v.optional(modeValidator),
    genres: v.optional(v.array(genreValidator)),
  },
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.ownerId);
    if (!wallet || wallet.closedAt !== undefined)
      throw new Error("接続情報を確認してください。");
    const result = validateFusion(args.result);
    const genres = validateGenres(args.genres ?? []);
    const existing = await ctx.db
      .query("fusions")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("fusions", {
      ...result,
      rawNoise: "",
      monku: args.monku === undefined ? undefined : validateInput(args.monku),
      mode: args.mode,
      genre1: genres[0],
      genre2: genres[1],
      hash: args.hash,
      ownerId: args.ownerId,
      published: true,
      likesCount: 0,
      createdAt: Date.now(),
    });
  },
});
export const listLatest = internalQuery({
  args: { genre: v.optional(genreValidator) },
  handler: async (ctx, { genre }) => {
    const rows = await ctx.db
      .query("fusions")
      .withIndex("by_published", (q) => q.eq("published", true))
      .order("desc")
      .take(5);
    // Filtering must not expand anonymous access beyond the same latest five.
    return rows
      .filter((row) => !genre || row.genre1 === genre || row.genre2 === genre)
      .map(publicFusion);
  },
});
function publicFusion(row: import("./_generated/dataModel").Doc<"fusions">) {
  return {
    id: row._id,
    ...validateFusion(row),
    createdAt: row.createdAt,
    ...(row.monku === undefined ? {} : { monku: row.monku }),
    ...(row.mode === undefined ? {} : { mode: row.mode }),
    ...(row.genre1 === undefined
      ? {}
      : {
          genres: [row.genre1, ...(row.genre2 ? [row.genre2] : [])],
        }),
  };
}
export const listForAccount = internalQuery({
  args: {
    subject: v.string(),
    cursor: v.optional(v.string()),
    genre: v.optional(genreValidator),
  },
  handler: async (ctx, { subject, cursor, genre }) => {
    let query = ctx.db
      .query("fusions")
      .withIndex("by_published", (q) => q.eq("published", true))
      .order("desc");
    if (genre)
      query = query.filter((q) =>
        q.or(q.eq(q.field("genre1"), genre), q.eq(q.field("genre2"), genre)),
      );
    const page = await query.paginate({
      cursor: cursor ?? null,
      numItems: 20,
      maximumRowsRead: 200,
    });
    const items = await Promise.all(
      page.page.map(async (row) => ({
        ...publicFusion(row),
        liked: !!(await ctx.db
          .query("accountLikes")
          .withIndex("by_subject_fusion", (q) =>
            q.eq("subject", subject).eq("fusionId", row._id),
          )
          .unique()),
      })),
    );
    return { items, cursor: page.continueCursor, isDone: page.isDone };
  },
});
export const listLiked = internalQuery({
  args: {
    subject: v.string(),
    cursor: v.optional(v.string()),
    genre: v.optional(genreValidator),
  },
  handler: async (ctx, { subject, cursor, genre }) => {
    let query = ctx.db
      .query("accountLikes")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .order("desc");
    if (genre)
      query = query.filter((q) =>
        q.or(q.eq(q.field("genre1"), genre), q.eq(q.field("genre2"), genre)),
      );
    const page = await query.paginate({
      cursor: cursor ?? null,
      numItems: 20,
      maximumRowsRead: 200,
    });
    const rows = await Promise.all(
      page.page.map((like) => ctx.db.get(like.fusionId)),
    );
    return {
      items: rows
        .filter((row) => row?.published === true)
        .map((row) => ({ ...publicFusion(row!), liked: true })),
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
export const setLike = internalMutation({
  args: {
    subject: v.string(),
    id: v.id("fusions"),
    liked: v.boolean(),
  },
  handler: async (ctx, { subject, id, liked }) => {
    await assertAccountActive(ctx, subject);
    const item = await ctx.db.get(id);
    if (!item || item.published !== true)
      throw new Error("公開されたアイデアが見つかりません。");
    const existing = await ctx.db
      .query("accountLikes")
      .withIndex("by_subject_fusion", (q) =>
        q.eq("subject", subject).eq("fusionId", id),
      )
      .unique();
    if (liked && !existing)
      await ctx.db.insert("accountLikes", {
        subject,
        fusionId: id,
        createdAt: Date.now(),
        genre1: item.genre1,
        genre2: item.genre2,
      });
    if (!liked && existing) await ctx.db.delete(existing._id);
    return { liked };
  },
});
export const remove = internalMutation({
  args: { id: v.id("fusions"), ownerId: v.id("wallets") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item || item.ownerId !== args.ownerId)
      throw new Error("削除できません。");
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.fusions.cleanLikes, {
      id: args.id,
    });
  },
});

export const cleanLikes = internalMutation({
  args: { id: v.id("fusions") },
  handler: async (ctx, { id }) => {
    const likes = await ctx.db
      .query("accountLikes")
      .withIndex("by_fusion", (q) => q.eq("fusionId", id))
      .take(100);
    for (const like of likes) await ctx.db.delete(like._id);
    if (likes.length === 100)
      await ctx.scheduler.runAfter(0, internal.fusions.cleanLikes, { id });
  },
});
export const listMine = internalQuery({
  args: {
    subject: v.string(),
    cursor: v.optional(v.string()),
    genre: v.optional(genreValidator),
  },
  handler: async (ctx, { subject, cursor, genre }) => {
    const account = await ctx.db
      .query("accountWallets")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
    if (!account) return { items: [], cursor: "", isDone: true };
    let query = ctx.db
      .query("fusions")
      .withIndex("by_owner", (q) => q.eq("ownerId", account.walletId))
      .order("desc")
      .filter((q) => q.eq(q.field("published"), true));
    if (genre)
      query = query.filter((q) =>
        q.or(q.eq(q.field("genre1"), genre), q.eq(q.field("genre2"), genre)),
      );
    const page = await query.paginate({
      cursor: cursor ?? null,
      numItems: 20,
      maximumRowsRead: 200,
    });
    const items = await Promise.all(
      page.page.map(async (row) => ({
        ...publicFusion(row),
        liked: !!(await ctx.db
          .query("accountLikes")
          .withIndex("by_subject_fusion", (q) =>
            q.eq("subject", subject).eq("fusionId", row._id),
          )
          .unique()),
      })),
    );
    return { items, cursor: page.continueCursor, isDone: page.isDone };
  },
});
