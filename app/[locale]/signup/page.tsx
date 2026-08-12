import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignupWizard } from "@/components/registry/SignupWizard";

/**
 * Builder registration.
 *
 * The page is a server component; the wizard inside it is the only client
 * part. Registration is not open yet — `BUILDER_SIGNUP_OPEN` in
 * lib/featureFlags.ts is still false, so the landing does not link here, and
 * the X leg of the wizard reports that it is unavailable rather than
 * pretending to work.
 */
export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("registry");

  return (
    <main className="max-w-3xl mx-auto px-4 pt-20 pb-24 w-full">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--sf-primary)]">
        {t("eyebrow")}
      </p>
      <h1 className="mt-6 text-3xl md:text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-[color:var(--sf-text)]">
        {t("title")}
      </h1>
      <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-pretty text-[color:var(--sf-muted)]">
        {t("lead")}
      </p>

      <div className="mt-12">
        <SignupWizard />
      </div>
    </main>
  );
}
