"use client";
import { UIStrings } from "../ui-strings";
import { useRef, useState } from "react";
import { fields, type FusionOptions } from "../../shared/fusion";
import { genreIds, validateGenres } from "../../shared/idea-metadata";
import IdeaTags from "./IdeaTags";
import {
  exportDraft,
  fieldLabels,
  localizeError,
  skins,
  genreLabels,
  type Draft,
} from "../lib-experience";
import { usePreferences } from "./PreferencesProvider";
type Props = {
  draft: Draft;
  drafts: Draft[];
  busy: boolean;
  cost: string;
  canGenerate: boolean;
  onSelect: (id: string) => void;
  onChange: (patch: Partial<Draft>) => void;
  onGenerate: (
    input: string,
    revision?: FusionOptions["revision"],
  ) => Promise<void>;
  onMessage: (message: string) => void;
  onPublish: () => Promise<void>;
  onWithdraw: () => Promise<void>;
};
export default function ResultWorkspace({
  draft,
  drafts,
  busy,
  cost,
  canGenerate,
  onSelect,
  onChange,
  onGenerate,
  onMessage,
  onPublish,
  onWithdraw,
}: Props) {
  const { locale, t, skin } = usePreferences();
  const [feedback, setFeedback] = useState("");
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [target, setTarget] = useState<(typeof fields)[number] | "all">("all");
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const choice = locale === "ja" ? 0 : locale === "fr" ? 2 : 1;
  const generatedMode = Object.values(skins).find(
    (mode) => mode.mode === draft.options.mode,
  )!;
  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      onMessage(message);
    } catch {
      onMessage(
        t(...UIStrings.copy_failed_please_use_the_text_download_button),
      );
    }
  }
  function download() {
    try {
      const blob = new Blob([exportDraft(draft, locale)], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `monku-fusion-${draft.createdAt.replace(/[:.]/g, "-")}.txt`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onMessage(
        t(...UIStrings.exported_text_to_this_device_nothing_was_published),
      );
    } catch (error) {
      onMessage(localizeError(error, locale));
    }
  }
  return (
    <section
      className="result-workspace"
      aria-label={t(...UIStrings.generated_result)}
    >
      <div className="result-heading">
        <div>
          <p className="eyebrow">02 / RESULT</p>
          <h2>{t(...UIStrings.what_could_change_from_here)}</h2>
        </div>
        <p className="small">
          {t(...UIStrings.generated_with)}: {generatedMode.name[choice]}
          <br />
          {t(...UIStrings.output_language)}:{" "}
          {draft.options.outputLanguage === "auto"
            ? t(...UIStrings.same_as_input)
            : draft.options.outputLanguage === "ja"
              ? "日本語"
              : draft.options.outputLanguage === "fr"
                ? "Français"
                : "English"}
        </p>
      </div>
      <IdeaTags mode={draft.options.mode} genres={draft.genres} />
      {drafts.length > 1 && (
        <label>
          {t(...UIStrings.compare_results_from_this_page)}
          <select
            aria-label={t(...UIStrings.compare_results_from_this_page)}
            value={draft.id}
            disabled={busy}
            onChange={(e) => {
              onSelect(e.target.value);
              setFeedback("");
            }}
          >
            {drafts.map((entry, index) => (
              <option key={entry.id} value={entry.id}>
                {index + 1} ·{" "}
                {
                  Object.values(skins).find(
                    (s) => s.mode === entry.options.mode,
                  )!.name[choice]
                }{" "}
                · {entry.result.ideaTitle}
              </option>
            ))}
          </select>
        </label>
      )}
      <details className="source-input">
        <summary>
          {t(...UIStrings.review_the_input_used_for_generation)}
        </summary>
        <p>{draft.input}</p>
        <p className="small">
          {t(...UIStrings.this_is_the_input_after_automatic_redaction_of_email)}
        </p>
      </details>
      {draft.options.revision && (
        <div className="notice">
          <strong>{t(...UIStrings.your_feedback_for_this_revision)}</strong>
          <p>{draft.options.revision.feedback}</p>
          <details>
            <summary>
              {t(...UIStrings.compare_with_the_previous_result)}
            </summary>
            {fields.map((field) => (
              <div key={field}>
                <h3>{fieldLabels[field][choice]}</h3>
                <p>{draft.options.revision!.previous[field]}</p>
              </div>
            ))}
          </details>
        </div>
      )}
      <div className="result-fields">
        {fields.map((field, index) => (
          <article key={field} className="result-field">
            <span className="result-number">0{index + 1}</span>
            <div>
              <h3>{fieldLabels[field][choice]}</h3>
              {field === "pacifyReply" ? (
                <blockquote>{draft.result[field]}</blockquote>
              ) : (
                <p>{draft.result[field]}</p>
              )}
              {refinementOpen && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setTarget(field);
                    feedbackRef.current?.focus();
                  }}
                >
                  {t(...UIStrings.rework_this_part)}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <section className="box export-panel">
        <h3>{t(...UIStrings.keep_it_without_publishing)}</h3>
        <p>
          {t(
            ...UIStrings.inputs_feedback_and_result_history_on_this_page_disappear,
          )}
        </p>
        <div className="button-row">
          <button
            onClick={() =>
              copy(draft.result.pacifyReply, t(...UIStrings.reply_copied))
            }
          >
            {t(...UIStrings.copy_reply)}
          </button>
          <button
            onClick={() =>
              copy(
                exportDraft(draft, locale),
                t(
                  ...UIStrings.input_and_full_result_copied_nothing_was_published,
                ),
              )
            }
          >
            {t(...UIStrings.copy_full_result)}
          </button>
          <button onClick={download}>{t(...UIStrings.download_text)}</button>
        </div>
        <p className="small">
          {t(
            ...UIStrings.exports_include_your_original_input_review_the_contents_yourself,
          )}
        </p>
      </section>
      <details
        className="box refinement"
        open={refinementOpen}
        onToggle={(event) => setRefinementOpen(event.currentTarget.open)}
      >
        <summary>
          {t(...UIStrings.rework)}
          <span className="disclosure-caption">
            {t(...UIStrings.add_feedback_and_go_further)}
          </span>
        </summary>
        <p>{t(...UIStrings.that_part_is_wrong_keep_this_wish_describe_what)}</p>
        <label>
          {t(...UIStrings.part_to_rework)}
          <select
            aria-label={t(...UIStrings.part_to_rework)}
            value={target}
            onChange={(e) => setTarget(e.target.value as typeof target)}
          >
            <option value="all">{t(...UIStrings.whole_result)}</option>
            {fields.map((field) => (
              <option key={field} value={field}>
                {fieldLabels[field][choice]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="revision-feedback">
          {t(...UIStrings.what_feels_wrong_what_must_stay)}
        </label>
        <textarea
          id="revision-feedback"
          ref={feedbackRef}
          rows={3}
          maxLength={1000}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t(...UIStrings.for_example_i_do_not_want_to_be_more)}
        />
        <p className="small">
          {t(...UIStrings.your_feedback_and_previous_result_are_also_sent_to)}
        </p>
        <p className="cost-note">{cost}</p>
        <p className="small">
          {t(...UIStrings.next_response_mode)}: {skins[skin].name[choice]}
        </p>
        <button
          className="primary"
          disabled={busy || !canGenerate || !feedback.trim()}
          onClick={() =>
            onGenerate(draft.input, {
              previous: draft.result,
              target,
              feedback,
            })
          }
        >
          {busy
            ? t(...UIStrings.reworking)
            : t(...UIStrings.create_a_revision_using_the_method_above)}
        </button>
        <button
          className="text-button"
          disabled={busy || !canGenerate}
          onClick={() => onGenerate(draft.input)}
        >
          {t(...UIStrings.explore_this_input_in_the_current_mode_same_cost)}
        </button>
      </details>
      <details className="box publish-panel">
        <summary>{t(...UIStrings.if_you_choose_publish_this_idea)}</summary>
        <h3>{t(...UIStrings.context_to_publish)}</h3>
        <p>
          {t(...UIStrings.the_initial_draft_below_is_the_ai_s_interpretation)}
        </p>
        <label htmlFor="public-monku">
          {t(...UIStrings.context_reviewed_by_the_publisher)}
        </label>
        <textarea
          id="public-monku"
          rows={3}
          maxLength={4000}
          value={draft.monku}
          onChange={(e) => onChange({ monku: e.target.value })}
          disabled={!!draft.publishedId}
        />
        <fieldset
          className="genre-picker"
          disabled={busy || !!draft.publishedId}
        >
          <legend>{t(...UIStrings.genres_to_publish_up_to_two)}</legend>
          <p className="small">
            {t(...UIStrings.review_the_ai_s_suggestions_you_can_change_or)}
          </p>
          <div className="genre-options">
            {genreIds.map((genre) => {
              const selected = (draft.genres ?? []).includes(genre);
              return (
                <label key={genre}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && (draft.genres?.length ?? 0) >= 2}
                    onChange={() =>
                      onChange({
                        genres: validateGenres(
                          selected
                            ? draft.genres!.filter((item) => item !== genre)
                            : [...(draft.genres ?? []), genre],
                        ),
                      })
                    }
                  />
                  {genreLabels[genre][choice]}
                </label>
              );
            })}
          </div>
        </fieldset>
        <p>
          {t(
            ...UIStrings.this_description_the_seven_displayed_result_fields_the_generation,
          )}
        </p>
        <p className="small">
          {t(
            ...UIStrings.publication_uses_cc0_withdrawing_a_post_cannot_revoke_copies,
          )}
        </p>
        <button
          disabled={busy || !!draft.publishedId || !draft.monku.trim()}
          onClick={onPublish}
        >
          {t(...UIStrings.review_and_publish)}
        </button>
        {draft.publishedId && (
          <button disabled={busy} onClick={onWithdraw}>
            {t(...UIStrings.withdraw_publication)}
          </button>
        )}
      </details>
    </section>
  );
}
