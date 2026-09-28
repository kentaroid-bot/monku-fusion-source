// Monku Fusion Background Service Worker (Manifest V3)

async function configureMenu() {
  const saved = await chrome.storage.local.get(["fusionPreferences"]);
  const titles = {
    ja: "Monku Fusionでつくる",
    en: "Create with Monku Fusion",
    fr: "Créer avec Monku Fusion",
  };
  const title =
    titles[saved.fusionPreferences?.locale] ||
    chrome.i18n.getMessage("contextMenu");
  chrome.contextMenus.removeAll(() =>
    chrome.contextMenus.create({
      id: "monku-fusion-action",
      title,
      contexts: ["selection"],
    }),
  );
}
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  // 1. ツールバーのアイコンクリック時にサイドパネルを開く
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }

  // 2. テキスト選択時の右クリックメニューを登録
  await configureMenu();
});
chrome.runtime.onStartup.addListener(() => {
  void configureMenu();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.fusionPreferences) void configureMenu();
});

// 右クリックメニューが押されたときの処理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "monku-fusion-action" && info.selectionText) {
    const text = info.selectionText.trim().slice(0, 4000);
    const now = Date.now();

    // 【重要】ユーザー操作の権限が切れる前に、最優先でサイドパネルを開く！
    if (tab && tab.id) {
      chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
        console.warn("tabIdでのオープン失敗、windowIdで再試行:", err);
        if (tab.windowId) {
          chrome.sidePanel.open({ windowId: tab.windowId }).catch((e) => {
            console.error("Side panel open error:", e);
          });
        }
      });
    }

    // 選択テキストとタイムスタンプを保存
    chrome.storage.session
      .set({
        lastSelectedText: text,
        lastSelectedTime: now,
      })
      .then(() => {
        // すでに開いているパネルがあれば即時メッセージ送信
        chrome.runtime
          .sendMessage({
            type: "FUSION_TARGET_RECEIVED",
            text: text,
            timestamp: now,
          })
          .catch(() => {
            // パネルがまだ開いていなくても、パネル初期ロード時にstorageから自動取得される
          });
      });
  }
});
