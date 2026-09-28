"use client";
import { UIStrings } from "../ui-strings";
import Link from "next/link";
import PreferencesProvider, {
  LanguageSwitch,
  usePreferences,
} from "./PreferencesProvider";

type Text = [string, string, string];
type Section = { title: Text; paragraphs: Text[] };
const privacy: Section[] = [
  { title: UIStrings.retire_title, paragraphs: [UIStrings.retire_legal] },
  {
    title: UIStrings.data_and_purpose,
    paragraphs: [UIStrings.we_process_text_you_enter_or_select_to_generate],
  },
  {
    title: UIStrings.external_processing,
    paragraphs: [
      UIStrings.when_you_generate_or_revise_a_result_your_input,
      UIStrings.first_time_connections_use_cloudflare_turnstile_payments_take_place,
      UIStrings.if_you_sign_in_clerk_handles_your_email_address,
      UIStrings.with_google_sign_in_clerk_receives_your_google_account,
    ],
  },
  {
    title: UIStrings.storage,
    paragraphs: [
      UIStrings.a_secret_connection_token_is_stored_in_your_browser,
      UIStrings.linking_your_current_connection_when_signed_in_removes_the,
      UIStrings.a_gemini_api_key_entered_in_the_extension_is,
      UIStrings.the_web_interface_language_skin_and_output_language_are,
    ],
  },
  {
    title: UIStrings.publication_and_deletion,
    paragraphs: [
      UIStrings.results_are_not_published_automatically_review_and_publish_posts,
    ],
  },
  {
    title: UIStrings.control_and_contact,
    paragraphs: [
      UIStrings.you_can_clear_your_api_key_in_settings_if,
      UIStrings.we_have_not_implemented_advertising_use_data_sales_or,
    ],
  },
];
const terms: Section[] = [
  {
    title: UIStrings.about_the_service,
    paragraphs: [
      UIStrings.monku_fusion_is_an_ai_tool_that_suggests_constructive,
    ],
  },
  {
    title: UIStrings.trials_and_purchases,
    paragraphs: [
      UIStrings.your_first_connection_receives_3_free_uses_each_purchase,
      UIStrings.before_sign_in_your_balance_is_managed_through_an,
    ],
  },
  {
    title: UIStrings.publication,
    paragraphs: [UIStrings.submit_only_content_you_have_the_right_to_publish],
  },
  {
    title: UIStrings.cancellation_and_refunds,
    paragraphs: [
      UIStrings.contact_us_to_discuss_refunds_for_your_unused_balance,
    ],
  },
];
const commerce: Section[] = [
  {
    title: UIStrings.service_and_operator,
    paragraphs: [
      UIStrings.service_monku_fusion_trade_name_monku_ai,
      UIStrings.seller_kentaro_takemura_address_1292_uramura_cho_toba_mie,
      UIStrings.contact_monku_ai_contact_page_linked_below,
    ],
  },
  {
    title: UIStrings.price_and_additional_costs,
    paragraphs: [UIStrings["10_uses_100_including_tax_each_purchase_is_a"]],
  },
  {
    title: UIStrings.payment_and_delivery,
    paragraphs: [
      UIStrings.payment_is_by_credit_card_through_stripe_at_checkout,
    ],
  },
  {
    title: UIStrings.cancellation_and_refunds,
    paragraphs: [
      UIStrings.contact_us_to_discuss_refunds_for_your_unused_balance_2,
    ],
  },
  {
    title: UIStrings.requirements_and_connection_details,
    paragraphs: [
      UIStrings.the_web_version_requires_a_browser_with_javascript_enabled,
    ],
  },
];
const documents = {
  privacy: { title: UIStrings.privacy as Text, sections: privacy },
  terms: { title: UIStrings.terms_of_use as Text, sections: terms },
  commerce: {
    title:
      UIStrings.disclosure_under_japan_s_act_on_specified_commercial_transactions as Text,
    sections: commerce,
  },
};
export default function LegalDocument({
  kind,
}: {
  kind: keyof typeof documents;
}) {
  return (
    <PreferencesProvider>
      <Content kind={kind} />
    </PreferencesProvider>
  );
}
function Content({ kind }: { kind: keyof typeof documents }) {
  const { t } = usePreferences();
  const document = documents[kind];
  return (
    <main className="shell fusion-ui legal-page">
      <header>
        <Link className="brand" href="/">
          Monku Fusion
        </Link>
        <LanguageSwitch />
      </header>
      <h1>{t(...document.title)}</h1>
      <p className="small">{t(...UIStrings.updated_september_25_2026)}</p>
      <section className="box">
        {document.sections.map((section) => (
          <section key={section.title[1]}>
            <h2>{t(...section.title)}</h2>
            {section.paragraphs.map((text, i) => (
              <p key={i}>{t(...text)}</p>
            ))}
          </section>
        ))}
      </section>
      <footer>
        <a href="https://monku.ai/contact/">{t(...UIStrings.contact_us)}</a> ·{" "}
        <Link href="/privacy/">{t(...UIStrings.privacy)}</Link> ·{" "}
        <Link href="/terms/">{t(...UIStrings.terms)}</Link> ·{" "}
        <Link href="/commerce/">{t(...UIStrings.commercial_disclosure)}</Link>
        <p>
          <Link href="/">{t(...UIStrings.back_to_monku_fusion)}</Link>
        </p>
      </footer>
    </main>
  );
}
