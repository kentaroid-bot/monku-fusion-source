export function secretToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function digest(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function requireToken(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new Error("接続情報が無効です。");
  return value;
}
export async function verifyTurnstile(token: unknown): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET;
  const hosts = (process.env.TURNSTILE_HOSTNAMES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!secret || !hosts.length)
    throw new Error("初回登録の設定が完了していません。");
  if (typeof token !== "string" || !token || token.length > 2048)
    throw new Error("本人操作の確認が必要です。");
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    },
  );
  if (!res.ok) throw new Error("本人操作の確認に失敗しました。");
  const result = await res.json();
  if (
    result.success !== true ||
    result.action !== "signup" ||
    !hosts.includes(result.hostname)
  )
    throw new Error("本人操作の確認に失敗しました。");
}
