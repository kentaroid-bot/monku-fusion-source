import { describe, expect, it } from "vitest";
import {
  messages,
  UIStrings,
  translate,
  formatUI,
  type Locale,
} from "../src/ui-strings";
import { exportDraft, localizeError } from "../src/lib-experience";
import {
  buildPrompt,
  validateOptions,
  fields,
  type Fusion,
} from "../shared/fusion";
describe("three-language interface", () => {
  it("keeps every translation and interpolation placeholder in sync", () => {
    for (const locale of ["ja", "en", "fr"] as Locale[]) {
      expect(Object.keys(messages[locale]).sort()).toEqual(
        Object.keys(messages.ja).sort(),
      );
      for (const key of Object.keys(
        messages.ja,
      ) as (keyof typeof messages.ja)[]) {
        expect(messages[locale][key].trim(), key).not.toBe("");
        expect(
          (messages[locale][key].match(/\{\d+\}/g) ?? []).sort(),
          key,
        ).toEqual((messages.ja[key].match(/\{\d+\}/g) ?? []).sort());
      }
    }
    expect(translate("fr", formatUI(UIStrings.retire_agree, [9]))).toContain(
      "9 utilisations",
    );
  });
  it("supports explicit French generation independently of the interface", () => {
    expect(
      validateOptions({ mode: "lab", outputLanguage: "fr" })!.outputLanguage,
    ).toBe("fr");
    expect(
      buildPrompt("Test", { mode: "lab", outputLanguage: "fr" }),
    ).toContain("フランス語");
    const draft = {
      id: "mock",
      input: "Private input",
      result: Object.fromEntries(fields.map((f) => [f, "Test"])) as Fusion,
      options: { mode: "lab" as const, outputLanguage: "fr" as const },
      createdAt: "2026-09-25",
      monku: "",
      publishedId: "",
      genres: ["work" as const],
    };
    expect(exportDraft(draft, "fr")).toContain("Mode de réponse : Monku Labo");
    expect(exportDraft(draft, "fr")).toContain("Catégories : Travail");
    expect(exportDraft(draft, "fr")).toContain("Private input");
    expect(
      localizeError(new Error("安全確認に失敗しました。"), "fr"),
    ).toContain("sécurité");
    expect(
      localizeError(
        new Error(messages.ja.removed_from_the_public_archive),
        "fr",
      ),
    ).toBe(messages.fr.removed_from_the_public_archive);
  });
});
