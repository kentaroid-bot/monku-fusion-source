import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import Stripe from "stripe";
function client() {
  if (!process.env.STRIPE_API_KEY)
    throw new Error("決済の設定が完了していません。");
  return new Stripe(process.env.STRIPE_API_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 1,
    timeout: 15000,
  });
}
export function validatePaidSession(
  session: Stripe.Checkout.Session,
  walletId?: string,
): string {
  if (
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.amount_total !== 100 ||
    session.currency !== "jpy" ||
    session.metadata?.type !== "monku-fusion-v1" ||
    session.metadata?.incenseCount !== "10" ||
    !session.metadata?.walletId ||
    (walletId && session.metadata.walletId !== walletId)
  )
    throw new Error("この利用者の決済完了を確認できませんでした。");
  return session.metadata.walletId;
}
export const createCheckout = internalAction({
  args: { walletId: v.id("wallets"), requestId: v.string() },
  handler: async (_ctx, args): Promise<{ url: string }> => {
    const origin = process.env.PUBLIC_SITE_ORIGIN;
    if (!origin || !/^https:\/\/[a-z0-9.-]+$/.test(origin))
      throw new Error("公開サイトの設定が完了していません。");
    const session = await client().checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        custom_text: {
          submit: {
            message: `100円（税込）で利用回数10回分を購入します。定期購入ではありません。未使用分の返金相談は https://monku.ai/contact/ で受け付けます。販売者：竹村健太郎（monku.ai）。販売条件：${origin}/commerce/`,
          },
        },
        line_items: [
          {
            price_data: {
              currency: "jpy",
              product_data: { name: "Monku Fusion 利用回数10回分" },
              unit_amount: 100,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "monku-fusion-v1",
          walletId: args.walletId,
          incenseCount: "10",
        },
        success_url: `${origin}/osaisen/success/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?canceled=true`,
      },
      { idempotencyKey: `checkout:${args.walletId}:${args.requestId}` },
    );
    if (!session.url) throw new Error("決済ページを作成できませんでした。");
    return { url: session.url };
  },
});
export const verifySession = internalAction({
  args: { sessionId: v.string(), walletId: v.optional(v.id("wallets")) },
  handler: async (ctx, args): Promise<{ paid: boolean }> => {
    const session = await client().checkout.sessions.retrieve(args.sessionId);
    const walletId = validatePaidSession(session, args.walletId);
    const fulfillment = await ctx.runMutation(internal.incense.fulfillPayment, {
      sessionId: session.id,
      walletId: walletId as import("./_generated/dataModel").Id<"wallets">,
    });
    if (fulfillment.refundRequired) {
      // A checkout can finish after account retirement. Never revive its wallet.
      const paymentIntent =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (!paymentIntent) throw new Error("Refund reconciliation pending");
      const stripe = client();
      const previous = await stripe.refunds.list({
        payment_intent: paymentIntent,
        limit: 100,
      });
      const refund =
        previous.data.find(
          (item) =>
            item.amount === 100 &&
            (item.status === "succeeded" || item.status === "pending"),
        ) ??
        (await stripe.refunds.create(
          {
            payment_intent: paymentIntent,
            amount: 100,
            metadata: { reason: "account_retired_before_fulfillment" },
          },
          { idempotencyKey: `retired-wallet-refund:${session.id}` },
        ));
      if (refund.status !== "succeeded" && refund.status !== "pending")
        throw new Error("Refund reconciliation pending");
      await ctx.runMutation(internal.incense.recordRetiredRefund, {
        sessionId: session.id,
        refundId: refund.id,
      });
    }
    return { paid: true };
  },
});
export async function verifyWebhook(
  body: string,
  signature: string | null,
): Promise<Stripe.Event> {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !signature)
    throw new Error("Invalid webhook");
  return await client().webhooks.constructEventAsync(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
}
