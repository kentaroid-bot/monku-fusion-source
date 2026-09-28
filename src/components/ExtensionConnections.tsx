"use client";
import { useState } from "react";
import { apiRequest } from "../lib-api";
import { ExtensionStrings as E } from "../extension-strings";
import { localizeError } from "../lib-experience";
import { usePreferences } from "./PreferencesProvider";
type Connection = { id: string; createdAt: number; expiresAt: number };
export default function ExtensionConnections({
  getToken,
  onMessage,
}: {
  getToken: () => Promise<string | null>;
  onMessage: (message: string) => void;
}) {
  const { t, locale } = usePreferences();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function manage(id?: string) {
    if (busy) return;
    if (id && !confirm(t(...E.revokeConfirm))) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("ログインを確認してください。");
      if (id) {
        await apiRequest("/api/account/extensions/revoke", { id }, token);
        onMessage(t(...E.revoked));
      }
      setConnections(
        (await apiRequest("/api/account/extensions", undefined, token))
          .connections,
      );
    } catch (error) {
      onMessage(localizeError(error, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <button disabled={busy} onClick={() => void manage()}>
        {t(...E.manage)}
      </button>
      {connections?.length === 0 && <p>{t(...E.noConnections)}</p>}
      {connections?.map((connection) => (
        <div className="box" key={connection.id}>
          <p>
            {t(...E.issued)}:{" "}
            {new Date(connection.createdAt).toLocaleString(locale)}
            <br />
            {t(...E.expires)}:{" "}
            {new Date(connection.expiresAt).toLocaleString(locale)}
          </p>
          <button disabled={busy} onClick={() => void manage(connection.id)}>
            {t(...E.revoke)}
          </button>
        </div>
      ))}
    </section>
  );
}
