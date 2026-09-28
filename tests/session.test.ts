import { describe, expect, it } from "vitest";
import {
  registrationToken,
  readSession,
  saveSession,
} from "../src/lib-session";
function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    key: (i) => [...values.keys()][i] ?? null,
  };
}
describe("session persistence", () => {
  it("reuses a persisted registration secret after an interrupted response", () => {
    const local = storage();
    const first = registrationToken(local);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(registrationToken(local)).toBe(first);
    saveSession(local, first);
    expect(readSession(local)).toBe(first);
    expect(registrationToken(local)).toBe(first);
    expect(local.getItem("monku_registration_token")).toBeNull();
  });
  it("does not pretend storage cleared by private mode is an existing session", () => {
    const local = storage();
    saveSession(local, registrationToken(local));
    local.clear();
    expect(readSession(local)).toBe("");
  });
});
