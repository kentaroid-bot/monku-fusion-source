import ja from "./messages/ja.json";
import en from "./messages/en.json";
import fr from "./messages/fr.json";
export type Locale = "ja" | "en" | "fr";
export type LocalizedText = [string, string, string];
export const localeIndex = (locale: Locale) =>
  locale === "ja" ? 0 : locale === "fr" ? 2 : 1;
// Each locale must supply exactly the same keys; coverage is checked in tests.
export const messages: Record<Locale, Record<keyof typeof ja, string>> = {
  ja,
  en,
  fr,
};
export const UIStrings = Object.fromEntries(
  Object.keys(ja).map((key) => [
    key,
    [
      ja[key as keyof typeof ja],
      en[key as keyof typeof ja],
      fr[key as keyof typeof ja],
    ],
  ]),
) as Record<keyof typeof ja, LocalizedText>;
export const translate = (locale: Locale, text: LocalizedText) =>
  text[localeIndex(locale)];
export function formatUI(
  text: LocalizedText,
  jaValues: unknown[],
  otherValues = jaValues,
): LocalizedText {
  return text.map((value, index) =>
    value.replace(/\{(\d+)\}/g, (_, n) =>
      String((index === 0 ? jaValues : otherValues)[Number(n)] ?? ""),
    ),
  ) as LocalizedText;
}
