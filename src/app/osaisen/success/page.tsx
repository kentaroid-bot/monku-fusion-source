"use client";
import { UIStrings, formatUI } from "../../../ui-strings";
import Link from "next/link";
import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import OptionalClerkProvider, {
  clerkAvailable,
} from "../../../components/OptionalClerkProvider";
import PreferencesProvider, {
  LanguageSwitch,
  usePreferences,
} from "../../../components/PreferencesProvider";
import { apiRequest } from "../../../lib-api";
import { getConvexToken } from "../../../lib-account-auth";

export default function Success() {
  return (
    <PreferencesProvider>
      <OptionalClerkProvider>
        {clerkAvailable ? <SignedInSuccess /> : <SuccessContent />}
      </OptionalClerkProvider>
    </PreferencesProvider>
  );
}

function SignedInSuccess() {
  const { isLoaded, isSignedIn, getToken, sessionClaims } = useAuth();
  const audience = sessionClaims?.aud;
  const getAccountToken = useCallback(
    () => getConvexToken(getToken, audience),
    [getToken, audience],
  );
  return (
    <SuccessContent
      ready={isLoaded}
      getAccountToken={isSignedIn ? getAccountToken : undefined}
    />
  );
}

function SuccessContent({
  ready = true,
  getAccountToken,
}: {
  ready?: boolean;
  getAccountToken?: () => Promise<string | null>;
}) {
  const { t } = usePreferences();
  const [status, setStatus] = useState<
    "pending" | "connection" | "success" | "error"
  >("pending");
  const [balance, setBalance] = useState(0);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    async function verify() {
      try {
        const anonymousToken = localStorage.getItem("monku_token") || "";
        const sessionId = new URLSearchParams(location.search).get(
          "session_id",
        );
        if (!sessionId) throw new Error("決済番号がありません。");
        let token = anonymousToken;
        if (getAccountToken) {
          const accountToken = await getAccountToken();
          if (accountToken) {
            const status = await apiRequest(
              "/api/account/status",
              undefined,
              accountToken,
            );
            if (status.linked) token = accountToken;
          }
        }
        if (!token) {
          if (active) setStatus("connection");
          return;
        }
        await apiRequest("/api/incense/verify-session", { sessionId }, token);
        const data = await apiRequest("/api/incense/balance", undefined, token);
        if (active) {
          setBalance(data.balance);
          setStatus("success");
        }
      } catch {
        if (active) setStatus("error");
      }
    }
    verify();
    return () => {
      active = false;
    };
  }, [ready, getAccountToken]);
  const messages = {
    pending: t(...UIStrings.checking_your_payment),
    connection: t(...UIStrings.we_could_not_find_your_connection_sign_in_and),
    success: t(
      ...formatUI(
        UIStrings.payment_confirmed_remaining_uses_value_in_the_extension_select,
        [balance],
        [balance],
      ),
    ),
    error: t(...UIStrings.we_could_not_verify_the_payment_in_this_browser),
  };
  return (
    <main className="shell fusion-ui">
      <LanguageSwitch />
      <h1>{t(...UIStrings.payment_confirmation)}</h1>
      <p role="status">{messages[status]}</p>
      <Link href="/">{t(...UIStrings.back_to_monku_fusion)}</Link>
    </main>
  );
}
