export const API = process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "";
export async function apiRequest(path: string, data?: unknown, token = "") {
  if (!/^https:\/\/[a-z0-9-]+\.convex\.site$/.test(API))
    throw new Error("接続先を準備中です。公開までお待ちください。");
  const res = await fetch(API + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(100000),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "処理に失敗しました。");
  return result;
}
