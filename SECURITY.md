# セキュリティ上の問題を見つけた方へ

認証・決済・APIキー・公開範囲などの問題は、[monku.aiの問い合わせ窓口](https://monku.ai/contact/)へ非公開でご連絡ください。公開Issueには、秘密の値や利用者のデータ、問題を悪用できる詳細を載せないでください。

対象の画面や機能、利用した版・日時、期待した動作と実際の動作、再現手順を、架空の入力で説明していただけると確認しやすくなります。APIキー、接続コード、認証トークン、カード番号は送らないでください。スクリーンショットに含まれる場合も伏せてください。

本番の第三者アカウント・投稿・決済を使った検証は行わず、再現は自分のローカル環境とテスト用データでお願いします。報告の確認に必要な追加情報は、窓口から相談します。

## 確認できる資料

- [データの送信先・保存・削除](docs/data-handling.md)
- [安全設計と実装上の限界](docs/security.md)
- [ソースと配布版の対応・検証](docs/source-and-releases.md)
- [自動テスト](tests/)

公開ソース、模擬テストの成功、運営者による点検は、独立したセキュリティ監査の認証を示すものではありません。

## Reporting in English

Please report security concerns privately through the [monku.ai contact form](https://monku.ai/contact/). Include the affected feature/version, expected and observed behavior, and reproduction steps using fictional data. Do not send API keys, pairing codes, authentication tokens, card numbers, or other users' data. Keep exploitable details out of public issues. Use your own local environment and test data for reproduction.
