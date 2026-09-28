import { UIStrings } from "./ui-strings";
import {
  fields,
  type Fusion,
  type FusionOptions,
  type GenerationMode,
  type OutputLanguage,
} from "../shared/fusion";
import { type Genre } from "../shared/idea-metadata";
export const modeLabels: Record<GenerationMode, [string, string, string]> = {
  everyday: UIStrings.yohaku,
  lab: UIStrings.monku_labo,
  deep: UIStrings.focus,
  steps: UIStrings.dev,
};
export const genreLabels: Record<Genre, [string, string, string]> = {
  work: UIStrings.work,
  learning: UIStrings.learning,
  life: UIStrings.everyday_life,
  relationships: UIStrings.relationships,
  society: UIStrings.community_society,
  making: UIStrings.technology_making,
};
export type { Locale } from "./ui-strings";
import { type Locale, translate } from "./ui-strings";
export type Skin = "a15" | "b" | "c" | "t";
export type Preferences = {
  locale: Locale;
  skin: Skin;
  outputLanguage: OutputLanguage;
};
export const defaultPreferences: Preferences = {
  locale: "ja",
  skin: "a15",
  outputLanguage: "auto",
};
export const skins: Record<
  Skin,
  {
    mode: GenerationMode;
    name: [string, string, string];
    purpose: [string, string, string];
    description: [string, string, string];
    title: [string, string, string];
  }
> = {
  a15: {
    mode: "everyday",
    name: modeLabels.everyday,
    purpose: UIStrings.make_room_in_everyday_life,
    description: UIStrings.turn_friction_at_work_and_in_everyday_life_into,
    title: UIStrings.turn_friction_into_something_new,
  },
  b: {
    mode: "lab",
    name: modeLabels.lab,
    purpose: UIStrings.expand_possibilities,
    description:
      UIStrings.shift_familiar_assumptions_and_experiment_with_avant_garde_ideas,
    title: UIStrings.let_frustration_spark_an_invention,
  },
  c: {
    mode: "deep",
    name: modeLabels.deep,
    purpose: UIStrings.deepen_the_thinking,
    description:
      UIStrings.explore_specialist_questions_and_underlying_structures_to_build_a,
    title: UIStrings.from_what_feels_wrong_to_a_new_possibility,
  },
  t: {
    mode: "steps",
    name: modeLabels.steps,
    purpose: UIStrings.move_toward_implementation,
    description:
      UIStrings.turn_ideas_into_specifications_designs_and_implementation_steps_you,
    title: UIStrings.turn_friction_into_a_next_step,
  },
};
export const fieldLabels: Record<
  (typeof fields)[number],
  [string, string, string]
> = {
  entropyCore: UIStrings.the_wish_beneath_it_ai_interpretation,
  pacifyReply: UIStrings.words_to_reach_the_other_person,
  finiteOpposites: UIStrings.two_values_to_hold_together,
  infiniteCaption: UIStrings.a_third_possibility,
  ideaTitle: UIStrings.idea_title,
  ideaConcept: UIStrings.how_the_idea_works,
  ideaReason: UIStrings.why_this_responds_to_the_problem,
};
export type Draft = {
  id: string;
  input: string;
  result: Fusion;
  options: FusionOptions;
  createdAt: string;
  monku: string;
  publishedId: string;
  genres?: Genre[];
};
export function exportDraft(draft: Draft, locale: Locale): string {
  const choose = (...text: [string, string, string]) => translate(locale, text);
  const skin = Object.values(skins).find((s) => s.mode === draft.options.mode)!;
  return [
    "Monku Fusion",
    draft.createdAt,
    choose(...UIStrings.response_mode) +
      skin.name[locale === "ja" ? 0 : locale === "fr" ? 2 : 1],
    choose(...UIStrings.output_language_2) + draft.options.outputLanguage,
    choose(...UIStrings.genres) +
      (draft.genres?.length
        ? draft.genres
            .map(
              (genre) =>
                genreLabels[genre][
                  locale === "ja" ? 0 : locale === "fr" ? 2 : 1
                ],
            )
            .join(" / ")
        : choose(...UIStrings.unspecified)),
    "",
    choose(...UIStrings.your_original_input),
    draft.input,
    ...(draft.options.revision
      ? [
          "",
          choose(...UIStrings.revision_feedback),
          draft.options.revision.feedback,
        ]
      : []),
    "",
    ...fields.flatMap((field) => [
      fieldLabels[field][locale === "ja" ? 0 : locale === "fr" ? 2 : 1],
      draft.result[field],
      "",
    ]),
    choose(
      ...UIStrings.ai_generated_suggestions_check_that_they_preserve_your_concern,
    ),
    "",
  ].join("\n");
}
export function localizeError(error: unknown, locale: Locale): string {
  const raw = error instanceof Error ? error.message : "";
  // Translate already-known notices before treating them as backend errors.
  const known = Object.values(UIStrings).find((text) => text.includes(raw));
  if (known) return translate(locale, known);
  if (locale === "ja" && raw) return raw;
  const rules: [RegExp, [string, string, string]][] = [
    [/退会設定/, UIStrings.error_retire_setup],
    [/退会時.*同意/, UIStrings.error_retire_consent],
    [/退会処理|退会済み|退会を受け付け/, UIStrings.error_retired],
    [/削除できません/, UIStrings.error_withdraw],
    [/ジャンル/, UIStrings.error_genres],
    [/回答モード/, UIStrings.error_mode],
    [/お線香がありません|利用回数が残っていません/, UIStrings.error_no_uses],
    [/無料のお試しは本日の上限/, UIStrings.error_free_limit],
    [/個人情報または危険/, UIStrings.error_personal],
    [/練り直し.*1000/, UIStrings.error_revision],
    [/入力は1〜4000/, UIStrings.error_input],
    [/接続コード/, UIStrings.error_code],
    [/利用が集中/, UIStrings.error_limit],
    [/安全確認/, UIStrings.error_safety],
    [/AIの処理|AIから|生成結果の形式/, UIStrings.error_generation],
    [/処理中、返却済み|処理の期限/, UIStrings.error_pending],
    [/ログイン/, UIStrings.error_login],
    [/保存設定|保存でき/, UIStrings.error_storage],
    [/接続|残数/, UIStrings.error_connection],
    [/API設定/, UIStrings.error_key],
    [/公開への同意/, UIStrings.error_publish],
    [/本人操作|初回登録/, UIStrings.error_challenge],
    [/fetch|network|timeout|abort/i, UIStrings.error_network],
  ];
  return translate(
    locale,
    rules.find(([pattern]) => pattern.test(raw))?.[1] ??
      UIStrings.error_generic,
  );
}
