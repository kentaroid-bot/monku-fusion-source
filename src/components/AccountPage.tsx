"use client";
import { UIStrings } from "../ui-strings";

import Link from "next/link";
import { SignIn, SignUp } from "@clerk/react";
import { useEffect, useRef } from "react";
import OptionalClerkProvider, { clerkAvailable } from "./OptionalClerkProvider";
import PreferencesProvider, {
  LanguageSwitch,
  usePreferences,
} from "./PreferencesProvider";
import { suppressAddressSuggestions } from "../lib-auth-input";
import ModeArtwork from "./ModeArtwork";
import { accountAppearance } from "../lib-auth-appearance";
import { skins } from "../lib-experience";

export default function AccountPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <PreferencesProvider>
      <AccountContent mode={mode} />
    </PreferencesProvider>
  );
}
function AccountContent({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { t, skin } = usePreferences();
  const form = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const brave = (navigator as Navigator & { brave?: { isBrave?: unknown } })
      .brave;
    if (form.current && typeof brave?.isBrave === "function")
      return suppressAddressSuggestions(form.current);
  }, []);

  const fallback = (
    <p role="status">{t(...UIStrings.loading_the_sign_in_form)}</p>
  );
  return (
    <main className="shell experience account-page">
      {skin === "t" && (
        <div className="terminal-bar" aria-hidden="true">
          <span className="terminal-dots">
            <i />
            <i />
            <i />
          </span>
          <span>monku-fusion / account</span>
          <span>{mode}</span>
        </div>
      )}
      <div className="fusion-ui">
        <header className="site-header">
          <Link className="brand" href="/">
            Monku <span>Fusion</span>
          </Link>
          <LanguageSwitch />
        </header>
        <p className="account-back">
          <Link href="/">{t(...UIStrings.back_to_monku_fusion_2)}</Link>
        </p>
      </div>
      <div className="account-layout">
        <section
          className="fusion-ui account-intro"
          aria-labelledby="account-title"
        >
          <p className="eyebrow">
            {t(...skins[skin].name)} /{" "}
            {mode === "sign-up"
              ? t(...UIStrings.sign_up_2)
              : t(...UIStrings.sign_in_2)}
          </p>
          <h1 id="account-title">
            {mode === "sign-up"
              ? t(...UIStrings.make_room_for_what_s_next)
              : t(...UIStrings.welcome_back)}
          </h1>
          <p className="account-description">
            {t(
              ...UIStrings.explore_everyone_s_ideas_keep_your_favorites_with_a,
            )}
          </p>
          <ModeArtwork />
        </section>
        <div className="account-entry">
          {/* Keep Clerk outside .fusion-ui so product form rules never reach its inputs. */}
          <div ref={form} className="account-form">
            {clerkAvailable ? (
              <OptionalClerkProvider>
                {mode === "sign-up" ? (
                  <SignUp
                    appearance={accountAppearance[skin]}
                    routing="hash"
                    signInUrl="/sign-in/"
                    forceRedirectUrl="/"
                    fallback={fallback}
                  />
                ) : (
                  <SignIn
                    appearance={accountAppearance[skin]}
                    routing="hash"
                    signUpUrl="/sign-up/"
                    forceRedirectUrl="/"
                    fallback={fallback}
                  />
                )}
              </OptionalClerkProvider>
            ) : (
              <p>
                {t(...UIStrings.sign_in_is_being_prepared)}
                <Link href="/">{t(...UIStrings.back_to_monku_fusion)}</Link>
              </p>
            )}
          </div>
          <p className="account-balance-note">
            {t(
              ...UIStrings.after_signing_up_or_signing_in_your_purchased_balance,
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
