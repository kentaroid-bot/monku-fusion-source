import { internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { genreValidator } from "./ideaMetadata";
import { validateGenres } from "../shared/idea-metadata";

// Operator-only: only already-public material is exposed for category review.
export const preview = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("fusions")
      .withIndex("by_published", (q) => q.eq("published", true))
      .filter((q) =>
        q.and(
          q.eq(q.field("genre1"), undefined),
          q.eq(q.field("genre2"), undefined),
        ),
      )
      .paginate({
        cursor: cursor ?? null,
        numItems: 100,
        maximumRowsRead: 500,
      });
    return {
      items: page.page.map((row) => ({
        id: row._id,
        hash: row.hash,
        title: row.ideaTitle,
        concept: row.ideaConcept,
        reason: row.ideaReason,
        context: row.monku ?? row.entropyCore,
      })),
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
export const apply = internalMutation({
  args: {
    items: v.array(
      v.object({
        id: v.id("fusions"),
        hash: v.string(),
        genres: v.array(genreValidator),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    if (items.length > 25) throw new Error("一度に25件までです。");
    let updated = 0;
    for (const item of items) {
      const genres = validateGenres(item.genres);
      if (!genres.length) continue;
      const row = await ctx.db.get(item.id);
      if (
        !row ||
        row.published !== true ||
        row.hash !== item.hash ||
        row.genre1 ||
        row.genre2
      )
        continue;
      await ctx.db.patch(row._id, { genre1: genres[0], genre2: genres[1] });
      await ctx.scheduler.runAfter(0, internal.categoryBackfill.updateLikes, {
        id: row._id,
      });
      updated++;
    }
    return { updated, skipped: items.length - updated };
  },
});
export const updateLikes = internalMutation({
  args: { id: v.id("fusions"), cursor: v.optional(v.string()) },
  handler: async (ctx, { id, cursor }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    const page = await ctx.db
      .query("accountLikes")
      .withIndex("by_fusion", (q) => q.eq("fusionId", id))
      .paginate({ cursor: cursor ?? null, numItems: 100 });
    for (const like of page.page)
      await ctx.db.patch(like._id, { genre1: row.genre1, genre2: row.genre2 });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.categoryBackfill.updateLikes, {
        id,
        cursor: page.continueCursor,
      });
  },
});
