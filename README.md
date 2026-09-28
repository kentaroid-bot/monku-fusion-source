# Monku Fusion

仕事や日常のもやもやから、相手に届く言葉と、新しいアイデアをつくるWebアプリ・Chrome拡張です。

[Webで使う](https://fusion.monku.ai/) · [データの扱い](docs/data-handling.md) · [セキュリティの連絡先](SECURITY.md) · [プライバシーポリシー](https://fusion.monku.ai/privacy/)

このリポジトリには、画面だけでなく、認証・利用回数・決済を担当するConvexの処理、生成プロンプト、テストを含めています。APIキーや入力内容、お金をどのように扱うか、説明から実装へたどれるようにすることが目的です。

## できること

「つくる・アイデア・設定」の三つの画面を使います。入力欄の下でモードを選ぶと、画面の雰囲気と、次の回答の考え方が一緒に変わります。

| モード | 回答の方向 |
|---|---|
| Yohaku（初期設定） | 仕事や日常のもやもやを、相手に届く言葉と無理なく試せるアイデアに |
| Monku Labo | 前提をずらして、アバンギャルドな発想を試す |
| Focus | 専門的な論点を掘り、筋の通った構想にする |
| Dev | アイデアを仕様や実装手順まで落とす |

- 日本語・英語・フランス語のUI。回答言語は画面言語と別に選択できます。
- 回答のコピー・テキスト保存、補足を伝えて練り直す機能。練り直しも1回の生成です。
- 確認したアイデアの公開、モード・ジャンルの表示、投稿の取り下げ。
- 未ログインでは公開アイデアの直近5件。ログイン後は全件・自分のいいね・自分の投稿を閲覧できます。
- 無料体験、100円で10回分の追加購入、自分のGemini APIキーによる生成。
- 拡張では、右クリックで選んだ文章をサイドパネルへ取り込めます。Webで発行したコードにより、残数や本人のアイデア一覧を連携できます。

Web・Convex・Chrome拡張は別々に配布されます。このリポジトリの最新コードと、現在利用中の配布版が同一とは限りません。[版と検証の見方](docs/source-and-releases.md)を参照してください。

## 情報とお金の扱い

| 確認したいこと | この実装での扱い | 主なコード |
|---|---|---|
| 自分のGemini APIキー | Webはページのメモリ、拡張はブラウザ内に保存。Googleへの認証に使い、運営のConvexへ送る処理はありません | [共通の生成処理](shared/fusion.ts)、[Web](src/app/page.tsx)、[拡張](extension/sidepanel.tsx) |
| 入力した文句 | 処理のためConvexへ送り、安全確認と生成で外部AIを使います。入力原文・補足をアプリDBへ自動保存する処理はありません | [API](convex/http.ts)、[安全確認](convex/safety.ts) |
| 生成した回答 | 自動公開しません。利用回数で生成した回答は再送に備えて約24時間、非公開で保持します | [利用回数と一時結果](convex/incense.ts) |
| 登録・ログイン | Clerkが認証を担当。Convexは認証済みの識別子を残数・投稿・いいねと結び付けます | [認証設定](convex/auth.config.ts)、[API](convex/http.ts) |
| カード決済 | Stripe Checkoutへ移動して支払い。サーバーで決済を照合して10回分を付与します。カード番号をアプリDBに保存する処理はありません | [Stripe処理](convex/stripe.ts)、[残数への反映](convex/incense.ts) |
| 退会 | 投稿を削除するか、アカウントとの紐付けを外して残すかを選択。未使用回数の失効に同意して退会します | [退会処理](convex/accountRetirement.ts) |

自分のAPIキーを使う場合も、入力の安全確認には運営サーバーと外部AIを使います。完全に端末内だけで動く方式ではありません。保存する項目、外部への送信先、退会後に残る決済記録などは[データの扱い](docs/data-handling.md)にまとめています。

## プロンプトを読む

1. [Monku_AI Constitution v1.0](docs/prompts/monku-ai-constitution-v1.0.md)：共通の姿勢。Geminiの `systemInstruction` に渡します。
2. [Monku Fusion Engine](docs/prompts/monku-fusion-engine-2026-09-26.md)：Fusionの制作動機・役割・変換の手順・回答形式。
3. [4モードの指示と組み立て](shared/fusion.ts)：モードの指示を、Engineの「思考・適応のレイヤー」の直前へ入れます。

原稿と生成済み定数の対応は `npm run prompt:sync` と [プロンプトのテスト](tests/prompt.test.ts)で確認できます。[Constitutionの取り付け方](docs/prompts/monku-ai-constitution-v1.0-integration.md)も参照してください。プロンプトは秘密として扱わず、キーや個人情報を含めません。

## ローカルで確認する

Node.js 24以上を使います。

```sh
npm ci
cp .env.example .env.local
# .env.local に、自分の開発用サービスの公開設定を記入
npm run dev
```

画面の表示だけなら公開設定が空でも起動できます。生成・登録・決済には、自分で用意したConvex・Gemini・Turnstile・Stripe等の設定が必要です。ログインにはClerkも使います。運営の本番環境へ接続して開発・試験を行わないでください。

`.env.example` は変数名の見本です。秘密鍵はConvex側に設定し、`NEXT_PUBLIC_` で始まる公開変数やGitへ入れません。[環境構築と配備](docs/deployment.md)に設定項目があります。

| コマンド | 確認するもの |
|---|---|
| `npm test` | 認証・残数・決済・公開範囲・プロンプトなど。外部APIは模擬応答に置き換えます |
| `npm run typecheck` / `npm run lint` | 型とコードの静的検査 |
| `npm run build` | 静的Webを `out/` へ出力 |
| `npm run build:verified` | lint・型・テスト・Webビルドを一括実行 |
| `npm run test:auth-input` / `npm run test:account-flow` | 認証入力欄とアカウント連携のブラウザ検証。外部通信は模擬化 |
| `npm run test:web-experience` | モード・言語・結果保存・練り直し・公開の画面検証。外部通信は模擬化 |

ブラウザ試験にはChrome等の実行可能なブラウザが必要です。`BRAVE_EXECUTABLE` を指定すると対応する試験をBraveで実行できます。テスト成功は、実モデルの回答品質や実カード決済の検証とは区別します。

### Chrome拡張

```sh
npm run build:extension
```

`dist/extension/` をChromeの拡張機能管理画面から読み込みます。動作させる場合は、ビルド時の `NEXT_PUBLIC_CONVEX_SITE_URL` に自分の専用Convex URLを指定してください。このスクリプトは `.env.local` を自動では読みません。配布候補の `npm run build:extension:release` は接続先必須です。

ビルドは追跡中の `extension/sidepanel.js` と `dist/extension/` を作り直します。審査提出物や読み込み済みの拡張を保持する場合は別の作業コピーで行ってください。検証は `npm run test:extension` と `npm run test:extension-package`。詳細は[拡張の案内](extension/README.md)を参照してください。

## 構成

- `src/`：Web画面、設定、日英仏の文言。
- `shared/`：Web・拡張・サーバーで共有する生成、入力・出力の検証、プロンプト。
- `convex/`：認証、残数、決済、安全確認、公開アイデアと退会。
- `extension/`：Chrome拡張。`sidepanel.tsx` が編集用ソースです。
- `tests/`・`scripts/`：自動検証、プロンプト同期、配布物の作成。
- `docs/`：[データの扱い](docs/data-handling.md)、[安全設計](docs/security.md)、[配備](docs/deployment.md)、プロンプト原稿など。

## コードと公開アイデアの利用条件

このリポジトリにはソフトウェアの `LICENSE` をまだ設けていません。MIT等のオープンソースライセンスで提供済みという意味ではありません。コードの再利用条件については[問い合わせ窓口](https://monku.ai/contact/)へご相談ください。

サービス内で本人が同意して公開するアイデアのCC0と、ソースコードの利用条件は別です。依存ライブラリはそれぞれのライセンスに従います。コードの公開と利用許諾の違いは[GitHubの説明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)も参照してください。
