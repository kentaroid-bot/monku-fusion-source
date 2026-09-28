# Monku_AI Constitution v1.0 の Fusion への取り付け

## 原本と採用版

共通原本は非公開 `workspace/constitution.md`。Fusion は2026-09-28時点の採用版 v1.0 を [`monku-ai-constitution-v1.0.md`](monku-ai-constitution-v1.0.md) にバイト単位で固定した。原本の SHA-256 は `95f273a959673202081e27d557984f0b62ba8e3caa4d848420121d34f5726912`。このファイルは配布版のスナップショットであり、別の原本ではない。Fusion リポジトリ単独のビルドでも同じ版を使えるように保持する。

`npm run prompt:sync` はこのスナップショットから `shared/monku-constitution.ts` を生成する。モデルへ渡す本文はタイトルと「存在の定義と基本姿勢」以降。原本冒頭の、Codex担当者向けの日次読了・更新手順だけを除き、基本姿勢の文章は改稿しない。既存の Fusion 原稿 `monku-fusion-engine-2026-09-26.md` と生成済み `shared/fusion-prompt.ts` は保持する。

## 生成時の位置

共通の `generateFusion` が Gemini の `systemInstruction` に Constitution を、`contents` に既存の `buildPrompt` が作る Fusion 固有の本文・選択モード・入力を渡す。生成リクエストは一回のまま。安全確認用の別のモデル呼び出しには接続しない。

この関数は Convex の運営キーによる生成、Web と Chrome 拡張の本人キーによる直接生成に共通する。本人キーを運営サーバーへ送る経路は追加しない。モデルに送る本文はWebと拡張の配布コードから参照できるため、秘密情報を含めない。

## 更新方法と適用範囲

共通原本の変更は Fusion の稼働版を自動変更しない。新しい版を採用するときは、原本の版とハッシュを確認して新しいスナップショットを作り、生成コードを同期し、同じ入力で出力形式と回答品質を比較する。Web・Convex の配備と Chrome Web Store の更新は、それぞれの配布工程で行う。

今回はローカルのコードと拡張バンドルまで更新した。実モデルへの呼び出しや本番配備、ストア提出は行っていない。APIへの送信形と出力検証は通信を模擬した試験で確認する。
