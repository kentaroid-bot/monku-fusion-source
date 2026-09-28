# Chrome Web Store 申請記録

2026-09-25：**0.3.0の審査申請が完了し、「審査待ち」を確認（22:35 JST）。合格後の自動公開は有効。** 本人の明示承認で0.2.1の審査を取り下げ、確認済みの0.3.0 ZIP、掲載説明、新しい実画面2枚、Privacy欄、審査者向け手順を更新して再申請しました。本番Web/Convex反映・実接続確認も完了。公開中の0.2.0は維持され、0.3.0の合格・一般公開は未確認です。[変更・検証・提出内容](extension-0.3.0.md)。以下は0.2.xの提出履歴です。

2026-09-24時点の履歴: 公開ストアで0.2.0の「Chromeに追加」を確認。0.2.1を同日Braveのダッシュボードから審査送信し、「審査待ち」を確認。審査合格後の自動公開を選択。

## 2026-09-24 公開確認と次版候補

公開ページ: https://chromewebstore.google.com/detail/monku-fusion/hkjpofbcbbbnphpbegemjcimdceeeihb 。現在の公開版は0.2.0。0.2.1の提出ZIPは `dist/monku-fusion-0.2.1-candidate.zip`（SHA-256: `501bed173bff59e793376640576738b82216888dcbd761616536b860bcd0810a`）。採用済みのFusionプロンプト、きっかけのモンク、入力文言、安全確認の改訂を含む。BraveでZIPをアップロードし、下記の説明文を保存して審査送信。「このドラフトは審査待ちです」を確認。審査合格・0.2.1公開は未確認。

利用者の依頼により、パブリッシャー設定の「投稿者の表示名」を `kenoidart` から `monku.ai` に変更して保存。公開ストアで「提供元 monku.ai」を確認。トレーダーの法的販売者名・住所・電話番号は変更していない。

公開ストアの開発者欄には住所と電話番号が表示されている。利用者が販売ページでは電話を請求時開示にしたいと指定した方針と異なるため、ストア側の表示も要確認。[Googleのトレーダー向け説明](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq)では、電話番号と住所は公開表示される要件と明記されている。変更を望む場合は、Googleの要件を満たす別の連絡先を本人が用意し、ダッシュボードで変更可否を確認する。番号そのものをこの文書へ転記しない。

## 0.2.1の掲載文

名前: Monku Fusion

短い説明（0.2.1提出版）: 気になること・文句から、相手へ届く返信と新しい仕組みのアイデアを生み出します。

詳細（0.2.1提出版）:

```text
気になること・文句から、相手へ届く返信と新しい仕組みのアイデアへ。

Monku Fusionは、文句や摩擦の奥にある願いを仮説として読み取り、そのまま相手へ送れる返信と、対立する二つの価値を両立させる仕組みのアイデアを提案します。文句を打ち消さず、人間の動機を対話と創発へつなぎます。

Web上で選択した文章を右クリックから取り込むか、サイドパネルへ自分で入力できます。

・無料お試しは最大3回
・100円（税込）で10回分の買い切りチャージ
・同じ接続コードを使うWebと拡張機能で残数を共有
・自分のGemini APIキーも利用可能（Googleの料金・上限が適用されます）
・返信をコピーして活用

生成結果は自動公開されません。希望する場合だけ「きっかけのモンク」と生成結果を自分で確認・編集し、CC0の創発アーカイブへ公開できます。入力原文は自動で公開しません。

利用にはWebサイトでの無料接続が必要です。入力と生成結果は処理のためGoogleとTypeSafe AIへ送信されます。実名・連絡先・秘密は入力しないでください。AIの提案は内容を確認してお使いください。

Webサイト：https://fusion.monku.ai/
お問い合わせ：https://monku.ai/contact/
```

単一の目的: 選択・入力した文章を、建設的な返信と創発アイデアへ変換する。

## 権限の説明

| 権限 | 用途 |
|---|---|
| contextMenus | 選択文章の右クリックから生成パネルを開く |
| sidePanel | 文章入力と結果をサイドパネルに表示 |
| storage | 接続情報と本人のAPIキー、一時的な選択文章を保存 |
| generativelanguage.googleapis.com | BYOK時に本人のキーでGoogle Geminiへ直接送信 |
| 専用Convexホスト | 認証・残数・安全確認・生成・決済・明示公開 |

全サイトへのアクセス、閲覧履歴、ページ全体の読取、広告追跡は不要。リモート実行コードは使用しない。Geminiの出力はデータとして表示する。

## Privacy practices 記入根拠

- Website content: 利用者が選択・入力したテキスト。生成のためにGoogle/TypeSafe AI/Convexへ送信。ページ全体を収集しない。
- Authentication information: Gemini APIキーと匿名wallet接続トークン。端末で保管。GeminiキーはGoogleだけ、walletトークンは専用Convexだけに送信。
- Financial and payment information: 決済識別子、金額、残数をConvexへ保存。カード情報はStripeのページで処理し、拡張は読まない。
- Personal communications等: 利用者がメッセージ等を選択して入力する用途がある。ユーザー入力の内容に基づく該当カテゴリを申請時に再確認し、収集なしと一括回答しない。
- 販売・広告用途・信用評価はしない。サービスの単一目的に限定する。
- 運営者表示: monku.ai（利用者指定）。案内サイト: https://monku.ai/ 。問い合わせ窓口: https://monku.ai/contact/ 。販売者表示: https://fusion.monku.ai/commerce/ 。
- Homepage: https://fusion.monku.ai/ （2026-09-20 HTTPS 200確認）
- Privacy: https://fusion.monku.ai/privacy/ （2026-09-20 HTTPS 200確認）

## 審査者向け操作案内

1. Webで無料接続を作る（Turnstile）。「設定・接続」からコードを発行。
2. 拡張の設定にコードを貼り付け、接続。無料3回を確認。
3. 架空の文章「手続きが複雑で時間がかかります」を入力して生成。返信とアイデアを確認、コピー。
4. 設定に本人のGeminiキーを登録すればBYOKも使用可能。審査には無料3回で主機能を試せるよう本番設定を整える。
5. 原文が自動公開されないことを確認。公開ボタンは明示同意後のみ。公開直後は取り下げ可能。
6. 決済動作は事前にテストモードで検証する。ストア審査者へ実課金を必須にしない。

## 提出物

- `dist/extension/`をZIP化。manifest.jsonをZIPのルートに置く。開発用TS、生成スクリプト、秘密、node_modules、DESK.mdを含めない。
- 128pxアイコン: 既存アイコンを同梱。表示と権利は提出前確認。
- 1280×800または640×400のスクリーンショットを最低1枚。実画面で、架空入力と結果を使い、キー・トークンを映さない。
- 440×280の小さいプロモーション画像。大きいマーキーは任意。
- デベロッパーアカウント、連絡先メール確認、必要な登録手続き。
- ローカル模擬画面の画像は準備用。実サービスと一致することを確認してから提出。

公式: [準備](https://developer.chrome.com/docs/webstore/prepare)、[掲載](https://developer.chrome.com/docs/webstore/publish/)、[Privacy欄](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)。2026-09-20参照。

準備用画像は `docs/store-assets/`。ローカルの模擬API応答を使った画面であり、実運用・インストール済み拡張の実証ではない。小さいプロモーション画像も同梱。`python3 scripts/package-extension.py --preparation` で準備ZIPを作れる。実提出候補はreleaseビルド後、フラグなしで同スクリプトを実行する。SHA-256も出力する。

## 0.2.0提出時の候補（履歴）

`dist/monku-fusion-0.2.0-candidate.zip`。本番の専用Convexホストだけを許可し、秘密情報と開発資料を含めない。本番サイトは公開済み。ストア送信は別途依頼を受けて行う。公開後に登録・生成・残数・ポリシーURLを確認して候補を確定する。


候補の再現手順（公開URLは秘密ではありません）:

```sh
npm ci --ignore-scripts
NEXT_PUBLIC_CONVEX_SITE_URL=https://hip-hound-497.convex.site npm run build:extension:release
python3 scripts/package-extension.py
```

生成物 `extension/sidepanel.js` の接続先はビルド時に置換される。上の変数を省いた通常の準備ビルドでは接続先なしになるため、その出力を提出しない。ZIP内manifestのhost_permissionsとビルド記録を照合する。

候補ZIP SHA-256: `843a9669eb76ba18b70126c71a546ff7ef4f16909aae385861a4b0cb6be35a51`。
内容8ファイル: manifest.json、background.js、sidepanel.html、sidepanel.css、sidepanel.js、icons/icon-16.png、icons/icon-48.png、icons/icon-128.png。許可ホストはGoogle Geminiとhip-hound-497.convex.siteのみ。ZIP内容とWeb出力を使用キーの実値で照合し、混入なしを確認した。

## ストア下書き登録（2026-09-20）

アイテムID: hkjpofbcbbbnphpbegemjcimdceeeihb。候補ZIP 0.2.0をアップロードしドラフト作成。日本語・コミュニケーション、紹介文、ホームページ/サポートURL、権限理由、リモートコードなし、プライバシーURLを下書き保存。データ分類は決済情報・認証情報・個人的コミュニケーション・Webコンテンツ。審査用の無料登録/接続/生成手順を保存。

本人撮影の本番生成画面を台紙へ配置したextension-production-1280x800.png（1280×800、アルファなし）、同梱128pxアイコン、小プロモーション画像を登録。元画面の文章は改変していない。旧模擬画像はストアに登録していない。

ストアの送信不可理由はデータ使用に関する3つの適合表明のみ。表明と最終送信は未実施。右クリックからの本番実機経路はまだ最終確認していない。

## 2026-09-20 Chrome Web Store審査送信完了

利用者が右クリックからの選択文章取り込み成功を報告し、最終送信確認に「はい」と承認。Monku Fusion 0.2.0を送信し、Chrome Web Storeの「この拡張機能は審査のために送信されました」と「ステータス: 審査待ち」を確認した。アイテムID: hkjpofbcbbbnphpbegemjcimdceeeihb。日本語・コミュニケーション・全地域向け公開・アプリ内購入あり。合格後の自動公開を有効にして提出。現時点では審査合格・ストア公開は未確認。提出ZIP SHA-256: 843a9669eb76ba18b70126c71a546ff7ef4f16909aae385861a4b0cb6be35a51。過去の未提出・確認待ち記載は各時点の履歴。
