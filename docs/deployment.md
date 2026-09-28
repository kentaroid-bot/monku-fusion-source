# 公開準備 / Cloudflare + Convex

2026-09-20に本番サイト https://fusion.monku.ai/ を公開しました。Stripe本番決済を有効化済みです。Chrome拡張0.2.0は公開済みです。検証結果は[実接続確認](integration-check.md)を参照してください。

## 分担

非公開GitHubからCloudflare Workers Buildsを接続できます。Cloudflareは`out/`の静的Webのみ配信し、API・データ・秘密は専用Convexへ置きます。Next.jsサーバーは不要です。Wranglerは`out/`以外を配信しません。`workers_dev`とプレビューURLは無効、実ドメインの割当は公開時に行います。

1. Monku Fusion専用Convexプロジェクトを作成し、開発・本番を区別する。`npx convex dev`は接続・配備を伴うため対象を確認して実行。
2. ConvexへGEMINI_API_KEY、GEMINI_MODEL（gemini-3.5-flash）、TYPESAFE_API_KEY、TURNSTILE_SECRET、TURNSTILE_HOSTNAMES、STRIPE_API_KEY、STRIPE_WEBHOOK_SECRET、PUBLIC_SITE_ORIGINを設定。秘密をGit・チャットへ貼らない。公開ホストは`fusion.monku.ai`、Originは`https://fusion.monku.ai`。本番ホスト一覧にlocalhostを入れない。
3. Cloudflare Turnstileのmanaged widgetを同ドメイン用に作る。actionは`signup`。サーバーでsuccess・hostname・actionを検証する。初回登録以外には追加しない。
4. Stripeテスト環境で100円/10回のCheckoutとWebhookを構成。Webhook URLは専用Convexの`/api/stripe/webhook`。対象は`checkout.session.completed`と`checkout.session.async_payment_succeeded`。カード払いのみ。署名・支払済み・商品識別・金額・通貨を検証する。
5. Convex本番URLをNEXT_PUBLIC_CONVEX_SITE_URL、Turnstile公開キーをNEXT_PUBLIC_TURNSTILE_SITE_KEYとしてWebビルド環境に設定。NEXT_PUBLIC_に秘密を入れない。バックエンドの`PUBLIC_SITE_ORIGIN`をフロントと一致させる。
   任意ログインを有効にする場合は、専用Clerkアプリの公開用キーを`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`としてCloudflareの**Builds**変数へ置く。ClerkのConvex連携を開発・本番それぞれで有効にし、対応するFrontend API URLを各Convex環境の`CLERK_JWT_ISSUER_DOMAIN`へ設定する。Clerkの秘密キーはWebビルドへ置かない。
6. `npm ci && npm run build:verified`。Cloudflareのビルドも`npm run build:verified`とし、検証失敗時は配備へ進めない。配備コマンドは`npx wrangler deploy`。ドメイン割当は別途`fusion.monku.ai`をWorkerのCustom Domainsへ追加。
7. 本番前にストア資料の未確定欄、法定表示・問い合わせ・返金運用、テスト決済と生成成功/失敗・残数・公開/削除を確認。
8. 接続先を設定して`npm run build:extension:release`。生成manifestには専用Convexホストだけ追加される。`dist/extension/`をChromeで読み込み、実機確認後ZIP化。

### 無料利用の費用上限

Turnstileは初回接続で検証する。新規登録は既存の全体100件/日に加えて30件/10分で制限し、同じ登録トークンの再送は新規登録として数えない。無料分の生成予約は全体60回/日の上限を適用し、購入分の生成にはこの上限を適用しない。必要に応じてConvexの`SIGNUP_BURST_LIMIT`、`FREE_DAILY_GENERATION_LIMIT`を整数で設定して調整できる。後者を`0`にすると無料分の生成だけ一時停止する。購入手続きや購入済み残数の生成は引き続き利用できる。

新しい財布は無料分と購入分を別々に記録する。従来の財布に購入履歴がある場合は、残っている未分割の回数を購入分として引き継ぐ。履歴がなければ無料分として引き継ぐ。どちらも残数は減らさない。失敗時の返却は使った種類の残数へ戻す。無料生成の全体上限は外部サービス費用を抑えるため、失敗・返却後もその日の予約回数として数える。

Convex管理画面から内部クエリ`incense:abuseStatus`を実行すると、その日の新規登録・無料生成と直近10分の登録件数を集計値だけで確認できる。原文、IP、接続トークンは記録しない。匿名のプライベートブラウズからの再登録を同一人物と識別するものではない。

## 公開前の実環境チェック

- Turnstile: 正常トークン成功、同じトークン再利用・別action/hostname拒否。
- Stripe: テスト決済成功、未払拒否、二重通知加算1回、別財布のverify拒否。Webhookのみでも付与。
- Gemini/Jev: 契約中モデルが利用可能、入力と出力の安全確認、料金・上限、タイムアウト時返却。
- 端末接続: 10分以内に1回だけ接続、Web/拡張の残数共有、購入後更新。
- 発行した接続情報を残した別ブラウザ/拡張で残数へ戻れること。ログインせずに消去した場合の自動復旧はない。ログイン後は同じアカウントで残数を復元できること。
- 監視: 決済付与失敗のWebhook再送、予約返却の実行失敗、日次上限、残数不整合を管理画面で確認。原文/秘密をログへ出さない。
- 旧バランス・決済・原文の自動移行はしない。既存環境を再利用する場合は個別に移行計画を作る。

公式資料: [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[GitHub連携](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)、[Turnstile検証](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)、[Convex内部関数](https://docs.convex.dev/functions/internal-functions)、[Stripe署名](https://docs.stripe.com/webhooks/signature)。2026-09-20参照。

## 2026-09-20 本番公開

利用者が本番Convexの秘密を設定し、Stripe本番Webhookを作成。公開と実決済開始の明示承認を受けて、コードd9f3a21を専用本番Convexへ配備し、Cloudflareへ公開した。

- 本番Convex: hip-hound-497。Stripe本番キー、決済受付可、Webhook有効・指定2イベント・専用URLを照合済み。
- Cloudflare Worker: monku-fusion。公開版ID: c5c8aff8-3029-42d7-a9a6-62a1132f6503。
- トップ・販売者表示・利用条件・プライバシーはHTTPS 200。CSP等の保護ヘッダーを確認。秘密ファイルとGit設定へのアクセスは404。
- 本番サイトで無料登録から生成まで、利用者が成功を確認。実カードの試験購入はしていない。開発環境のテスト決済結果と区別する。

### ドメイン振り分けの運用注意

ゾーンには既存サイト用の `*.monku.ai/* → monku-ai` がある。このルートがCustom Domainより優先されるため、`fusion.monku.ai/* → Workerなし` の除外ルートを追加し、Fusion専用Custom Domainへ届くようにした。既存の包括ルートは変更していない。この除外はゾーン側の設定で、Fusionのwrangler.jsoncとは別に維持する。再構成時にも残すこと。

[Cloudflareのルート優先順位](https://developers.cloudflare.com/workers/configuration/routing/routes/)に従う。既存monku.aiもHTTPS 200を確認した。

## Webの退会・カテゴリ管理・翻訳（2026-09-25）

- 退会には本番Convexの `CLERK_SECRET_KEY` が必要。同じMonku Fusion本番Clerkの既存キーをサーバー環境変数に設定し、Webの公開環境変数やGitには保存しない。キー未設定、またはClerk側で対象本人を確認できない場合は、残数・投稿を変更せず拒否する。
- 本人のJWT・投稿の保持/削除の選択・利用回数失効への同意を受け、Clerk本人確認→財布の閉鎖→Clerk削除→関連データ処理の順で進む。Clerk削除は失敗時に予約再試行し、既に削除済みの404は冪等に扱う。`retirements` のpending長期化は環境変数・Clerk応答を確認する。実アカウントを検証目的で削除しない。
- 関連データ処理は小分けに実行する。本人のいいね、接続用資格情報、接続コード、一時結果、アカウント紐付けを削除。公開投稿は本人の選択に従い削除、または本文を変えず所有者との紐付けを解除。決済記録と閉じた財布、退会済みの識別用ハッシュを残す。
- 退会後に決済の完了通知が届いた場合は、財布を再開せずStripe返金へ回す。既存返金の照合と冪等キーで重複を防ぐ。`purchases.refundRequired` がtrueで `refundId` がない記録はWebhook再送・返金状態を確認する。
- 既存カテゴリ付与は内部関数 `categoryBackfill:preview` で公開・未分類だけを読み、担当者が内容を確認して `categoryBackfill:apply` へ最大25件ずつ渡す。ID・ハッシュ・公開状態・未分類を再照合し、既存ラベルとモードは上書きしない。いいね一覧のカテゴリも更新する。公開HTTPの移行用エンドポイントは設けない。
- UI文言は `src/messages/{ja,en,fr}.json` と `src/ui-strings.ts` で管理。3言語のキーと差し込み変数の一致をテストする。回答言語は画面言語から独立。共通の思考プロンプトと4モードの役割は維持する。
- Web回帰は `npm run build:verified` と `test:account-flow`、`test:auth-input`、`test:web-experience`。画面検証には `EXPERIENCE_CSS` で直近ビルドのCSSを指定する。外部APIはすべて模擬化する。
