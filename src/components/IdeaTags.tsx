"use client";
import { UIStrings } from "../ui-strings";
import { type GenerationMode } from "../../shared/fusion";
import { type Genre } from "../../shared/idea-metadata";
import { genreLabels, modeLabels } from "../lib-experience";
import { usePreferences } from "./PreferencesProvider";

export default function IdeaTags({
  mode,
  genres = [],
}: {
  mode?: GenerationMode;
  genres?: Genre[];
}) {
  const { locale, t } = usePreferences();
  const choice = locale === "ja" ? 0 : locale === "fr" ? 2 : 1;
  return (
    <div
      className="idea-tags"
      role="group"
      aria-label={t(...UIStrings.generation_mode_and_genres)}
    >
      <span className="mode-tag">
        {mode
          ? `${t(...UIStrings.mode)}: ${modeLabels[mode][choice]}`
          : t(...UIStrings.mode_not_recorded)}
      </span>
      {genres.length ? (
        genres.map((genre) => (
          <span key={genre}>{genreLabels[genre][choice]}</span>
        ))
      ) : (
        <span>{t(...UIStrings.genre_unspecified)}</span>
      )}
    </div>
  );
}
