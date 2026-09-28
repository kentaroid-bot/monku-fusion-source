import { describe, expect, it, vi } from "vitest";
import { getConvexToken } from "../src/lib-account-auth";

describe("Clerk credentials for Convex HTTP requests", () => {
  it("uses the integration's session token without requiring a JWT template", async () => {
    const getToken = vi.fn(async (options?: { template?: string }) => {
      if (options?.template) throw new Error("No JWT template exists");
      return "session-token";
    });
    expect(await getConvexToken(getToken, "convex")).toBe("session-token");
    expect(getToken).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([undefined, "other-service"])("keeps legacy template support for audience %s", async (audience) => {
    const getToken = vi.fn(async () => "template-token");
    expect(await getConvexToken(getToken, audience)).toBe("template-token");
    expect(getToken).toHaveBeenCalledExactlyOnceWith({ template: "convex" });
  });

  it("does not substitute another credential when a session expires or fails", async () => {
    const expired = vi.fn(async () => null);
    expect(await getConvexToken(expired, "convex")).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
    const failed = vi.fn(async () => { throw new Error("session unavailable"); });
    await expect(getConvexToken(failed, "convex")).rejects.toThrow("session unavailable");
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
