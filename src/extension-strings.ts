import type { LocalizedText } from "./ui-strings";

export const ExtensionStrings = {
  web: ["Webを開く", "Open web app", "Ouvrir le site"],
  connect: ["Webと接続する", "Connect to the web app", "Se connecter au site"],
  connectionHelp: [
    "Webの設定で接続コードを発行して、ここに貼り付けてください。ログインしてアカウント連携コードを発行すると、全件・いいね・自分の投稿も使えます。",
    "Create a connection code in the web app’s Settings and paste it here. Sign in and issue an account connection code to access all ideas, likes and your posts.",
    "Créez un code dans les paramètres du site et collez-le ici. Connectez-vous et créez un code de liaison au compte pour accéder à toutes les idées, aux favoris et à vos publications.",
  ],
  code: ["接続コード", "Connection code", "Code de connexion"],
  connectButton: ["接続する", "Connect", "Connecter"],
  accountAccess: [
    "全件・いいね・自分の投稿も拡張と連携する",
    "Link all ideas, likes and my posts to the extension",
    "Lier toutes les idées, les favoris et mes publications à l’extension",
  ],
  accountHelp: [
    "このコードを使った拡張は、利用回数の共有に加え、アイデア全件・いいね・自分の投稿を30日間利用できます。下の接続一覧からいつでも解除できます。",
    "The extension using this code can share your balance and access all ideas, likes and your posts for 30 days. You can revoke it below at any time.",
    "L’extension utilisant ce code pourra partager votre solde et accéder à toutes les idées, aux favoris et à vos publications pendant 30 jours. Vous pourrez révoquer cette connexion ci-dessous.",
  ],
  accountCode: [
    "アカウント連携コードを発行",
    "Create account connection code",
    "Créer un code de liaison au compte",
  ],
  manage: [
    "連携済みの拡張を確認",
    "View connected extensions",
    "Voir les extensions connectées",
  ],
  noConnections: [
    "アカウント連携済みの拡張はありません。",
    "No extensions are linked to your account.",
    "Aucune extension n’est liée à votre compte.",
  ],
  issued: ["接続日", "Connected", "Connexion"],
  expires: ["有効期限", "Expires", "Expiration"],
  revoke: [
    "この接続を解除",
    "Revoke this connection",
    "Révoquer cette connexion",
  ],
  revokeConfirm: [
    "この拡張の接続を解除しますか？ 利用回数・投稿・いいねはアカウントに残ります。拡張で再び使うには、新しいコードで接続してください。",
    "Revoke this extension connection? Your balance, posts and likes stay in your account. Reconnect with a new code to use the extension again.",
    "Révoquer cette connexion ? Votre solde, vos publications et vos favoris restent dans votre compte. Reconnectez l’extension avec un nouveau code pour la réutiliser.",
  ],
  revoked: [
    "接続を解除しました。利用回数はアカウントに残っています。",
    "Connection revoked. Your balance remains in your account.",
    "Connexion révoquée. Votre solde reste dans votre compte.",
  ],
  connectedAccount: [
    "Webのアカウントと連携済み",
    "Linked to your web account",
    "Liée à votre compte sur le site",
  ],
  walletOnly: [
    "利用回数をWebと共有しています。全件・いいね・自分の投稿を使うには、Webでログインしてアカウント連携コードを発行し、接続し直してください。",
    "Your balance is shared with the web app. For all ideas, likes and your posts, sign in on the web and reconnect with an account connection code.",
    "Votre solde est partagé avec le site. Pour accéder à toutes les idées, aux favoris et à vos publications, connectez-vous au site et utilisez un code de liaison au compte.",
  ],
  connectionExpired: [
    "接続の有効期限が切れました。Webでログインし、新しいアカウント連携コードで接続してください。残数はアカウントに残っています。",
    "This connection has expired. Sign in on the web and reconnect with a new account connection code. Your balance stays in your account.",
    "Cette connexion a expiré. Connectez-vous au site et utilisez un nouveau code de liaison au compte. Votre solde reste dans votre compte.",
  ],
  connectionNeeded: [
    "設定からWebに接続してください。",
    "Connect to the web app in Settings.",
    "Connectez-vous au site depuis les paramètres.",
  ],
  switchConfirm: [
    "接続先を切り替えます。現在の残数はWeb側でも確認できますか？ 新しい接続の確認が成功してから切り替えます。",
    "Switch connections? Make sure you can access your current balance on the web. We will switch only after verifying the new connection.",
    "Changer de connexion ? Assurez-vous de pouvoir retrouver votre solde actuel sur le site. Le changement aura lieu après vérification de la nouvelle connexion.",
  ],
  keyStorage: [
    "キーはこの拡張の端末内に保存し、Googleへ直接送信します。消去するまで残ります。Google側の料金・上限が適用されます。",
    "Your key is stored locally in this extension until you delete it and is sent directly to Google. Google’s fees and limits apply.",
    "Votre clé est conservée localement dans cette extension jusqu’à sa suppression et envoyée directement à Google. Les tarifs et limites de Google s’appliquent.",
  ],
  saveKey: ["キーを保存", "Save key", "Enregistrer la clé"],
  keySaved: [
    "キーをこの端末に保存しました。",
    "Key saved on this device.",
    "Clé enregistrée sur cet appareil.",
  ],
  keyDeleted: ["キーを消去しました。", "Key deleted.", "Clé supprimée."],
  selectedText: [
    "選択した文章を受け取りました。入力中の文章と置き換えますか？",
    "Selected text received. Replace your current input?",
    "Texte sélectionné reçu. Remplacer le texte en cours ?",
  ],
  useSelection: [
    "選択した文章を使う",
    "Use selected text",
    "Utiliser le texte sélectionné",
  ],
  keepInput: ["今の入力を残す", "Keep current input", "Garder le texte actuel"],
  localDrafts: [
    "入力と結果はこのパネルを開いている間だけ保持します。残したい結果はコピーやテキスト保存で持ち帰れます。",
    "Inputs and results stay only while this panel is open. Copy or download results you want to keep.",
    "Les textes et résultats sont conservés uniquement tant que ce panneau est ouvert. Copiez ou téléchargez ceux que vous souhaitez garder.",
  ],
  archiveNeedsAccount: [
    "現在は公開された直近5件を表示しています。全件・いいね・自分の投稿は、設定からWebのアカウントと連携すると使えます。",
    "Showing the latest five public ideas. Link your web account in Settings for all ideas, likes and your posts.",
    "Les cinq idées publiques les plus récentes sont affichées. Liez votre compte dans les paramètres pour accéder à toutes les idées, aux favoris et à vos publications.",
  ],
  loading: [
    "接続を確認中…",
    "Checking connection…",
    "Vérification de la connexion…",
  ],
  refresh: [
    "接続・残数を更新",
    "Refresh connection and balance",
    "Actualiser la connexion et le solde",
  ],
  unknown: [
    "接続を確認できません。設定で再確認してください。保存済みの接続情報は保持しています。",
    "Could not verify the connection. Retry in Settings. Your saved connection is preserved.",
    "Impossible de vérifier la connexion. Réessayez dans les paramètres. Les informations enregistrées sont conservées.",
  ],
} satisfies Record<string, LocalizedText>;
