const TOKEN = "monku_token";
const PENDING = "monku_registration_token";
export function readSession(storage: Storage): string {
  return storage.getItem(TOKEN) || "";
}
export function registrationToken(storage: Storage): string {
  const existing = readSession(storage) || storage.getItem(PENDING);
  if (existing) return existing;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  // Persist before making any request, so a lost response can be retried.
  storage.setItem(PENDING, token);
  return token;
}
export function saveSession(storage: Storage, token: string) {
  storage.setItem(TOKEN, token);
  storage.removeItem(PENDING);
}
export function clearSession(storage: Storage) {
  storage.removeItem(TOKEN);
  storage.removeItem(PENDING);
}
