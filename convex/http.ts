import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertSafe } from "./safety";
import { digest, requireToken, secretToken, verifyTurnstile } from "./security";
import {
  generateFusion,
  validateFusion,
  validateInput,
  validateOptions,
  generationInput,
  generationSafetyText,
  validateMode,
} from "../shared/fusion";
import { validateGenres, validateGenreFilter } from "../shared/idea-metadata";
import { verifyWebhook } from "./stripe";
const http = httpRouter();
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("JSONが必要です。");
  const raw = await request.text();
  if (raw.length > 24000) throw new Error("送信データが大きすぎます。");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("入力形式が不正です。");
  return value;
}
async function auth(ctx: ActionCtx, request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
  // Convex JWT verification rejects opaque anonymous tokens. Resolve those
  // through our own hashed credential table before asking for a Clerk identity.
  if (bearer && /^[a-f0-9]{64}$/.test(bearer)) {
    const wallet = await ctx.runQuery(internal.incense.authenticate, {
      tokenHash: await digest(bearer),
    });
    if (!wallet) throw new Error("接続を確認してください。");
    return wallet;
  }
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    const wallet = await ctx.runQuery(internal.incense.accountWallet, {
      subject: identity.subject,
    });
    if (!wallet)
      throw new Error(
        "このアカウントには接続がありません。現在の接続を登録してください。",
      );
    return wallet;
  }
  throw new Error("接続情報が無効です。");
}
async function accountSubject(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("ログインを確認してください。");
  await ctx.runQuery(internal.accountRetirement.active, {
    subject: identity.subject,
  });
  return identity.subject;
}
async function archiveSubject(
  ctx: ActionCtx,
  request: Request,
  required = true,
) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (bearer && /^[a-f0-9]{64}$/.test(bearer)) {
    const connection = await ctx.runQuery(
      internal.incense.extensionConnection,
      {
        tokenHash: await digest(bearer),
      },
    );
    if (connection.connected && connection.accountLinked && connection.subject)
      return connection.subject;
    if (!required) return null;
    throw new Error("Webでログインして拡張機能を連携してください。");
  }
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    if (!required) return null;
    throw new Error("ログインを確認してください。");
  }
  await ctx.runQuery(internal.accountRetirement.active, {
    subject: identity.subject,
  });
  return identity.subject;
}
function requestId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(value))
    throw new Error("処理IDが不正です。");
  return value;
}
function route(
  path: string,
  method: "GET" | "POST",
  handler: (ctx: ActionCtx, req: Request) => Promise<unknown>,
) {
  http.route({
    path,
    method,
    handler: httpAction(async (ctx, req) => {
      try {
        return json(await handler(ctx, req));
      } catch (error) {
        // Never forward upstream bodies, payment identifiers, keys or user text.
        const message =
          error instanceof Error &&
          /[ぁ-んァ-ン一-龯]/.test(error.message) &&
          error.message.length < 200
            ? error.message
            : "処理できませんでした。設定・接続を確認して再度お試しください。";
        return json({ error: message }, 400);
      }
    }),
  });
}
route("/api/session", "POST", async (ctx, req) => {
  const data = await body(req);
  await verifyTurnstile(data.turnstileToken);
  const token =
    data.registrationToken === undefined
      ? secretToken()
      : requireToken(data.registrationToken);
  const result = await ctx.runMutation(internal.incense.createWallet, {
    tokenHash: await digest(token),
  });
  return { ...result, token };
});
route("/api/session/pair", "POST", async (ctx, req) => {
  const wallet = await auth(ctx, req);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (bearer && /^[a-f0-9]{64}$/.test(bearer)) {
    const connection = await ctx.runQuery(
      internal.incense.extensionConnection,
      { tokenHash: await digest(bearer) },
    );
    if (connection.accountLinked)
      throw new Error("接続コードはWebでログインして発行してください。");
  }
  const data = await body(req);
  if (
    data.accountAccess !== undefined &&
    typeof data.accountAccess !== "boolean"
  )
    throw new Error("接続の設定が不正です。");
  const subject =
    data.accountAccess === true ? await accountSubject(ctx) : undefined;
  await ctx.runMutation(internal.incense.throttle, {
    walletId: wallet._id,
    operation: "pair",
  });
  const code = secretToken();
  await ctx.runMutation(internal.incense.createPairing, {
    walletId: wallet._id,
    codeHash: await digest(code),
    accountSubject: subject,
  });
  return { code, expiresInSeconds: 600 };
});
route("/api/session/redeem", "POST", async (ctx, req) => {
  const data = await body(req);
  const code = requireToken(data.code);
  const token = secretToken();
  await ctx.runMutation(internal.incense.redeemPairing, {
    codeHash: await digest(code),
    tokenHash: await digest(token),
  });
  return { token };
});
route("/api/account/retire", "POST", async (ctx, req) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("ログインを確認してください。");
  if (!process.env.CLERK_SECRET_KEY)
    throw new Error("退会設定がまだ完了していません。お問い合わせください。");
  const data = await body(req);
  if (typeof data.keepPosts !== "boolean" || data.confirmForfeit !== true)
    throw new Error("退会時の削除・失効への同意が必要です。");
  const receipt = requireToken(data.receipt);
  await ctx.runAction(internal.accountRetirement.prepare, {
    subject: identity.subject,
    keepPosts: data.keepPosts,
    receiptHash: await digest(receipt),
  });
  return { accepted: true };
});
route("/api/account/retire-status", "POST", async (ctx, req) => {
  const data = await body(req);
  return await ctx.runQuery(internal.accountRetirement.status, {
    receiptHash: await digest(requireToken(data.receipt)),
  });
});
route("/api/account/status", "GET", async (ctx) => {
  const subject = await accountSubject(ctx);
  const wallet = await ctx.runQuery(internal.incense.accountWallet, {
    subject,
  });
  return { linked: !!wallet, balance: wallet?.balance ?? null };
});
route("/api/account/link", "POST", async (ctx, req) => {
  const subject = await accountSubject(ctx);
  const data = await body(req);
  const token = requireToken(data.anonymousToken);
  return await ctx.runMutation(internal.incense.linkAccount, {
    subject,
    tokenHash: await digest(token),
  });
});
route("/api/extension/connection", "GET", async (ctx, req) => {
  const token = requireToken(
    req.headers.get("authorization")?.replace(/^Bearer /, ""),
  );
  const state = await ctx.runQuery(internal.incense.extensionConnection, {
    tokenHash: await digest(token),
  });
  return {
    connected: state.connected,
    accountLinked: state.accountLinked,
    expired: state.expired,
    balance: state.balance,
    expiresAt: state.expiresAt,
  };
});
route("/api/extension/disconnect", "POST", async (ctx, req) => {
  const token = requireToken(
    req.headers.get("authorization")?.replace(/^Bearer /, ""),
  );
  await ctx.runMutation(internal.incense.disconnectExtensionConnection, {
    tokenHash: await digest(token),
  });
  return { success: true };
});
route("/api/account/extensions", "GET", async (ctx) => ({
  connections: await ctx.runQuery(internal.incense.listExtensionConnections, {
    subject: await accountSubject(ctx),
  }),
}));
route("/api/account/extensions/revoke", "POST", async (ctx, req) => {
  const subject = await accountSubject(ctx);
  const data = await body(req);
  if (typeof data.id !== "string") throw new Error("対象が不正です。");
  await ctx.runMutation(internal.incense.revokeExtensionConnection, {
    subject,
    id: data.id as import("./_generated/dataModel").Id<"credentials">,
  });
  return { success: true };
});
route("/api/incense/balance", "GET", async (ctx, req) => ({
  balance: (await auth(ctx, req)).balance,
}));
route("/api/incense/create-checkout", "POST", async (ctx, req) => {
  const wallet = await auth(ctx, req);
  const data = await body(req);
  await ctx.runMutation(internal.incense.throttle, {
    walletId: wallet._id,
    operation: "checkout",
  });
  return await ctx.runAction(internal.stripe.createCheckout, {
    walletId: wallet._id,
    requestId: requestId(data.requestId),
  });
});
route("/api/incense/verify-session", "POST", async (ctx, req) => {
  const wallet = await auth(ctx, req);
  const data = await body(req);
  if (
    typeof data.sessionId !== "string" ||
    !/^cs_[a-zA-Z0-9_]{1,200}$/.test(data.sessionId)
  )
    throw new Error("決済番号が不正です。");
  await ctx.runMutation(internal.incense.throttle, {
    walletId: wallet._id,
    operation: "verify",
  });
  return await ctx.runAction(internal.stripe.verifySession, {
    walletId: wallet._id,
    sessionId: data.sessionId,
  });
});
route("/api/fusion/free-trial", "POST", async (ctx, req) => {
  const wallet = await auth(ctx, req);
  const data = await body(req);
  const text = validateInput(data.noiseText);
  const options = validateOptions(data.options);
  const id = requestId(data.requestId);
  if (!process.env.GEMINI_API_KEY)
    throw new Error("生成と安全確認の設定が完了していません。");
  await ctx.runMutation(internal.incense.throttle, {
    walletId: wallet._id,
    operation: "generate",
  });
  const reserved = await ctx.runMutation(internal.incense.reserve, {
    walletId: wallet._id,
    requestId: id,
    inputHash: await digest(generationInput(text, options)),
  });
  if (reserved.status === "complete" && reserved.result)
    return { result: reserved.result };
  if (reserved.status !== "new")
    throw new Error(
      "処理中、返却済み、または結果の保存期限切れです。残数を確認してから新しく実行してください。",
    );
  try {
    await assertSafe(generationSafetyText(text, options));
    const result = await generateFusion(
      process.env.GEMINI_API_KEY,
      text,
      process.env.GEMINI_MODEL || "gemini-3.5-flash",
      options,
    );
    await assertSafe(Object.values(result).join("\n"));
    await ctx.runMutation(internal.incense.complete, {
      id: reserved.id,
      result,
    });
    return { result };
  } catch (error) {
    await ctx.runMutation(internal.incense.refund, { id: reserved.id });
    throw error;
  }
});
route("/api/fusion/check-safety", "POST", async (ctx, req) => {
  const wallet = await auth(ctx, req);
  const data = await body(req);
  await ctx.runMutation(internal.incense.throttle, {
    walletId: wallet._id,
    operation: "safety",
  });
  const sanitizedText = validateInput(data.text);
  const options = validateOptions(data.options);
  await assertSafe(generationSafetyText(sanitizedText, options));
  return { sanitizedText, ...(options ? { options } : {}) };
});
route("/api/fusion/save", "POST", async (ctx, req) => {
  const wallet = await auth(ctx, req);
  const data = await body(req);
  if (data.publishConsent !== true) throw new Error("公開への同意が必要です。");
  const result = validateFusion(data.result);
  const mode = validateMode(data.mode);
  const genres =
    data.genres === undefined ? undefined : validateGenres(data.genres);
  const monku =
    data.monku === undefined ? undefined : validateInput(data.monku);
  await ctx.runMutation(internal.incense.throttle, {
    walletId: wallet._id,
    operation: "publish",
  });
  await assertSafe([...Object.values(result), monku || ""].join("\n"));
  const publication = monku === undefined ? result : { result, monku };
  const hash = await digest(
    wallet._id +
      JSON.stringify(
        mode === undefined && genres === undefined
          ? publication
          : { publication, mode, genres },
      ),
  );
  const id = await ctx.runMutation(internal.fusions.saveFusion, {
    ownerId: wallet._id,
    hash,
    result,
    monku,
    mode,
    genres,
  });
  return { id };
});
route("/api/fusion/delete", "POST", async (ctx, req) => {
  const wallet = await auth(ctx, req);
  const data = await body(req);
  if (typeof data.id !== "string") throw new Error("対象が不正です。");
  await ctx.runMutation(internal.fusions.remove, {
    ownerId: wallet._id,
    id: data.id as import("./_generated/dataModel").Id<"fusions">,
  });
  return { success: true };
});
route("/api/fusion/list", "GET", async (ctx, req) => {
  const genre = validateGenreFilter(new URL(req.url).searchParams.get("genre"));
  const subject = await archiveSubject(ctx, req, false);
  if (!subject)
    return {
      items: await ctx.runQuery(internal.fusions.listLatest, { genre }),
      isDone: true,
    };
  const cursor = new URL(req.url).searchParams.get("cursor") || undefined;
  if (cursor && cursor.length > 1024) throw new Error("表示位置が不正です。");
  return await ctx.runQuery(internal.fusions.listForAccount, {
    subject,
    cursor,
    genre,
  });
});
route("/api/fusion/mine", "GET", async (ctx, req) => {
  const subject = (await archiveSubject(ctx, req))!;
  const genre = validateGenreFilter(new URL(req.url).searchParams.get("genre"));
  const cursor = new URL(req.url).searchParams.get("cursor") || undefined;
  if (cursor && cursor.length > 1024) throw new Error("表示位置が不正です。");
  return await ctx.runQuery(internal.fusions.listMine, {
    subject,
    cursor,
    genre,
  });
});
route("/api/fusion/liked", "GET", async (ctx, req) => {
  const subject = (await archiveSubject(ctx, req))!;
  const genre = validateGenreFilter(new URL(req.url).searchParams.get("genre"));
  const cursor = new URL(req.url).searchParams.get("cursor") || undefined;
  if (cursor && cursor.length > 1024) throw new Error("表示位置が不正です。");
  return await ctx.runQuery(internal.fusions.listLiked, {
    subject,
    cursor,
    genre,
  });
});
route("/api/fusion/like", "POST", async (ctx, req) => {
  const subject = (await archiveSubject(ctx, req))!;
  const data = await body(req);
  if (typeof data.id !== "string" || typeof data.liked !== "boolean")
    throw new Error("対象が不正です。");
  return await ctx.runMutation(internal.fusions.setLike, {
    subject,
    id: data.id as import("./_generated/dataModel").Id<"fusions">,
    liked: data.liked,
  });
});
http.route({
  path: "/api/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let event;
    try {
      const raw = await req.text();
      if (raw.length > 65536) return json({ error: "Invalid webhook" }, 400);
      event = await verifyWebhook(raw, req.headers.get("stripe-signature"));
    } catch {
      return json({ error: "Invalid webhook" }, 400);
    }
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      if (event.data.object.metadata?.type !== "monku-fusion-v1")
        return json({ received: true });
      try {
        await ctx.runAction(internal.stripe.verifySession, {
          sessionId: event.data.object.id,
        });
      } catch {
        return json({ error: "Fulfillment pending" }, 500);
      }
    }
    return json({ received: true });
  }),
});
http.route({
  pathPrefix: "/api/",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers })),
});
export default http;
