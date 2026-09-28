"use client";
import {
  UIStrings,
  translate,
  type LocalizedText,
  type Locale,
} from "../ui-strings";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { defaultPreferences, skins, type Preferences } from "../lib-experience";
const STORAGE = "fusion_preferences";
export type PreferenceStorage = {
  read: () => Promise<Partial<Preferences>>;
  write: (value: Preferences) => Promise<void>;
};
type Context = Preferences & {
  update: (patch: Partial<Preferences>) => void;
  t: (...text: LocalizedText) => string;
  storageWarning: boolean;
};
const PreferencesContext = createContext<Context>({
  ...defaultPreferences,
  update: () => {},
  t: (ja) => ja,
  storageWarning: false,
});
export function usePreferences() {
  return useContext(PreferencesContext);
}
export default function PreferencesProvider({
  children,
  storage,
}: {
  children: React.ReactNode;
  storage?: PreferenceStorage;
}) {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      let saved: Partial<Preferences> = {};
      try {
        saved = storage
          ? await storage.read()
          : JSON.parse(localStorage.getItem(STORAGE) || "{}") || {};
      } catch {
        // Browser-only storage is read after hydration; the server uses stable defaults.
        if (active) setStorageWarning(true);
      }
      if (!active) return;
      setPreferences({
        locale:
          saved.locale === "ja" ||
          saved.locale === "en" ||
          saved.locale === "fr"
            ? saved.locale
            : navigator.language.toLowerCase().startsWith("ja")
              ? "ja"
              : navigator.language.toLowerCase().startsWith("fr")
                ? "fr"
                : "en",
        skin:
          saved.skin && Object.hasOwn(skins, saved.skin) ? saved.skin : "a15",
        outputLanguage:
          saved.outputLanguage === "ja" ||
          saved.outputLanguage === "en" ||
          saved.outputLanguage === "fr"
            ? saved.outputLanguage
            : "auto",
      });
    })();
    return () => {
      active = false;
    };
  }, [storage]);
  useEffect(() => {
    document.documentElement.lang = preferences.locale;
    document.documentElement.dataset.skin = preferences.skin;
  }, [preferences]);
  const t = useCallback(
    (...text: LocalizedText) => translate(preferences.locale, text),
    [preferences.locale],
  );
  function update(patch: Partial<Preferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    if (storage) {
      void storage
        .write(next)
        .then(() => setStorageWarning(false))
        .catch(() => setStorageWarning(true));
      return;
    }
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  }
  return (
    <PreferencesContext.Provider
      value={{
        ...preferences,
        update,
        storageWarning,
        t,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}
export function LanguageSwitch() {
  const { locale, update, t } = usePreferences();
  return (
    <label className="language-switch">
      <span className="sr-only">{t(...UIStrings.interface_language)}</span>
      <select
        aria-label={t(...UIStrings.interface_language)}
        value={locale}
        onChange={(e) => update({ locale: e.target.value as Locale })}
      >
        <option value="ja">日本語</option>
        <option value="en">English</option>
        <option value="fr">Français</option>
      </select>
    </label>
  );
}
