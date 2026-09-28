import type { PreferenceStorage } from "../src/components/PreferencesProvider";
import type { Preferences } from "../src/lib-experience";
type StorageArea = {
  get: (keys: string[]) => Promise<Record<string, unknown>>;
  set: (values: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};
type Message = { type?: string; text?: unknown; timestamp?: number };
declare global {
  const chrome: {
    storage: {
      local: StorageArea & {
        setAccessLevel: (options: { accessLevel: string }) => Promise<void>;
      };
      session: StorageArea;
    };
    tabs: { create: (options: { url: string }) => Promise<unknown> };
    runtime: {
      getManifest: () => { version: string };
      onMessage: {
        addListener: (listener: (message: Message) => void) => void;
        removeListener: (listener: (message: Message) => void) => void;
      };
    };
  };
  const FUSION_API_URL: string;
}
export const preferenceStorage: PreferenceStorage = {
  read: async () => {
    const saved = await chrome.storage.local.get(["fusionPreferences"]);
    return (saved.fusionPreferences ?? {}) as Partial<Preferences>;
  },
  write: (value) => chrome.storage.local.set({ fusionPreferences: value }),
};
export async function request(path: string, token = "", data?: unknown) {
  if (!/^https:\/\/[a-z0-9-]+\.convex\.site$/.test(FUSION_API_URL))
    throw new Error("接続先が未設定の準備版です。");
  const response = await fetch(FUSION_API_URL + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(100000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "処理に失敗しました。");
  return result;
}
export type Connection = {
  connected: boolean;
  accountLinked: boolean;
  expired: boolean;
  balance?: number;
  expiresAt?: number;
};
export async function checkConnection(token: string): Promise<Connection> {
  if (!token) return { connected: false, accountLinked: false, expired: false };
  try {
    return await request("/api/extension/connection", token);
  } catch {
    // Old deployments still support balance sharing. Never infer account access.
    const { balance } = await request("/api/incense/balance", token);
    return { connected: true, accountLinked: false, expired: false, balance };
  }
}
export function openWeb() {
  return chrome.tabs.create({ url: "https://fusion.monku.ai/?view=settings" });
}
