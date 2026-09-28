"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePreferences } from "./PreferencesProvider";
import { UIStrings, formatUI } from "../ui-strings";
import { apiRequest } from "../lib-api";
import { localizeError } from "../lib-experience";
const RECEIPT = "fusion_retirement_receipt:";
export default function AccountRetirement({
  accountId,
  balance,
  getToken,
  onComplete,
}: {
  accountId: string;
  balance: number | null;
  getToken: () => Promise<string | null>;
  onComplete: () => void;
}) {
  const { t, locale } = usePreferences();
  const [keepPosts, setKeepPosts] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [delayed, setDelayed] = useState(false);
  const [error, setError] = useState("");
  const receipt = useRef("");
  const completed = useRef(false);
  const completeCallback = useRef(onComplete);
  useEffect(() => {
    completeCallback.current = onComplete;
  }, [onComplete]);
  const check = useCallback(async () => {
    if (!receipt.current) return;
    try {
      const result = await apiRequest("/api/account/retire-status", {
        receipt: receipt.current,
      });
      setStatus(result.status === "unknown" ? "" : result.status);
      setDelayed(result.delayed);
      setError("");
      if (result.status === "complete" && !completed.current) {
        completed.current = true;
        try {
          sessionStorage.removeItem(RECEIPT + accountId);
        } catch {
          /* Receipt grants status access only. */
        }
        completeCallback.current();
      }
    } catch {
      setError(t(...UIStrings.retire_status_failed));
    }
  }, [t, accountId]);
  useEffect(() => {
    try {
      receipt.current = sessionStorage.getItem(RECEIPT + accountId) || "";
    } catch {
      /* Memory works if session storage is unavailable. */
    }
    if (receipt.current) void check();
  }, [check, accountId]);
  useEffect(() => {
    if (status !== "pending" && status !== "cleaning") return;
    const timer = setInterval(() => void check(), 3000);
    return () => clearInterval(timer);
  }, [status, check]);
  async function retire() {
    if (
      busy ||
      !agreed ||
      balance === null ||
      !confirm(t(...UIStrings.retire_confirm))
    )
      return;
    setBusy(true);
    setError("");
    try {
      const jwt = await getToken();
      if (!jwt) throw new Error("ログインを確認してください。");
      if (!receipt.current)
        receipt.current = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      try {
        sessionStorage.setItem(RECEIPT + accountId, receipt.current);
      } catch {
        /* Server processing does not depend on storage. */
      }
      await apiRequest(
        "/api/account/retire",
        { receipt: receipt.current, keepPosts, confirmForfeit: true },
        jwt,
      );
      setStatus("pending");
      await check();
    } catch (e) {
      setError(localizeError(e, locale));
    } finally {
      setBusy(false);
    }
  }
  const processing = status === "pending" || status === "cleaning";
  return (
    <details
      className="box retirement"
      open={processing || status === "complete" ? true : undefined}
    >
      <summary>{t(...UIStrings.retire_title)}</summary>
      {status === "complete" ? (
        <p role="status">{t(...UIStrings.retire_complete)}</p>
      ) : processing ? (
        <>
          <p role="status">{t(...UIStrings.retire_pending)}</p>
          {delayed && <p>{t(...UIStrings.retire_delayed)}</p>}
        </>
      ) : (
        <>
          <p>{t(...UIStrings.retire_intro)}</p>
          <fieldset disabled={busy}>
            <legend>{t(...UIStrings.retire_posts)}</legend>
            <label>
              <input
                type="radio"
                name="retire-posts"
                checked={!keepPosts}
                onChange={() => setKeepPosts(false)}
              />
              {t(...UIStrings.retire_delete_posts)}
            </label>
            <label>
              <input
                type="radio"
                name="retire-posts"
                checked={keepPosts}
                onChange={() => setKeepPosts(true)}
              />
              {t(...UIStrings.retire_keep_posts)}
            </label>
          </fieldset>
          <p className="small">{t(...UIStrings.retire_retention)}</p>
          <label className="retirement-consent">
            <input
              type="checkbox"
              checked={agreed}
              disabled={busy || balance === null}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            {t(...formatUI(UIStrings.retire_agree, [balance ?? "…"]))}
          </label>
          <button
            disabled={!agreed || busy || balance === null}
            onClick={() => void retire()}
          >
            {t(...UIStrings.retire_title)}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {(processing || error) && status !== "complete" && (
        <button disabled={busy} onClick={() => void check()}>
          {t(...UIStrings.retire_refresh)}
        </button>
      )}
      <p>
        <a href="https://monku.ai/contact/">{t(...UIStrings.contact)}</a>
      </p>
    </details>
  );
}
