/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { digest } from "../convex/security";
import { buildPrompt, fields, validateGeneratedFusion } from "../shared/fusion";
import { validateGenres } from "../shared/idea-metadata";
const modules = import.meta.glob("../convex/**/*.ts");
const sample = Object.fromEntries(
  fields.map((key) => [key, "Fictional example"]),
);
const token = "a".repeat(64);
const post = (data: unknown) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(data),
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("GEMINI_API_KEY", "mock");
  vi.stubEnv("TYPESAFE_API_KEY", "mock");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function setup() {
  const t = convexTest(schema, modules);
  const tokenHash = await digest(token);
  await t.mutation(internal.incense.createWallet, { tokenHash });
  const wallet = (await t.query(internal.incense.authenticate, { tokenHash }))!;
  return { t, wallet };
}
function providers(genres: unknown = ["work", "learning"]) {
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("api.typesafe.ai")
            ? {
                answers: {
                  has_pii: { type: "noul", noul: 0 },
                  is_threat: { type: "noul", noul: 0 },
                },
              }
            : {
                candidates: [
                  {
                    content: {
                      parts: [{ text: JSON.stringify({ ...sample, genres }) }],
                    },
                  },
                ],
              },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
describe("idea modes and genres", () => {
  it("keeps the seven core fields and validates a bounded set of genre IDs", () => {
    expect(validateGeneratedFusion(sample)).toEqual(sample);
    expect(
      validateGeneratedFusion({ ...sample, genres: ["life", "work"] }).genres,
    ).toEqual(["work", "life"]);
    for (const genres of [
      "work",
      null,
      ["private@example.com"],
      ["work", "work"],
      ["work", "life", "learning"],
    ]) {
      expect(() => validateGeneratedFusion({ ...sample, genres })).toThrow();
    }
    expect(validateGenres([])).toEqual([]);
    expect(buildPrompt("input")).not.toContain("公開用ジャンル");
    expect(
      buildPrompt("input", { mode: "lab", outputLanguage: "en" }),
    ).toContain("7項目とgenresの計8キー");
  });
  it("returns AI genre suggestions on generation and cached retry without extra charges", async () => {
    const { t, wallet } = await setup();
    const fetcher = providers();
    const body = {
      noiseText: "Fictional input",
      options: { mode: "lab", outputLanguage: "en" },
      requestId: "metadata-generation-01",
    };
    const first = await t.fetch("/api/fusion/free-trial", post(body));
    expect(first.status).toBe(200);
    expect((await first.json()).result).toEqual({
      ...sample,
      genres: ["work", "learning"],
    });
    const count = fetcher.mock.calls.length;
    expect(
      (await (await t.fetch("/api/fusion/free-trial", post(body))).json())
        .result.genres,
    ).toEqual(["work", "learning"]);
    expect(fetcher.mock.calls).toHaveLength(count);
    expect((await t.run((ctx) => ctx.db.get(wallet._id)))!.balance).toBe(4);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("refunds invalid genre output instead of storing arbitrary metadata", async () => {
    const { t, wallet } = await setup();
    providers(["invalid"]);
    const response = await t.fetch(
      "/api/fusion/free-trial",
      post({
        noiseText: "input",
        options: { mode: "lab" },
        requestId: "invalid-genre-result",
      }),
    );
    expect(response.status).toBe(400);
    expect((await t.run((ctx) => ctx.db.get(wallet._id)))!.balance).toBe(5);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
  it("publishes reviewed genres, binds deduplication to metadata and rejects invalid inputs before providers", async () => {
    const { t } = await setup();
    const fetcher = providers();
    const body = {
      result: { ...sample, genres: ["society"] },
      monku: "Reviewed context",
      mode: "lab",
      genres: ["work", "life"],
      publishConsent: true,
    };
    for (const patch of [
      { mode: "invented" },
      { genres: ["invalid"] },
      { genres: ["life", "work", "society"] },
      { publishConsent: false },
    ]) {
      expect(
        (await t.fetch("/api/fusion/save", post({ ...body, ...patch }))).status,
      ).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
    const first = await t.fetch("/api/fusion/save", post(body));
    expect(first.status).toBe(200);
    const id = (await first.json()).id;
    expect(
      (
        await (
          await t.fetch(
            "/api/fusion/save",
            post({ ...body, genres: ["life", "work"] }),
          )
        ).json()
      ).id,
    ).toBe(id);
    const changed = await t.fetch(
      "/api/fusion/save",
      post({ ...body, mode: "deep" }),
    );
    expect(changed.status).toBe(200);
    expect((await changed.json()).id).not.toBe(id);
    const items = (await (await t.fetch("/api/fusion/list?genre=work")).json())
      .items;
    expect(items).toHaveLength(2);
    expect(items.find((item: { id: string }) => item.id === id)).toMatchObject({
      mode: "lab",
      genres: ["work", "life"],
    });
    for (const item of items)
      for (const key of ["ownerId", "rawNoise", "hash", "genre1", "genre2"])
        expect(item).not.toHaveProperty(key);
  });
  it("filters across the full paginated archive, including a second genre, without inventing legacy metadata", async () => {
    const { t, wallet } = await setup();
    for (let i = 0; i < 60; i++)
      await t.mutation(internal.fusions.saveFusion, {
        ownerId: wallet._id,
        hash: `archive-${i}`,
        result: { ...sample, ideaTitle: `Idea ${i}` },
        mode: i % 2 ? "lab" : "deep",
        genres: i % 2 ? ["work", "learning"] : ["life"],
      });
    const old = await t.mutation(internal.fusions.saveFusion, {
      ownerId: wallet._id,
      hash: "old",
      result: sample,
    });
    await t.run((ctx) =>
      ctx.db.insert("fusions", {
        ...sample,
        published: false,
        hash: "private",
        rawNoise: "PRIVATE",
        genre1: "learning",
        createdAt: Date.now(),
      } as never),
    );
    const alice = t.withIdentity({ subject: "alice" });
    const first = await (
      await alice.fetch("/api/fusion/list?genre=learning")
    ).json();
    expect(first.items).toHaveLength(20);
    expect(first.isDone).toBe(false);
    const second = await (
      await alice.fetch(
        `/api/fusion/list?genre=learning&cursor=${encodeURIComponent(first.cursor)}`,
      )
    ).json();
    expect(second.items).toHaveLength(10);
    expect(second.isDone).toBe(true);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(30);
    expect(
      [...first.items, ...second.items].every(
        (item) => item.genres.includes("learning") && item.mode === "lab",
      ),
    ).toBe(true);
    const legacy = (
      await (await alice.fetch("/api/fusion/list")).json()
    ).items.find((item: { id: string }) => item.id === old);
    expect(legacy).not.toHaveProperty("mode");
    expect(legacy).not.toHaveProperty("genres");
    expect((await alice.fetch("/api/fusion/list?genre=invalid")).status).toBe(
      400,
    );
  });
  it("never expands the anonymous five-item window when filtering", async () => {
    const { t, wallet } = await setup();
    await t.mutation(internal.fusions.saveFusion, {
      ownerId: wallet._id,
      hash: "older-learning",
      result: sample,
      genres: ["learning"],
    });
    for (let i = 0; i < 6; i++)
      await t.mutation(internal.fusions.saveFusion, {
        ownerId: wallet._id,
        hash: `new-${i}`,
        result: sample,
        genres: ["work"],
      });
    expect(
      (await (await t.fetch("/api/fusion/list?genre=learning")).json()).items,
    ).toEqual([]);
    expect(
      (await (await t.fetch("/api/fusion/list?genre=work")).json()).items,
    ).toHaveLength(5);
    expect(
      (
        await (
          await t
            .withIdentity({ subject: "alice" })
            .fetch("/api/fusion/list?genre=learning")
        ).json()
      ).items,
    ).toHaveLength(1);
  });
  it("filters only the viewer's likes, paginates matches and hides withdrawn ideas", async () => {
    const { t, wallet } = await setup();
    const ids = [];
    for (let i = 0; i < 31; i++) {
      const id = await t.mutation(internal.fusions.saveFusion, {
        ownerId: wallet._id,
        hash: `liked-${i}`,
        result: sample,
        mode: "steps",
        genres: i === 30 ? ["life"] : ["work", "learning"],
      });
      ids.push(id);
      await t.mutation(internal.fusions.setLike, {
        subject: "alice",
        id,
        liked: true,
      });
    }
    const alice = t.withIdentity({ subject: "alice" });
    const first = await (
      await alice.fetch("/api/fusion/liked?genre=learning")
    ).json();
    expect(first.items).toHaveLength(20);
    const second = await (
      await alice.fetch(
        `/api/fusion/liked?genre=learning&cursor=${encodeURIComponent(first.cursor)}`,
      )
    ).json();
    expect(second.items).toHaveLength(10);
    expect(second.isDone).toBe(true);
    expect(
      [...first.items, ...second.items].every(
        (item) => item.liked && item.mode === "steps",
      ),
    ).toBe(true);
    expect(
      (
        await (
          await t
            .withIdentity({ subject: "bob" })
            .fetch("/api/fusion/liked?genre=learning")
        ).json()
      ).items,
    ).toEqual([]);
    expect((await t.fetch("/api/fusion/liked?genre=learning")).status).toBe(
      400,
    );
    await t.mutation(internal.fusions.remove, {
      ownerId: wallet._id,
      id: ids[30],
    });
    expect(
      (await (await alice.fetch("/api/fusion/liked?genre=life")).json()).items,
    ).toEqual([]);
  });
});
