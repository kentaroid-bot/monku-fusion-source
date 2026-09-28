"use client";
import { UIStrings } from "../ui-strings";
import Script from "next/script";
import { usePreferences } from "./PreferencesProvider";
import { localizeError } from "../lib-experience";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../lib-api";
import { readSession, registrationToken, saveSession } from "../lib-session";
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}
export default function Signup({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const { t, locale } = usePreferences();
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(
    () => () => {
      if (widget.current !== null) {
        window.turnstile?.remove(widget.current);
        widget.current = null;
      }
    },
    [],
  );
  function render() {
    if (ref.current && window.turnstile && widget.current === null)
      widget.current = window.turnstile.render(ref.current, {
        sitekey,
        action: "signup",
        language: locale,
        callback: (token: string) => {
          setChallenge(token);
          setError("");
        },
        "expired-callback": () => setChallenge(""),
        "error-callback": () => {
          setChallenge("");
          setError(
            "本人操作の確認を読み込めません。通信環境を確認して再読み込みしてください。",
          );
        },
      });
  }
  async function signup() {
    setBusy(true);
    setError("");
    try {
      const existing = readSession(localStorage);
      if (existing) {
        onToken(existing);
        return;
      }
      const pendingToken = registrationToken(localStorage);
      const data = await apiRequest("/api/session", {
        turnstileToken: challenge,
        registrationToken: pendingToken,
      });
      saveSession(localStorage, data.token);
      onToken(data.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "接続に失敗しました。");
    } finally {
      setBusy(false);
      setChallenge("");
      if (widget.current) window.turnstile?.reset(widget.current);
    }
  }
  return (
    <section className="box">
      <h2>{t(...UIStrings.first_visit_connect_to_get_started)}</h2>
      <p>{t(...UIStrings.start_with_3_free_uses_or_use_your_own)}</p>
      <p>
        {t(...UIStrings.input_and_generated_results_are_sent_to_google_and)}{" "}
        <a href="/privacy/">{t(...UIStrings.data_handling)}</a> ·{" "}
        <a href="/terms/">{t(...UIStrings.terms)}</a>
      </p>
      <details>
        <summary>
          {t(...UIStrings.keeping_access_and_free_usage_limits)}
        </summary>
        <p>
          {t(
            ...UIStrings.private_browsing_may_lose_the_connection_and_access_to,
          )}
        </p>
        <p>
          {t(...UIStrings.free_generation_may_pause_when_the_shared_limit_is)}
        </p>
      </details>
      {sitekey ? (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onReady={render}
          />
          <div ref={ref} />
          <button onClick={signup} disabled={!challenge || busy}>
            {busy
              ? t(...UIStrings.connecting)
              : t(...UIStrings.agree_and_start_free)}
          </button>
        </>
      ) : (
        <p>{t(...UIStrings.first_time_connections_are_being_prepared)}</p>
      )}
      {error && (
        <p role="alert">
          {locale !== "ja" ? localizeError(new Error(error), locale) : error}
        </p>
      )}
    </section>
  );
}
