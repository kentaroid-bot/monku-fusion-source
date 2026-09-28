import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { genreValidator, modeValidator } from "./ideaMetadata";

export default defineSchema({
  retirements: defineTable({
    subject: v.optional(v.string()),
    subjectHash: v.string(),
    receiptHash: v.string(),
    walletId: v.optional(v.id("wallets")),
    keepPosts: v.boolean(),
    status: v.union(
      v.literal("pending"),
      v.literal("cleaning"),
      v.literal("complete"),
    ),
    attempts: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_subject_hash", ["subjectHash"])
    .index("by_receipt", ["receiptHash"]),
  wallets: defineTable({
    balance: v.number(),
    freeBalance: v.optional(v.number()),
    paidBalance: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
  }),
  credentials: defineTable({
    tokenHash: v.string(),
    walletId: v.id("wallets"),
    accountSubject: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.optional(v.number()),
  })
    .index("by_token", ["tokenHash"])
    .index("by_wallet", ["walletId"]),
  accountWallets: defineTable({
    subject: v.string(),
    walletId: v.id("wallets"),
    createdAt: v.number(),
  })
    .index("by_subject", ["subject"])
    .index("by_wallet", ["walletId"]),
  accountLikes: defineTable({
    subject: v.string(),
    fusionId: v.id("fusions"),
    createdAt: v.number(),
    genre1: v.optional(genreValidator),
    genre2: v.optional(genreValidator),
  })
    .index("by_subject", ["subject"])
    .index("by_subject_fusion", ["subject", "fusionId"])
    .index("by_fusion", ["fusionId"]),
  pairings: defineTable({
    codeHash: v.string(),
    walletId: v.id("wallets"),
    expiresAt: v.number(),
    accountSubject: v.optional(v.string()),
  })
    .index("by_code", ["codeHash"])
    .index("by_wallet", ["walletId"]),
  limits: defineTable({
    key: v.string(),
    count: v.number(),
    expiresAt: v.number(),
  }).index("by_key", ["key"]),
  requests: defineTable({
    walletId: v.id("wallets"),
    requestId: v.string(),
    inputHash: v.string(),
    status: v.string(),
    creditSource: v.optional(v.union(v.literal("free"), v.literal("paid"))),
    result: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_request", ["walletId", "requestId"])
    .index("by_wallet", ["walletId"]),
  purchases: defineTable({
    refundRequired: v.optional(v.boolean()),
    refundId: v.optional(v.string()),
    sessionId: v.string(),
    walletId: v.id("wallets"),
    amount: v.number(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_wallet", ["walletId"]),
  transformations: defineTable({
    // 既存ドキュメントとの互換のため optional で残す
    originalText: v.optional(v.string()),
    mode: v.optional(v.string()),
    mildnessLevel: v.optional(v.number()),
    result: v.object({
      headline: v.optional(v.string()),
      coreEmotion: v.string(),
      patternA: v.string(),
      patternB: v.string(),
      patternC: v.string(),
      explanation: v.optional(v.string()),
      poeticTranslation: v.optional(v.string()),
    }),
  }),

  // Monku Fusion: クソリプキャッシュ ＆ 創発アイデアアーカイブ
  fusions: defineTable({
    published: v.optional(v.boolean()),
    ownerId: v.optional(v.id("wallets")),
    hash: v.string(), // 照合用ハッシュ
    rawNoise: v.string(), // 元の文面
    monku: v.optional(v.string()), // 本人が確認・編集して公開した動機
    mode: v.optional(modeValidator), // 生成時のモード（旧投稿には付与しない）
    genre1: v.optional(genreValidator),
    genre2: v.optional(genreValidator),
    entropyCore: v.string(), // 怒り・執着の核心
    pacifyReply: v.string(), // 完全成仏の返答
    finiteOpposites: v.string(), // 対立構造 (Finite)
    infiniteCaption: v.string(), // And not Or キャプション (Infinite)
    ideaTitle: v.string(), // 新事業アイデア名
    ideaConcept: v.string(), // アイデア詳細
    ideaReason: v.string(), // 着想理由
    likesCount: v.optional(v.number()), // 合掌数
    createdAt: v.number(), // タイムスタンプ
  })
    .index("by_hash", ["hash"])
    .index("by_published", ["published"])
    .index("by_owner", ["ownerId"]),

  // お線香残数管理（ユーザー / 端末ごと）
  incense_balances: defineTable({
    userId: v.string(), // Chrome拡張またはWebの匿名ID
    balance: v.number(), // お線香残り回数（初期付与分＋お賽銭チャージ分）
    updatedAt: v.number(),
  }).index("by_user_id", ["userId"]),

  // 決済トランザクション履歴（冪等性チェック用）
  transactions: defineTable({
    sessionId: v.string(), // Stripe Checkout Session ID
    userId: v.string(),
    amount: v.number(),
    currency: v.string(),
    incenseAdded: v.number(),
    status: v.string(), // "completed"
    createdAt: v.number(),
  }).index("by_session_id", ["sessionId"]),
});
