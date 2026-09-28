import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useRef, useState } from "react";
import PreferencesProvider, {
  LanguageSwitch,
  usePreferences,
} from "../src/components/PreferencesProvider";
import ResultWorkspace from "../src/components/ResultWorkspace";
import ModeArtwork from "../src/components/ModeArtwork";
import IdeaTags from "../src/components/IdeaTags";
import { UIStrings as U, formatUI } from "../src/ui-strings";
import { ExtensionStrings as E } from "../src/extension-strings";
import {
  skins,
  genreLabels,
  localizeError,
  type Skin,
  type Draft,
} from "../src/lib-experience";
import {
  generateFusion,
  generationInput,
  validateInput,
  validateFusion,
  fields,
  type Fusion,
  type FusionOptions,
  type GenerationMode,
  type OutputLanguage,
} from "../shared/fusion";
import { genreIds, validateGenres, type Genre } from "../shared/idea-metadata";
import {
  request,
  checkConnection,
  openWeb,
  preferenceStorage,
  type Connection,
} from "./platform";

type Idea = Fusion & {
  id: string;
  createdAt: number;
  monku?: string;
  mode?: GenerationMode;
  genres?: Genre[];
  liked?: boolean;
};
type ArchiveMode = "all" | "liked" | "mine";
const disconnected: Connection = {
  connected: false,
  accountLinked: false,
  expired: false,
};

function ExtensionApp() {
  const { locale, skin, outputLanguage, update, t, storageWarning } =
    usePreferences();
  const choice = locale === "ja" ? 0 : locale === "fr" ? 2 : 1;
  const [tab, setTab] = useState<"create" | "ideas" | "settings">("create");
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [code, setCode] = useState("");
  const [ready, setReady] = useState(false);
  const [connection, setConnection] = useState<Connection>(disconnected);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [text, setText] = useState("");
  const [selection, setSelection] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeId, setActiveId] = useState("");
  const activeDraft = drafts.find((draft) => draft.id === activeId);
  const pending = useRef<{ text: string; id: string } | null>(null);
  const [archive, setArchive] = useState<Idea[]>([]);
  const [archiveMode, setArchiveMode] = useState<ArchiveMode>("all");
  const [genre, setGenre] = useState<Genre | "">("");
  const [cursor, setCursor] = useState("");
  const [done, setDone] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveFailed, setArchiveFailed] = useState(false);
  const archiveRequest = useRef(0);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const [keyOpen, setKeyOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      await chrome.storage.local.setAccessLevel({
        accessLevel: "TRUSTED_CONTEXTS",
      });
      await chrome.storage.local.remove([
        "lastSelectedText",
        "lastSelectedTime",
        "freeTrialRemaining",
        "userId",
      ]);
      const saved = await chrome.storage.local.get([
        "fusionToken",
        "geminiApiKey",
      ]);
      const selected = await chrome.storage.session.get(["lastSelectedText"]);
      await chrome.storage.session.remove([
        "lastSelectedText",
        "lastSelectedTime",
      ]);
      if (!active) return;
      const savedToken =
        typeof saved.fusionToken === "string" ? saved.fusionToken : "";
      const savedKey =
        typeof saved.geminiApiKey === "string" ? saved.geminiApiKey : "";
      setToken(savedToken);
      setApiKey(savedKey);
      setKeyInput(savedKey);
      if (typeof selected.lastSelectedText === "string")
        setText(selected.lastSelectedText.slice(0, 4000));
      try {
        const state = await checkConnection(savedToken);
        if (active) setConnection(state);
      } catch {
        if (active) setConnectionFailed(true);
      }
      if (active) setReady(true);
    })().catch(() => {
      if (active) {
        setReady(true);
        setConnectionFailed(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const receive = (incoming: { type?: string; text?: unknown }) => {
      if (
        incoming.type !== "FUSION_TARGET_RECEIVED" ||
        typeof incoming.text !== "string"
      )
        return;
      setSelection(incoming.text.slice(0, 4000));
      setTab("create");
      void chrome.storage.session.remove([
        "lastSelectedText",
        "lastSelectedTime",
      ]);
    };
    chrome.runtime.onMessage.addListener(receive);
    return () => chrome.runtime.onMessage.removeListener(receive);
  }, []);
  useEffect(() => {
    if (activeId) resultsRef.current?.scrollIntoView({ block: "start" });
  }, [activeId]);
  useEffect(() => {
    if (tab === "settings" && keyOpen) keyRef.current?.focus();
  }, [tab, keyOpen]);
  const refresh = useCallback(async () => {
    try {
      setConnection(await checkConnection(token));
      setConnectionFailed(false);
    } catch (error) {
      setConnectionFailed(true);
      throw error;
    }
  }, [token]);
  useEffect(() => {
    const focus = () => {
      if (ready && token && !busyRef.current) void refresh().catch(() => {});
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [ready, token, refresh]);
  async function task(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(localizeError(error, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const loadArchive = useCallback(
    async (mode: ArchiveMode, filter: Genre | "", next = "") => {
      const requestId = ++archiveRequest.current;
      setArchiveLoading(true);
      setArchiveFailed(false);
      if (!next) {
        setArchive([]);
        setCursor("");
        setDone(true);
      }
      try {
        const params = new URLSearchParams();
        if (filter) params.set("genre", filter);
        if (next) params.set("cursor", next);
        const path = mode === "all" ? "list" : mode;
        const result = await request(`/api/fusion/${path}?${params}`, token);
        if (requestId !== archiveRequest.current) return;
        setArchive((previous) =>
          next
            ? [
                ...previous,
                ...result.items.filter(
                  (item: Idea) => !previous.some((old) => old.id === item.id),
                ),
              ]
            : result.items,
        );
        setCursor(result.cursor || "");
        setDone(result.isDone !== false);
      } catch (error) {
        if (requestId === archiveRequest.current) {
          setArchiveFailed(true);
          setMessage(localizeError(error, locale));
        }
      } finally {
        if (requestId === archiveRequest.current) setArchiveLoading(false);
      }
    },
    [token, locale],
  );
  useEffect(() => {
    if (!ready || tab !== "ideas") return;
    void loadArchive(connection.accountLinked ? archiveMode : "all", genre);
    return () => {
      // This is a request counter; invalidate pagination started after this effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      archiveRequest.current++;
    };
  }, [ready, tab, archiveMode, genre, connection.accountLinked, loadArchive]);
  const canGenerate = ready && connection.connected && !connectionFailed;
  const cost = apiKey
    ? t(...U.your_gemini_key_no_uses_deducted_from_your_balance)
    : t(...U.each_generation_or_revision_deducts_1_use_from_your);
  async function fuse(input = text, revision?: FusionOptions["revision"]) {
    await task(async () => {
      if (!canGenerate) throw new Error(t(...E.connectionNeeded));
      const clean = validateInput(input);
      const options: FusionOptions = {
        mode: skins[skin].mode,
        outputLanguage,
        ...(revision ? { revision } : {}),
      };
      let result;
      if (apiKey) {
        const safety = await request("/api/fusion/check-safety", token, {
          text: clean,
          options,
        });
        result = await generateFusion(
          apiKey,
          safety.sanitizedText,
          undefined,
          safety.options,
        );
      } else {
        const fingerprint = generationInput(clean, options);
        if (!pending.current || pending.current.text !== fingerprint)
          pending.current = { text: fingerprint, id: crypto.randomUUID() };
        try {
          result = (
            await request("/api/fusion/free-trial", token, {
              noiseText: clean,
              options,
              requestId: pending.current.id,
            })
          ).result;
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
      const validated = validateFusion(result);
      const draft: Draft = {
        id: crypto.randomUUID(),
        input: clean,
        result: validated,
        genres: validateGenres(result.genres ?? []),
        options,
        createdAt: new Date().toISOString(),
        monku: validated.entropyCore,
        publishedId: "",
      };
      setDrafts((previous) => [...previous, draft]);
      setActiveId(draft.id);
      try {
        await refresh();
      } catch {
        setMessage(t(...U.your_result_is_ready_only_the_balance_check_failed));
      }
    });
  }
  function changeDraft(patch: Partial<Draft>) {
    setDrafts((previous) =>
      previous.map((draft) =>
        draft.id === activeId ? { ...draft, ...patch } : draft,
      ),
    );
  }
  async function withdraw(id: string) {
    if (
      !confirm(
        t(...U.withdraw_this_idea_copies_made_elsewhere_cannot_be_removed),
      )
    )
      return;
    await request("/api/fusion/delete", token, { id });
    setArchive((previous) => previous.filter((item) => item.id !== id));
    setDrafts((previous) =>
      previous.map((draft) =>
        draft.publishedId === id ? { ...draft, publishedId: "" } : draft,
      ),
    );
    setMessage(t(...U.removed_from_the_public_archive));
  }
  const balanceLabel = !ready
    ? t(...E.loading)
    : connectionFailed
      ? t(...U.balance_unavailable)
      : connection.connected
        ? t(...formatUI(U.uses_remaining_value, [connection.balance ?? 0]))
        : t(...E.connectionNeeded);
  const mode = skins[skin];
  return (
    <main className="shell fusion-ui experience extension-ui">
      {skin === "t" && (
        <div className="terminal-bar">
          monku-fusion / sidepanel <span>{busy ? "working_" : "ready_"}</span>
        </div>
      )}
      <header className="site-header">
        <a
          className="brand"
          href="https://fusion.monku.ai/"
          target="_blank"
          rel="noreferrer"
        >
          Monku <span>Fusion</span>
        </a>
        <LanguageSwitch />
        <nav aria-label={t(...U.main_navigation)}>
          {(["create", "ideas", "settings"] as const).map((id) => (
            <button
              key={id}
              aria-label={t(...U[id])}
              className={tab === id ? "selected" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              {t(...U[id])}
            </button>
          ))}
        </nav>
      </header>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {storageWarning && (
        <p role="status" className="notice">
          {t(...U.preferences_could_not_be_saved_in_this_browser_your)}
        </p>
      )}
      {connectionFailed && (
        <div className="notice">
          <p>{t(...E.unknown)}</p>
          <button disabled={busy} onClick={() => void task(refresh)}>
            {t(...E.refresh)}
          </button>
        </div>
      )}
      {connection.expired && (
        <div className="notice">
          <p>{t(...E.connectionExpired)}</p>
          <button onClick={() => setTab("settings")}>{t(...U.settings)}</button>
        </div>
      )}
      {tab === "create" && (
        <>
          <section className="hero">
            <div>
              <p className="eyebrow">{mode.name[choice]}</p>
              <h1>
                {mode.title[choice].split("\n")[0]}
                <br />
                <em>{mode.title[choice].split("\n")[1]}</em>
              </h1>
              <p className="intro">{mode.description[choice]}</p>
            </div>
            <ModeArtwork />
          </section>
          {selection && (
            <div className="notice">
              <p>{t(...E.selectedText)}</p>
              <div className="button-row">
                <button
                  disabled={busy}
                  onClick={() => {
                    setText(selection);
                    setSelection("");
                    textRef.current?.focus();
                  }}
                >
                  {t(...E.useSelection)}
                </button>
                <button onClick={() => setSelection("")}>
                  {t(...E.keepInput)}
                </button>
              </div>
            </div>
          )}
          <section className="box composer">
            <h2>
              <label htmlFor="noise">
                {t(...U.start_with_what_bothers_you)}
              </label>
            </h2>
            <textarea
              ref={textRef}
              id="noise"
              maxLength={4000}
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t(...U.long_meetings_leave_me_no_time_to_do_my)}
            />
            <p className="small">
              {t(...U.do_not_enter_real_names_contact_details_or_secrets)}
            </p>
            <div className="mode-controls">
              <label>
                {t(...U.mode)}
                <select
                  aria-label={t(...U.mode)}
                  value={skin}
                  onChange={(event) =>
                    update({ skin: event.target.value as Skin })
                  }
                >
                  {Object.entries(skins).map(([id, value]) => (
                    <option key={id} value={id}>
                      {value.name[choice]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t(...U.language_of_the_generated_result)}
                <select
                  aria-label={t(...U.language_of_the_generated_result)}
                  value={outputLanguage}
                  onChange={(event) =>
                    update({
                      outputLanguage: event.target.value as OutputLanguage,
                    })
                  }
                >
                  <option value="auto">{t(...U.same_as_your_input)}</option>
                  <option value="ja">日本語</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </label>
            </div>
            <p className="small">{cost}</p>
            <div className="composer-actions">
              <button
                className="primary"
                disabled={busy || !canGenerate || !text.trim()}
                onClick={() => void fuse()}
              >
                {busy ? t(...U.reworking) : t(...U.create)}
              </button>
            </div>
            <p className="balance">{balanceLabel}</p>
            {!connection.connected && (
              <button onClick={() => setTab("settings")}>
                {t(...E.connect)}
              </button>
            )}
          </section>
          {!connection.connected && (
            <details className="box">
              <summary>{t(...U.not_connected_3_free_trials)}</summary>
              <p>{t(...E.connectionHelp)}</p>
              <button
                onClick={() =>
                  void task(async () => {
                    await openWeb();
                  })
                }
              >
                {t(...E.web)}
              </button>
            </details>
          )}
          <details className="box">
            <summary>{t(...U.use_your_own_gemini_api_key)}</summary>
            <p>{t(...E.keyStorage)}</p>
            <button
              onClick={() => {
                setKeyOpen(true);
                setTab("settings");
              }}
            >
              {t(...U.settings)}
            </button>
          </details>
          <details className="box">
            <summary>{t(...U.add_uses)}</summary>
            <p>{t(...U.each_generation_or_revision_deducts_1_use_from_your)}</p>
            <button
              disabled={!canGenerate || busy}
              onClick={() =>
                void task(async () => {
                  const data = await request(
                    "/api/incense/create-checkout",
                    token,
                    { requestId: crypto.randomUUID() },
                  );
                  const url = new URL(data.url);
                  if (url.origin !== "https://checkout.stripe.com")
                    throw new Error("決済先が不正です。");
                  await chrome.tabs.create({ url: url.href });
                })
              }
            >
              {t(...U.buy_10_uses_100)}
            </button>
          </details>
          <div ref={resultsRef}>
            {activeDraft && (
              <ResultWorkspace
                draft={activeDraft}
                drafts={drafts}
                busy={busy}
                cost={cost}
                canGenerate={canGenerate}
                onSelect={setActiveId}
                onChange={changeDraft}
                onGenerate={fuse}
                onMessage={setMessage}
                onPublish={() =>
                  task(async () => {
                    if (
                      !confirm(
                        t(
                          ...U.publish_this_context_description_all_seven_displayed_result_fields,
                        ),
                      )
                    )
                      return;
                    const { id } = await request("/api/fusion/save", token, {
                      result: activeDraft.result,
                      monku: validateInput(activeDraft.monku),
                      mode: activeDraft.options.mode,
                      genres: activeDraft.genres,
                      publishConsent: true,
                    });
                    changeDraft({ publishedId: id });
                    setMessage(t(...U.published));
                  })
                }
                onWithdraw={() => task(() => withdraw(activeDraft.publishedId))}
              />
            )}
          </div>
        </>
      )}
      {tab === "ideas" && (
        <section aria-label={t(...U.ideas)}>
          <h1>{t(...U.ideas)}</h1>
          {connection.accountLinked ? (
            <div className="archive-switch">
              {(["all", "liked", "mine"] as const).map((id) => (
                <button
                  key={id}
                  className={archiveMode === id ? "selected" : ""}
                  onClick={() => setArchiveMode(id)}
                >
                  {t(
                    ...(id === "all"
                      ? U.all_ideas
                      : id === "liked"
                        ? U.my_likes
                        : U.my_posts),
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <p className="small">{t(...E.archiveNeedsAccount)}</p>
              <button onClick={() => setTab("settings")}>
                {t(...U.settings)}
              </button>
            </div>
          )}
          <label>
            {t(...U.filter_by_genre)}
            <select
              value={genre}
              onChange={(event) => setGenre(event.target.value as Genre | "")}
            >
              <option value="">{t(...U.all_genres)}</option>
              {genreIds.map((id) => (
                <option key={id} value={id}>
                  {genreLabels[id][choice]}
                </option>
              ))}
            </select>
          </label>
          {archiveLoading && <p role="status">{t(...U.loading_ideas)}</p>}
          {archiveFailed && (
            <button
              disabled={archiveLoading}
              onClick={() =>
                void loadArchive(
                  connection.accountLinked ? archiveMode : "all",
                  genre,
                  cursor,
                )
              }
            >
              {t(...U.retry_loading_ideas)}
            </button>
          )}
          {!archiveLoading && !archiveFailed && !archive.length && (
            <p>
              {t(
                ...(!done
                  ? U.no_matches_so_far_select_load_more_to_continue
                  : archiveMode === "liked"
                    ? U.you_have_not_liked_any_ideas_yet
                    : U.no_ideas_have_been_published_yet),
              )}
            </p>
          )}
          {archive.map((item) => (
            <article className="archive-item" key={item.id}>
              <p className="small">
                {new Date(item.createdAt).toLocaleDateString(locale)} · CC0
              </p>
              <h2>{item.ideaTitle}</h2>
              <IdeaTags mode={item.mode} genres={item.genres} />
              <p className="archive-preview">{item.ideaConcept}</p>
              <details>
                <summary>{t(...U.read_the_context_and_full_result)}</summary>
                <h3>
                  {t(
                    ...(item.monku
                      ? U.context_reviewed_by_the_publisher
                      : U.inferred_wish_ai_hypothesis_at_generation),
                  )}
                </h3>
                <p>{item.monku ?? item.entropyCore}</p>
                {fields.map((field) => (
                  <p key={field}>{item[field]}</p>
                ))}
              </details>
              {connection.accountLinked && (
                <button
                  disabled={busy}
                  aria-pressed={!!item.liked}
                  onClick={() =>
                    void task(async () => {
                      await request("/api/fusion/like", token, {
                        id: item.id,
                        liked: !item.liked,
                      });
                      setArchive((previous) =>
                        archiveMode === "liked" && item.liked
                          ? previous.filter((entry) => entry.id !== item.id)
                          : previous.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, liked: !item.liked }
                                : entry,
                            ),
                      );
                    })
                  }
                >
                  {t(...(item.liked ? U.liked : U.like))}
                </button>
              )}
              {connection.accountLinked && archiveMode === "mine" && (
                <button
                  disabled={busy}
                  onClick={() => void task(() => withdraw(item.id))}
                >
                  {t(...U.withdraw_publication)}
                </button>
              )}
            </article>
          ))}
          {!done && !archiveFailed && (
            <button
              disabled={archiveLoading}
              onClick={() => void loadArchive(archiveMode, genre, cursor)}
            >
              {t(...U.load_more)}
            </button>
          )}
        </section>
      )}
      {tab === "settings" && (
        <>
          <section className="box">
            <h2>{t(...E.connect)}</h2>
            <p>{balanceLabel}</p>
            {connection.accountLinked ? (
              <p>
                {t(...E.connectedAccount)}
                <br />
                {t(...E.expires)}:{" "}
                {new Date(connection.expiresAt!).toLocaleDateString(locale)}
              </p>
            ) : (
              connection.connected && <p>{t(...E.walletOnly)}</p>
            )}
            <p>{t(...E.connectionHelp)}</p>
            <div className="button-row">
              <button
                onClick={() =>
                  void task(async () => {
                    await openWeb();
                  })
                }
              >
                {t(...E.web)}
              </button>
              <button
                disabled={busy || !token}
                onClick={() => void task(refresh)}
              >
                {t(...E.refresh)}
              </button>
            </div>
            <label htmlFor="pair-code">{t(...E.code)}</label>
            <input
              id="pair-code"
              type="password"
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <button
              disabled={busy || !code.trim()}
              onClick={() =>
                void task(async () => {
                  if (token && !confirm(t(...E.switchConfirm))) return;
                  const data = await request("/api/session/redeem", "", {
                    code: code.trim(),
                  });
                  if (
                    typeof data.token !== "string" ||
                    !/^[a-f0-9]{64}$/.test(data.token)
                  )
                    throw new Error("接続情報が不正です。");
                  const state = await checkConnection(data.token);
                  if (!state.connected)
                    throw new Error("接続を確認してください。");
                  await chrome.storage.local.set({ fusionToken: data.token });
                  setToken(data.token);
                  setConnection(state);
                  setConnectionFailed(false);
                  setCode("");
                  setDrafts([]);
                  setActiveId("");
                  setArchive([]);
                  pending.current = null;
                  setMessage(t(...U.connected));
                })
              }
            >
              {t(...E.connectButton)}
            </button>
            {(connection.accountLinked || connection.expired) && (
              <button
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    if (!confirm(t(...E.revokeConfirm))) return;
                    await request("/api/extension/disconnect", token, {});
                    await chrome.storage.local.remove("fusionToken");
                    setToken("");
                    setConnection(disconnected);
                    setConnectionFailed(false);
                    setDrafts([]);
                    setActiveId("");
                    setArchive([]);
                    setMessage(t(...E.revoked));
                  })
                }
              >
                {t(...E.revoke)}
              </button>
            )}
          </section>
          <section className="box">
            <h2>{t(...U.mode)}</h2>
            <div className="skin-grid">
              {Object.entries(skins).map(([id, value]) => (
                <button
                  key={id}
                  aria-pressed={skin === id}
                  className={`skin-choice ${skin === id ? "selected" : ""}`}
                  onClick={() => update({ skin: id as Skin })}
                >
                  <strong>{value.name[choice]}</strong>
                  <p>{value.description[choice]}</p>
                </button>
              ))}
            </div>
          </section>
          <details
            className="box"
            open={keyOpen}
            onToggle={(event) => setKeyOpen(event.currentTarget.open)}
          >
            <summary>{t(...U.use_your_own_gemini_api_key)}</summary>
            <p>{t(...E.keyStorage)}</p>
            <label>
              {t(...U.api_key)}
              <input
                ref={keyRef}
                type="password"
                autoComplete="off"
                value={keyInput}
                onChange={(event) => setKeyInput(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                disabled={busy || !keyInput.trim()}
                onClick={() =>
                  void task(async () => {
                    const value = keyInput.trim();
                    await chrome.storage.local.set({ geminiApiKey: value });
                    setApiKey(value);
                    setMessage(t(...E.keySaved));
                  })
                }
              >
                {t(...E.saveKey)}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await chrome.storage.local.remove("geminiApiKey");
                    setApiKey("");
                    setKeyInput("");
                    setMessage(t(...E.keyDeleted));
                  })
                }
              >
                {t(...U.clear_key)}
              </button>
            </div>
          </details>
          <details className="box">
            <summary>{t(...U.how_data_is_handled)}</summary>
            <p>{t(...U.do_not_enter_real_names_contact_details_or_secrets)}</p>
            <p>{t(...E.localDrafts)}</p>
            <p>{t(...U.for_trials_purchased_uses_and_your_own_key_input)}</p>
            <p>{t(...E.keyStorage)}</p>
          </details>
        </>
      )}
      <footer>
        <p>{t(...E.localDrafts)}</p>
        <p>
          <a
            href="https://fusion.monku.ai/privacy/"
            target="_blank"
            rel="noreferrer"
          >
            {t(...U.privacy)}
          </a>{" "}
          ·{" "}
          <a
            href="https://fusion.monku.ai/terms/"
            target="_blank"
            rel="noreferrer"
          >
            {t(...U.terms)}
          </a>{" "}
          ·{" "}
          <a href="https://monku.ai/contact/" target="_blank" rel="noreferrer">
            {t(...U.contact)}
          </a>
        </p>
        <p>Monku Fusion {chrome.runtime.getManifest().version}</p>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <PreferencesProvider storage={preferenceStorage}>
    <ExtensionApp />
  </PreferencesProvider>,
);
