import { UIStrings } from "../ui-strings";
import { useState } from "react";
import Signup from "./Signup";
import { usePreferences } from "./PreferencesProvider";

export default function TrialGuide({
  canConnect,
  onToken,
}: {
  canConnect: boolean;
  onToken: (token: string) => void;
}) {
  const { t, locale } = usePreferences();
  const [open, setOpen] = useState(false);
  return (
    <details
      className="disclosure trial-guide"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{t(...UIStrings.try_3_times_free)}</summary>
      <p className="small">
        {t(...UIStrings["3_uses_with_your_first_connection_a_shared_limit"])}
      </p>
      {/* Mount the challenge only when visible, and remove it when the guide closes. */}
      {open && canConnect && <Signup key={locale} onToken={onToken} />}
    </details>
  );
}
