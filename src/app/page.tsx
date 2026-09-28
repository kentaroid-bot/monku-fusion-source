"use client";
import { UIStrings, formatUI } from "../ui-strings";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserButton, useAuth } from "@clerk/react";
import OptionalClerkProvider, {
  clerkAvailable,
} from "../components/OptionalClerkProvider";
import AccountRetirement from "../components/AccountRetirement";
import ExtensionConnections from "../components/ExtensionConnections";
import { ExtensionStrings as E } from "../extension-strings";
import TrialGuide from "../components/TrialGuide";
import ModeArtwork from "../components/ModeArtwork";
import PreferencesProvider, {
  LanguageSwitch,
  usePreferences,
} from "../components/PreferencesProvider";
import ResultWorkspace from "../components/ResultWorkspace";
import IdeaTags from "../components/IdeaTags";
import {
  skins,
  genreLabels,
  localizeError,
  type Draft,
  type Skin,
} from "../lib-experience";
import {
  genreIds,
  validateGenres,
  type Genre,
} from "../../shared/idea-metadata";
import { clearSession, readSession, saveSession } from "../lib-session";
import { apiRequest } from "../lib-api";
import { getConvexToken } from "../lib-account-auth";
import {
  generateFusion,
  validateInput,
  validateFusion,
  type Fusion,
  type GeneratedFusion,
  type GenerationMode,
  type FusionOptions,
  generationInput,
} from "../../shared/fusion";
type Archive = Fusion & {
  id: string;
  createdAt: number;
  monku?: string;
  liked?: boolean;
  mode?: GenerationMode;
  genres?: Genre[];
};
type Account = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
};
export default function Home() {
  return (
    <PreferencesProvider>
      <HomeAccount />
    </PreferencesProvider>
  );
}
function HomeAccount() {
  if (!clerkAvailable) return <HomeContent />;
  return (
    <OptionalClerkProvider>
      <ClerkHome />
    </OptionalClerkProvider>
  );
}
function ClerkHome() {
  const { isLoaded, isSignedIn, userId, getToken, sessionClaims } = useAuth();
  const audience = sessionClaims?.aud;
  const getAccountToken = useCallback(
    () => getConvexToken(getToken, audience),
    [getToken, audience],
  );
  const account = useMemo(
    () => ({
      isLoaded,
      isSignedIn: !!isSignedIn,
      userId: userId || null,
      getToken: getAccountToken,
    }),
    [isLoaded, isSignedIn, userId, getAccountToken],
  );
  return <HomeContent account={account} />;
}
function HomeContent({ account }: { account?: Account }) {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [key, setKey] = useState("");
  const [byokOpen, setByokOpen] = useState(false);
  const { locale, skin, outputLanguage, update, t, storageWarning } =
    usePreferences();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeId, setActiveId] = useState("");
  const activeDraft = drafts.find((draft) => draft.id === activeId);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveFailed, setArchiveFailed] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("fusion");
  const [archive, setArchive] = useState<Archive[]>([]);
  const [archiveMode, setArchiveMode] = useState<"all" | "liked" | "mine">(
    "all",
  );
  const [archiveGenre, setArchiveGenre] = useState<Genre | "">("");
  const [archiveCursor, setArchiveCursor] = useState("");
  const [archiveDone, setArchiveDone] = useState(true);
  const [accountLinked, setAccountLinked] = useState(false);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);
  const [browserConnectionIssue, setBrowserConnectionIssue] = useState<
    "conflict" | "unverified" | null
  >(null);
  const [accountCheckFailed, setAccountCheckFailed] = useState(false);
  const [accountCheckAttempt, setAccountCheckAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [connectCode, setConnectCode] = useState("");
  const [extensionAccountAccess, setExtensionAccountAccess] = useState(true);

  const keyInput = useRef<HTMLInputElement>(null);
  const focusKey = useRef(false);
  useEffect(() => {
    if (tab === "settings" && byokOpen && focusKey.current) {
      focusKey.current = false;
      keyInput.current?.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
      keyInput.current?.focus({ preventScroll: true });
    }
  }, [tab, byokOpen]);
  const pending = useRef<{ text: string; id: string } | null>(null);
  const archiveRequest = useRef(0);
  const resultContainer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeId)
      resultContainer.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
  }, [activeId]);
  useEffect(() => {
    try {
      setToken(readSession(localStorage));
      if (
        new URLSearchParams(window.location.search).get("view") === "settings"
      )
        setTab("settings");
    } catch {
      setMessage(
        "接続情報を読み出せません。ブラウザの保存設定を確認してください。",
      );
    }
    setReady(true);
  }, []);
  useEffect(() => {
    setCode("");
    if (!ready || !account?.isLoaded || !account.isSignedIn) {
      setAccountLinked(false);
      setCheckedUserId(null);
      setAccountCheckFailed(false);
      setBrowserConnectionIssue(null);
      return;
    }
    let active = true;
    setAccountCheckFailed(false);
    setBrowserConnectionIssue(null);
    (async () => {
      const jwt = await account.getToken();
      if (!jwt) throw new Error("ログイン情報を確認できません。");
      const status = await apiRequest("/api/account/status", undefined, jwt);
      if (token) {
        try {
          const linked = await apiRequest(
            "/api/account/link",
            { anonymousToken: token },
            jwt,
          );
          if (!active) return;
          clearSession(localStorage);
          setToken("");
          setAccountLinked(true);
          setCheckedUserId(account.userId);
          setBalance(linked.balance);
          return;
        } catch (error) {
          if (!status.linked) throw error;
          if (active)
            setBrowserConnectionIssue(
              error instanceof Error &&
                /別の残数|別のアカウントに登録済み/.test(error.message)
                ? "conflict"
                : "unverified",
            );
        }
      }
      if (!active) return;
      setAccountLinked(status.linked);
      setCheckedUserId(account.userId);
      setBalance(status.linked ? status.balance : null);
    })().catch(() => {
      if (active) setAccountCheckFailed(true);
    });
    return () => {
      active = false;
    };
  }, [ready, account, token, accountCheckAttempt]);
  const accountChecked =
    !accountCheckFailed &&
    (!account ||
      (account.isLoaded &&
        (!account.isSignedIn || checkedUserId === account.userId)));
  const walletReady = accountChecked && (!!token || accountLinked);
  function showResult(
    value: GeneratedFusion,
    input: string,
    options: FusionOptions,
  ) {
    const draft: Draft = {
      id: crypto.randomUUID(),
      input,
      result: validateFusion(value),
      genres: validateGenres(value.genres ?? []),
      options,
      createdAt: new Date().toISOString(),
      monku: value.entropyCore,
      publishedId: "",
    };
    setDrafts((previous) => [...previous, draft]);
    setActiveId(draft.id);
  }
  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((previous) =>
      previous.map((draft) =>
        draft.id === id ? { ...draft, ...patch } : draft,
      ),
    );
  }
  async function credential(t = token) {
    if (account?.isSignedIn && accountLinked) {
      const jwt = await account.getToken();
      if (!jwt) throw new Error("ログイン情報を確認できません。");
      return jwt;
    }
    return t;
  }
  async function refresh(t = token) {
    const access = await credential(t);
    if (access)
      setBalance(
        (await apiRequest("/api/incense/balance", undefined, access)).balance,
      );
  }
  useEffect(() => {
    if (token && !accountLinked)
      apiRequest("/api/incense/balance", undefined, token)
        .then((d) => setBalance(d.balance))
        .catch(() => setMessage("接続情報を確認してください。"));
  }, [token, accountLinked]);
  const loadArchive = useCallback(
    async (
      mode: "all" | "liked" | "mine",
      cursor = "",
      genre: Genre | "" = "",
    ) => {
      const request = ++archiveRequest.current;
      setArchiveLoading(true);
      setArchiveFailed(false);
      setArchiveMode(mode);
      setArchiveGenre(genre);
      if (!cursor) {
        setArchive([]);
        setArchiveCursor("");
        setArchiveDone(true);
      }
      try {
        const signedIn = !!account?.isSignedIn;
        const access = signedIn ? (await account.getToken()) || "" : "";
        const params = new URLSearchParams();
        if (cursor) params.set("cursor", cursor);
        if (genre) params.set("genre", genre);
        const path =
          (mode === "mine"
            ? "/api/fusion/mine"
            : mode === "liked"
              ? "/api/fusion/liked"
              : "/api/fusion/list") + (params.size ? `?${params}` : "");
        const data = await apiRequest(path, undefined, access);
        if (request !== archiveRequest.current) return;
        setArchive((previous) =>
          cursor ? [...previous, ...data.items] : data.items,
        );
        setArchiveCursor(data.cursor || "");
        setArchiveDone(data.isDone !== false);
        setArchiveMode(mode);
      } catch (error) {
        if (request !== archiveRequest.current) return;
        setArchiveFailed(true);
        throw error;
      } finally {
        if (request === archiveRequest.current) setArchiveLoading(false);
      }
    },
    [account],
  );
  useEffect(() => {
    if (tab !== "archive" || !ready || (account && !account.isLoaded)) return;
    setArchive([]);
    setArchiveMode("all");
    setArchiveCursor("");
    setArchiveDone(true);
    setMessage("");
    loadArchive("all").catch((error) =>
      setMessage(
        error instanceof Error ? error.message : "アーカイブを表示できません。",
      ),
    );
    return () => {
      // Invalidate all pending requests, including pagination started after this effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- this ref is a request counter, not a DOM node
      archiveRequest.current++;
    };
  }, [tab, ready, account, loadArchive]);
  async function task(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(localizeError(e, locale));
    } finally {
      setBusy(false);
    }
  }
  async function fuse(input = text, revision?: FusionOptions["revision"]) {
    await task(async () => {
      const clean = validateInput(input);
      const options: FusionOptions = {
        mode: skins[skin].mode,
        outputLanguage,
        ...(revision ? { revision } : {}),
      };
      if (key) {
        const safety = await apiRequest(
          "/api/fusion/check-safety",
          { text: clean, options },
          await credential(),
        );
        showResult(
          await generateFusion(
            key,
            safety.sanitizedText,
            undefined,
            safety.options,
          ),
          clean,
          options,
        );
      } else {
        const fingerprint = generationInput(clean, options);
        if (!pending.current || pending.current.text !== fingerprint)
          pending.current = { text: fingerprint, id: crypto.randomUUID() };
        try {
          const data = await apiRequest(
            "/api/fusion/free-trial",
            { noiseText: clean, options, requestId: pending.current.id },
            await credential(),
          );
          showResult(data.result, clean, options);
          pending.current = null;
        } catch (error) {
          if (
            error instanceof Error &&
            !/fetch|network|abort|timeout/i.test(error.message)
          )
            pending.current = null;
          throw error;
        }
      }
      try {
        await refresh();
      } catch {
        setMessage(
          t(...UIStrings.your_result_is_ready_only_the_balance_check_failed),
        );
      }
    });
  }
  async function buy() {
    await task(async () => {
      const data = await apiRequest(
        "/api/incense/create-checkout",
        { requestId: crypto.randomUUID() },
        await credential(),
      );
      const url = new URL(data.url);
      if (url.origin !== "https://checkout.stripe.com")
        throw new Error("決済先が不正です。");
      window.location.assign(url.href);
    });
  }
  const mode = skins[skin];
  const example = t(...UIStrings.long_meetings_leave_me_no_time_to_do_my);
  const cost = key
    ? t(...UIStrings.your_gemini_key_no_uses_deducted_from_your_balance)
    : t(...UIStrings.each_generation_or_revision_deducts_1_use_from_your);
  const balanceText = accountCheckFailed
    ? t(...UIStrings.balance_unavailable)
    : !ready || !accountChecked
      ? t(...UIStrings.checking_login_and_balance)
      : walletReady
        ? t(
            ...formatUI(
              UIStrings.uses_remaining_value,
              [balance ?? "確認中…"],
              [balance ?? "…"],
            ),
          )
        : t(...UIStrings.not_connected_3_free_trials);
  return (
    <main className="shell fusion-ui experience">
      {skin === "t" && (
        <div className="terminal-bar" aria-hidden="true">
          <span className="terminal-dots">
            <i />
            <i />
            <i />
          </span>
          <span>monku-fusion / dev</span>
          <span>{busy ? "working_" : "ready_"}</span>
        </div>
      )}
      <header className="site-header">
        <Link className="brand" href="/">
          Monku <span>Fusion</span>
        </Link>
        <nav aria-label={t(...UIStrings.main_navigation)}>
          <button
            className={tab === "fusion" ? "selected" : ""}
            aria-label={t(...UIStrings.create)}
            aria-current={tab === "fusion" ? "page" : undefined}
            onClick={() => setTab("fusion")}
          >
            {t(...UIStrings.create)}
          </button>
          <button
            className={tab === "archive" ? "selected" : ""}
            aria-label={t(...UIStrings.ideas)}
            aria-current={tab === "archive" ? "page" : undefined}
            onClick={() => setTab("archive")}
          >
            {t(...UIStrings.ideas)}
          </button>
          <button
            className={tab === "settings" ? "selected" : ""}
            aria-label={t(...UIStrings.settings)}
            aria-current={tab === "settings" ? "page" : undefined}
            onClick={() => setTab("settings")}
          >
            {t(...UIStrings.settings)}
          </button>
        </nav>
        <div className="header-tools">
          <LanguageSwitch />
          {account?.isLoaded &&
            (account.isSignedIn ? (
              <UserButton />
            ) : (
              <div className="auth-actions">
                <Link href="/sign-in/">{t(...UIStrings.sign_in)}</Link>
                <Link href="/sign-up/">{t(...UIStrings.sign_up)}</Link>
              </div>
            ))}
        </div>
      </header>
      {message && (
        <p className="notice" role="status">
          {locale !== "ja" && /[ぁ-んァ-ン一-龯]/.test(message)
            ? localizeError(new Error(message), locale)
            : message}
        </p>
      )}
      {browserConnectionIssue === "unverified" && (
        <div className="notice" role="status">
          <p>
            {t(
              ...UIStrings.we_could_not_verify_the_browser_connection_transfer_your,
            )}
          </p>
          <button
            disabled={busy}
            onClick={() => setAccountCheckAttempt((attempt) => attempt + 1)}
          >
            {t(...UIStrings.retry_connection_transfer)}
          </button>
        </div>
      )}
      {storageWarning && (
        <p className="notice" role="status">
          {t(...UIStrings.preferences_could_not_be_saved_in_this_browser_your)}
        </p>
      )}
      {accountCheckFailed && (
        <div className="notice" role="status">
          <p>
            {t(...UIStrings.we_could_not_check_your_login_and_balance_your)}
          </p>
          <button
            onClick={() => setAccountCheckAttempt((attempt) => attempt + 1)}
          >
            {t(...UIStrings.retry_login_and_balance_check)}
          </button>
        </div>
      )}
      {tab === "fusion" && (
        <>
          <section className="hero">
            <div>
              <p className="eyebrow">
                {skin === "b"
                  ? "MONKU LABO / 001"
                  : skin === "t"
                    ? "monku-fusion / session_001"
                    : "MONKU FUSION"}
              </p>
              <h1>
                {
                  mode.title[
                    locale === "ja" ? 0 : locale === "fr" ? 2 : 1
                  ].split("\n")[0]
                }
                <br />
                <em>
                  {
                    mode.title[
                      locale === "ja" ? 0 : locale === "fr" ? 2 : 1
                    ].split("\n")[1]
                  }
                </em>
                {skin === "t" && (
                  <span className="terminal-cursor" aria-hidden="true">
                    _
                  </span>
                )}
              </h1>
              <p className="intro">
                {
                  mode.description[
                    locale === "ja" ? 0 : locale === "fr" ? 2 : 1
                  ]
                }
              </p>
            </div>
            <ModeArtwork />
          </section>
          <section className="box composer">
            <div className="section-line">
              <span>01 / INPUT</span>
              <span>{balanceText}</span>
            </div>
            <h2>
              <label htmlFor="noise">
                {t(...UIStrings.start_with_what_bothers_you)}
              </label>
            </h2>
            <textarea
              id="noise"
              maxLength={4000}
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t(...UIStrings.for_example) + example}
            />
            <div className="input-hint">
              <p>
                {t(
                  ...UIStrings.do_not_enter_real_names_contact_details_or_secrets,
                )}
              </p>
              <span>{text.length} / 4000</span>
            </div>
            <div className="generation-options">
              <label className="mode-select">
                {t(...UIStrings.mode)}
                <select
                  aria-label={t(...UIStrings.mode)}
                  value={skin}
                  disabled={busy}
                  onChange={(e) => update({ skin: e.target.value as Skin })}
                >
                  {(Object.keys(skins) as Skin[]).map((id) => (
                    <option key={id} value={id}>
                      {
                        skins[id].name[
                          locale === "ja" ? 0 : locale === "fr" ? 2 : 1
                        ]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t(...UIStrings.language_of_the_generated_result)}
                <select
                  aria-label={t(...UIStrings.language_of_the_generated_result)}
                  value={outputLanguage}
                  disabled={busy}
                  onChange={(e) =>
                    update({
                      outputLanguage: e.target.value as
                        "auto" | "ja" | "en" | "fr",
                    })
                  }
                >
                  <option value="auto">
                    {t(...UIStrings.same_as_your_input)}
                  </option>
                  <option value="ja">日本語</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </label>
            </div>
            <p className="cost-note">{cost}</p>
            <p className="small">
              {t(...UIStrings.for_trials_purchased_uses_and_your_own_key_input)}{" "}
              <a href="/privacy/">{t(...UIStrings.how_data_is_handled)}</a>
            </p>
            <div className="composer-actions">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  if (
                    !text.trim() ||
                    confirm(
                      t(
                        ...UIStrings.replace_your_current_input_with_the_fictional_example,
                      ),
                    )
                  )
                    setText(example);
                }}
              >
                {t(...UIStrings.use_an_example)}
              </button>
              <button
                className="primary"
                disabled={!walletReady || busy || !text.trim()}
                onClick={() => void fuse()}
              >
                {busy
                  ? t(...UIStrings.working_on_words_and_ideas)
                  : key
                    ? t(...UIStrings.generate_with_my_key)
                    : t(...UIStrings.generate_1_use)}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
            {!walletReady && accountChecked && (
              <p className="small">
                {t(...UIStrings.open_try_3_times_free_below_to_connect_and)}
              </p>
            )}
          </section>
          <ol className="first-steps">
            <li>
              <b>01</b>
              {t(...UIStrings.write_what_bothers_you)}
            </li>
            <li>
              <b>02</b>
              {t(...UIStrings.review_words_and_ideas)}
            </li>
            <li>
              <b>03</b>
              {t(...UIStrings.keep_it_publish_if_you_choose)}
            </li>
          </ol>
          <section
            className="usage-options"
            aria-label={t(...UIStrings.usage_guide)}
          >
            <TrialGuide
              canConnect={ready && accountChecked && !walletReady}
              onToken={setToken}
            />
            <details className="disclosure">
              <summary>{t(...UIStrings.use_your_gemini_key)}</summary>
              <p className="small">
                {t(
                  ...UIStrings.no_purchase_needed_your_balance_is_unchanged_google_s,
                )}
              </p>
              <button
                className="text-button"
                onClick={() => {
                  focusKey.current = true;
                  setByokOpen(true);
                  setTab("settings");
                }}
              >
                {t(...UIStrings.set_up_my_key)}
              </button>
            </details>
            <details className="disclosure">
              <summary>{t(...UIStrings.add_uses)}</summary>
              <p className="small">
                {t(...UIStrings["10_uses_for_100_a_one_time_purchase"])}
              </p>
              <button disabled={!walletReady || busy} onClick={buy}>
                {t(...UIStrings.buy_10_uses_100)}
              </button>
              <button
                className="text-button"
                disabled={!walletReady || busy}
                onClick={() => task(() => refresh())}
              >
                {t(...UIStrings.refresh_balance)}
              </button>
            </details>
          </section>
        </>
      )}
      <div hidden={tab !== "fusion"} ref={resultContainer}>
        {activeDraft && (
          <ResultWorkspace
            key={activeDraft.id}
            draft={activeDraft}
            drafts={drafts}
            busy={busy}
            cost={cost}
            canGenerate={walletReady}
            onSelect={setActiveId}
            onChange={(patch) => updateDraft(activeDraft.id, patch)}
            onGenerate={fuse}
            onMessage={setMessage}
            onPublish={() =>
              task(async () => {
                if (
                  !confirm(
                    t(
                      ...UIStrings.publish_this_context_description_all_seven_displayed_result_fields,
                    ),
                  )
                )
                  return;
                const data = await apiRequest(
                  "/api/fusion/save",
                  {
                    result: activeDraft.result,
                    monku: activeDraft.monku,
                    mode: activeDraft.options.mode,
                    genres: activeDraft.genres ?? [],
                    publishConsent: true,
                  },
                  await credential(),
                );
                updateDraft(activeDraft.id, { publishedId: data.id });
                setMessage(t(...UIStrings.published));
              })
            }
            onWithdraw={() =>
              task(async () => {
                await apiRequest(
                  "/api/fusion/delete",
                  { id: activeDraft.publishedId },
                  await credential(),
                );
                updateDraft(activeDraft.id, { publishedId: "" });
                setMessage(t(...UIStrings.removed_from_the_public_archive));
              })
            }
          />
        )}
      </div>
      {tab === "settings" && (
        <section className="settings-page">
          <p className="eyebrow">PREFERENCES</p>
          <h1>{t(...UIStrings.make_it_yours)}</h1>
          <section className="box">
            <h2>{t(...UIStrings.four_modes)}</h2>
            <p>
              {t(...UIStrings.choose_here_or_below_your_input_in_create_the)}
            </p>
            <div className="skin-grid">
              {(Object.keys(skins) as Skin[]).map((id) => (
                <button
                  type="button"
                  key={id}
                  className={`mode-description skin-${id}`}
                  aria-pressed={skin === id}
                  disabled={busy}
                  onClick={() => update({ skin: id })}
                >
                  <span className="skin-preview" aria-hidden="true">
                    {id === "t"
                      ? "> _"
                      : id === "c"
                        ? "／"
                        : id === "b"
                          ? "? → !"
                          : "○ + □"}
                  </span>
                  <h3>
                    {
                      skins[id].name[
                        locale === "ja" ? 0 : locale === "fr" ? 2 : 1
                      ]
                    }
                    {id === "a15" && <small>{t(...UIStrings.default)}</small>}
                  </h3>
                  <p className="mode-purpose">
                    {
                      skins[id].purpose[
                        locale === "ja" ? 0 : locale === "fr" ? 2 : 1
                      ]
                    }
                  </p>
                  <p>
                    {
                      skins[id].description[
                        locale === "ja" ? 0 : locale === "fr" ? 2 : 1
                      ]
                    }
                  </p>
                  <span className="skin-selection">
                    {skin === id
                      ? t(...UIStrings.selected)
                      : t(...UIStrings.choose_this_mode)}
                  </span>
                </button>
              ))}
            </div>
            <p className="small">
              {t(
                ...UIStrings.interface_language_skin_and_output_language_are_saved_in,
              )}
            </p>
          </section>
          <section className="box">
            <h2>{t(...UIStrings.account_and_balance)}</h2>
            <p>{balanceText}</p>
            <p>
              {t(
                ...UIStrings.sign_in_to_recover_your_purchased_balance_in_another,
              )}
            </p>
            {account?.isLoaded && !account.isSignedIn && (
              <div className="auth-actions">
                <Link className="button-link" href="/sign-in/">
                  {t(...UIStrings.sign_in)}
                </Link>
                <Link className="button-link" href="/sign-up/">
                  {t(...UIStrings.sign_up)}
                </Link>
              </div>
            )}
            {account?.isSignedIn && (
              <p>
                {accountLinked
                  ? t(...UIStrings.your_balance_is_linked_to_this_account)
                  : t(...UIStrings.please_check_your_current_connection)}
              </p>
            )}
            {browserConnectionIssue === "conflict" && (
              <details>
                <summary>{t(...UIStrings.other_saved_connection)}</summary>
                <p>
                  {t(
                    ...UIStrings.another_connection_remains_in_this_browser_you_are_using,
                  )}
                </p>
              </details>
            )}
            {ready && accountChecked && !walletReady && (
              <TrialGuide canConnect onToken={setToken} />
            )}
          </section>
          {account?.isSignedIn && (
            <AccountRetirement
              key={account.userId}
              accountId={account.userId!}
              balance={accountLinked ? balance : accountChecked ? 0 : null}
              getToken={account.getToken}
              onComplete={() => {
                setKey("");
                setText("");
                setDrafts([]);
                setBalance(0);
                setCode("");
                // An unrelated anonymous wallet must stay intact. Linked credentials
                // were already removed when linked and are revoked by the server.
              }}
            />
          )}
          <details
            className="box byok-settings"
            open={byokOpen}
            onToggle={(event) => setByokOpen(event.currentTarget.open)}
          >
            <summary>{t(...UIStrings.use_your_own_gemini_api_key)}</summary>
            <p>
              {t(
                ...UIStrings.your_balance_is_unchanged_and_no_purchase_is_needed,
              )}
            </p>
            <p>{t(...UIStrings.on_the_web_your_key_stays_only_in_page)}</p>
            <label>
              {t(...UIStrings.api_key)}
              <input
                ref={keyInput}
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button onClick={() => setKey("")}>
              {t(...UIStrings.clear_key)}
            </button>
            <button onClick={() => setTab("fusion")}>
              {t(...UIStrings.back_to_your_input)}
            </button>
          </details>
          <details className="box">
            <summary>
              {t(...UIStrings.connect_another_browser_or_the_extension)}
            </summary>
            <p>
              {t(...UIStrings.codes_last_10_minutes_and_work_once_anyone_with)}
            </p>
            {accountLinked && (
              <>
                <label className="consent-label">
                  <input
                    type="checkbox"
                    checked={extensionAccountAccess}
                    onChange={(event) => {
                      setExtensionAccountAccess(event.target.checked);
                      setCode("");
                    }}
                  />
                  {t(...E.accountAccess)}
                </label>
                {extensionAccountAccess && <p>{t(...E.accountHelp)}</p>}
              </>
            )}
            <button
              disabled={!walletReady || busy}
              onClick={() =>
                task(async () =>
                  setCode(
                    (
                      await apiRequest(
                        "/api/session/pair",
                        {
                          accountAccess:
                            accountLinked && extensionAccountAccess,
                        },
                        await credential(),
                      )
                    ).code,
                  ),
                )
              }
            >
              {accountLinked && extensionAccountAccess
                ? t(...E.accountCode)
                : t(...UIStrings.create_connection_code)}
            </button>
            {code && (
              <>
                <output className="code">{code}</output>
                <button
                  onClick={() =>
                    task(async () => {
                      await navigator.clipboard.writeText(code);
                      setMessage(t(...UIStrings.code_copied));
                    })
                  }
                >
                  {t(...UIStrings.copy_code)}
                </button>
              </>
            )}
            {accountLinked && account?.isSignedIn && (
              <ExtensionConnections
                key={account.userId}
                getToken={account.getToken}
                onMessage={setMessage}
              />
            )}
            <label>
              {t(...UIStrings.code_from_another_device)}
              <input
                type="password"
                value={connectCode}
                onChange={(e) => setConnectCode(e.target.value)}
                autoComplete="off"
              />
            </label>
            {account?.isSignedIn && (
              <p className="small">
                {t(
                  ...UIStrings.sign_out_before_switching_to_another_connection_code,
                )}
              </p>
            )}
            <button
              disabled={busy || !connectCode || !!account?.isSignedIn}
              onClick={() =>
                task(async () => {
                  if (
                    token &&
                    !confirm(
                      t(
                        ...UIStrings.switch_the_current_connection_have_you_kept_access_to,
                      ),
                    )
                  )
                    return;
                  const data = await apiRequest("/api/session/redeem", {
                    code: connectCode.trim(),
                  });
                  saveSession(localStorage, data.token);
                  setBalance(null);
                  setToken(data.token);
                  setAccountLinked(false);
                  setConnectCode("");
                  setMessage(t(...UIStrings.connected));
                })
              }
            >
              {t(...UIStrings.connect)}
            </button>
          </details>
        </section>
      )}
      {tab === "archive" && (
        <section className="archive-page">
          <p className="eyebrow">PUBLIC IDEAS</p>
          <h1>{t(...UIStrings.someone_s_frustration_your_next_inspiration)}</h1>
          <p>
            {t(
              ...UIStrings.these_are_publisher_reviewed_descriptions_and_ai_generated_suggestions,
            )}
          </p>
          {account?.isLoaded && account.isSignedIn ? (
            <div
              className="archive-switch"
              role="group"
              aria-label={t(...UIStrings.archive_view)}
            >
              {(["all", "liked", "mine"] as const).map((view) => (
                <button
                  key={view}
                  className={archiveMode === view ? "selected" : ""}
                  disabled={busy || archiveLoading}
                  onClick={() =>
                    task(() => loadArchive(view, "", archiveGenre))
                  }
                >
                  {view === "all"
                    ? t(...UIStrings.all_ideas)
                    : view === "liked"
                      ? t(...UIStrings.my_likes)
                      : t(...UIStrings.my_posts)}
                </button>
              ))}
            </div>
          ) : (
            <p className="small">
              {t(...UIStrings.showing_the_latest_5_sign_in_to_browse_all)}
            </p>
          )}
          <label className="archive-genre-filter">
            {t(...UIStrings.filter_by_genre)}
            <select
              value={archiveGenre}
              aria-label={t(...UIStrings.filter_by_genre)}
              disabled={busy}
              onChange={(event) => {
                void loadArchive(
                  archiveMode,
                  "",
                  event.target.value as Genre | "",
                ).catch((error) => setMessage(localizeError(error, locale)));
              }}
            >
              <option value="">{t(...UIStrings.all_genres)}</option>
              {genreIds.map((genre) => (
                <option key={genre} value={genre}>
                  {
                    genreLabels[genre][
                      locale === "ja" ? 0 : locale === "fr" ? 2 : 1
                    ]
                  }
                </option>
              ))}
            </select>
          </label>
          {!account?.isSignedIn && archiveGenre && (
            <p className="small">
              {t(
                ...UIStrings.filtering_within_the_latest_five_sign_in_to_search,
              )}
            </p>
          )}
          {archiveLoading && (
            <p role="status">{t(...UIStrings.loading_ideas)}</p>
          )}
          {archiveFailed && (
            <button
              disabled={archiveLoading}
              onClick={() =>
                task(() => loadArchive(archiveMode, "", archiveGenre))
              }
            >
              {t(...UIStrings.retry_loading_ideas)}
            </button>
          )}
          {!archiveLoading && !archiveFailed && archive.length === 0 && (
            <p>
              {!archiveDone
                ? t(...UIStrings.no_matches_so_far_select_load_more_to_continue)
                : archiveGenre
                  ? t(...UIStrings.no_ideas_match_this_genre)
                  : archiveMode === "liked"
                    ? t(...UIStrings.you_have_not_liked_any_ideas_yet)
                    : t(...UIStrings.no_ideas_have_been_published_yet)}
            </p>
          )}
          {archive.map((item) => (
            <article className="archive-item" key={item.id}>
              <p className="small">
                {new Date(item.createdAt).toLocaleDateString(
                  locale === "ja"
                    ? "ja-JP"
                    : locale === "fr"
                      ? "fr-FR"
                      : "en-US",
                )}{" "}
                · CC0
              </p>
              <h2>{item.ideaTitle}</h2>
              <IdeaTags mode={item.mode} genres={item.genres} />
              <p className="archive-preview">{item.ideaConcept}</p>
              <details>
                <summary>
                  {t(...UIStrings.read_the_context_and_full_result)}
                </summary>
                <h3>
                  {item.monku
                    ? t(...UIStrings.context_reviewed_by_the_publisher)
                    : t(...UIStrings.inferred_wish_ai_hypothesis_at_generation)}
                </h3>
                <p>{item.monku ?? item.entropyCore}</p>
                {item.monku && (
                  <p className="small">
                    {t(
                      ...UIStrings.the_publisher_could_review_and_edit_this_description_it,
                    )}
                  </p>
                )}
                <blockquote>{item.pacifyReply}</blockquote>
                <p>{item.entropyCore}</p>
                <p>{item.finiteOpposites}</p>
                <p>{item.infiniteCaption}</p>
                <p>{item.ideaConcept}</p>
                <p>{item.ideaReason}</p>
              </details>
              {archiveMode === "mine" && account?.isSignedIn && (
                <button
                  disabled={busy}
                  onClick={() =>
                    task(async () => {
                      if (
                        !confirm(
                          t(
                            ...UIStrings.withdraw_this_idea_copies_made_elsewhere_cannot_be_removed,
                          ),
                        )
                      )
                        return;
                      await apiRequest(
                        "/api/fusion/delete",
                        { id: item.id },
                        await credential(),
                      );
                      setArchive((previous) =>
                        previous.filter((entry) => entry.id !== item.id),
                      );
                      setDrafts((previous) =>
                        previous.map((draft) =>
                          draft.publishedId === item.id
                            ? { ...draft, publishedId: "" }
                            : draft,
                        ),
                      );
                      setMessage(
                        t(...UIStrings.removed_from_the_public_archive),
                      );
                    })
                  }
                >
                  {t(...UIStrings.withdraw_publication)}
                </button>
              )}
              {account?.isSignedIn && (
                <button
                  disabled={busy}
                  aria-pressed={!!item.liked}
                  onClick={() =>
                    task(async () => {
                      const jwt = await account.getToken();
                      if (!jwt)
                        throw new Error("ログイン情報を確認できません。");
                      const liked = !item.liked;
                      await apiRequest(
                        "/api/fusion/like",
                        { id: item.id, liked },
                        jwt,
                      );
                      setArchive((previous) =>
                        archiveMode === "liked" && !liked
                          ? previous.filter((entry) => entry.id !== item.id)
                          : previous.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, liked }
                                : entry,
                            ),
                      );
                    })
                  }
                >
                  {item.liked ? t(...UIStrings.liked) : t(...UIStrings.like)}
                </button>
              )}
            </article>
          ))}
          {account?.isSignedIn && !archiveDone && (
            <button
              disabled={busy || archiveLoading}
              onClick={() =>
                task(() =>
                  loadArchive(archiveMode, archiveCursor, archiveGenre),
                )
              }
            >
              {t(...UIStrings.load_more)}
            </button>
          )}
        </section>
      )}
      <footer>
        <a href="/privacy/">{t(...UIStrings.privacy)}</a> ·{" "}
        <a href="/terms/">{t(...UIStrings.terms)}</a> ·{" "}
        <a href="/commerce/">{t(...UIStrings.commercial_disclosure)}</a> ·{" "}
        <a href="https://monku.ai/contact/">{t(...UIStrings.contact)}</a>
        <p>
          <a
            href="https://chromewebstore.google.com/detail/monku-fusion/hkjpofbcbbbnphpbegemjcimdceeeihb"
            target="_blank"
            rel="noreferrer"
          >
            {t(...UIStrings.get_the_chrome_extension)}
          </a>
        </p>
        <p>{t(...UIStrings.version_0_2_0_is_public_0_2_1)}</p>
        <p>
          {t(
            ...UIStrings.these_are_ai_suggestions_check_that_they_respect_your,
          )}
        </p>
      </footer>
    </main>
  );
}
