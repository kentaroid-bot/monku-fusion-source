"use client";
import { ClerkProvider } from "@clerk/react";
import { ui } from "@clerk/ui";
import { frFR } from "@clerk/localizations/fr-FR";
import { enUS } from "@clerk/localizations/en-US";
import { usePreferences } from "./PreferencesProvider";
import { jaJP } from "@clerk/localizations/ja-JP";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const clerkAvailable = !!publishableKey;

export default function OptionalClerkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = usePreferences();
  if (!publishableKey) return children;
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      ui={ui}
      localization={locale === "ja" ? jaJP : locale === "fr" ? frFR : enUS}
      signInUrl="/sign-in/"
      signUpUrl="/sign-up/"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
