import { UIStrings } from "../ui-strings";
import { usePreferences } from "./PreferencesProvider";

/** Each mode has its own composition, following the original four design samples. */
export default function ModeArtwork() {
  const { skin, t } = usePreferences();
  return (
    <div className={`mode-art art-${skin}`} aria-hidden="true">
      {skin === "a15" && (
        <>
          <div className="paper-note note-concern">
            {t(...UIStrings.something_feels_wrong)}
          </div>
          <div className="paper-note note-wish">
            {t(...UIStrings.what_if_it_could_change)}
          </div>
          <small>{t(...UIStrings.it_starts_with_a_small_observation)}</small>
        </>
      )}
      {skin === "b" && (
        <>
          <div className="lab-note">
            <small>LAB NOTE / 001</small>
            <strong>{t(...UIStrings.friction)}</strong>
            <span className="lab-arrow">↓</span>
            <strong>{t(...UIStrings.what_if)}</strong>
          </div>
          <span className="idea-sticker">IDEA!</span>
          <span className="lab-question">?</span>
        </>
      )}
      {skin === "c" && (
        <>
          <small className="focus-number">01—03</small>
          <small className="focus-vertical">FROM FRICTION TO FORM</small>
          <div className="focus-diagram">
            <span>{t(...UIStrings.friction_2)}</span>
            <i />
            <span>{t(...UIStrings.concept)}</span>
          </div>
        </>
      )}
      {skin === "t" && (
        <div className="dev-window">
          <div className="dev-title">
            <span>● ● ●</span> fusion.log
          </div>
          <ol>
            <li>
              <b>01</b> monku <span>→</span> wish
            </li>
            <li>
              <b>02</b> wish <span>→</span> words
            </li>
            <li>
              <b>03</b> words <span>→</span> idea
            </li>
          </ol>
          <small>IDEA → SPEC → BUILD_</small>
        </div>
      )}
    </div>
  );
}
