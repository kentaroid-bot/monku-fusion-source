# Chrome拡張

リポジトリ直下で `npm ci && npm run build:extension` を実行し、`chrome://extensions` のデベロッパーモードから `dist/extension/` を読み込みます。

準備版は接続先なしでもビルドできます。動作には専用ConvexのURLを `NEXT_PUBLIC_CONVEX_SITE_URL` に指定して再ビルドしてください。配布候補は `npm run build:extension:release` で作成します。

Webで初回接続→設定から接続コード発行→拡張に貼り付け。匿名walletの残数を共有します。APIキーは設定で追加・削除できます。購入後は残数更新ボタンで同期します。

[申請資料](../docs/chrome-web-store.md) / [公開手順](../docs/deployment.md)。実ストア申請前に専用バックエンド・公開サイト・問い合わせ先・実機動作を確認します。
