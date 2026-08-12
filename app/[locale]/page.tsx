import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  Blocks,
  BookOpen,
  MessageSquare,
  Rocket,
  Sparkles,
  Terminal,
  Vote,
} from "lucide-react";
import { BuilderSignupCard } from "@/components/landing/BuilderSignupCard";
import { BUILDER_SIGNUP_OPEN } from "@/lib/featureFlags";

/**
 * Landing page. Server component — the dashboard that used to live here now
 * lives at `/dashboard`.
 *
 * Everything on this page is static text and links. It reads no chain data, no
 * database, and no wallet, which is what lets it render on the server.
 */

/** Where the signup CTA points once `BUILDER_SIGNUP_OPEN` is flipped on. */
const BUILDER_SIGNUP_HREF = "/signup";

/**
 * Ecosystem row.
 *
 * Every one of these is rendered NON-INTERACTIVE, with a visible "coming soon"
 * label, until its target is ready for builders. They carry no `href`, so
 * there is no dead link and nothing here can 404.
 */
const TOOLS = [
  { key: "docs", icon: BookOpen },
  { key: "quickstart", icon: Rocket },
  { key: "cli", icon: Terminal },
  { key: "terminal", icon: Blocks },
  { key: "governance", icon: Vote },
  { key: "forum", icon: MessageSquare },
] as const;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Enable static rendering, same as the layout.
  setRequestLocale(locale);

  const t = await getTranslations("landing");
  // The Aries strip reads the sanctioned line straight off the /aries page's own
  // key rather than keeping a second copy. See the comment on the strip below.
  const tAries = await getTranslations("aries");

  return (
    <main className="w-full">
      {/* 1. Hero.

          One background treatment and no more: a soft radial falloff in the
          site's existing accent, at a tenth opacity, fading to transparent
          over the page's own #0d0d0d ground. No new colour, no new font, no
          new dependency — the accent is --sf-primary, unchanged. */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(58rem 30rem at 50% -6rem, rgba(212, 133, 74, 0.10), rgba(212, 133, 74, 0) 68%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 pt-24 pb-20 md:pt-32 md:pb-28 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--sf-primary)]">
            {t("hero.eyebrow")}
          </p>
          <h1 className="mt-8 text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05] tracking-[-0.03em] text-balance text-[color:var(--sf-text)]">
            {t("hero.title")}
          </h1>
          <p className="mt-8 mx-auto max-w-[60ch] text-lg md:text-xl leading-relaxed text-pretty text-[color:var(--sf-muted)]">
            {t("hero.lead")}
          </p>
          <p className="mt-4 mx-auto max-w-[60ch] text-lg md:text-xl leading-relaxed text-pretty text-[color:var(--sf-muted)]">
            {t("hero.leadStrong")}
          </p>
          <div className="mt-12 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-8 gap-y-5">
            <Link
              href="/aries"
              className="btn-primary inline-flex items-center gap-2"
            >
              <Rocket aria-hidden="true" className="w-4 h-4" />
              {t("hero.ctaPrimary")}
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 font-medium text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)] transition-colors duration-200"
            >
              {t("hero.ctaSecondary")}
              <ArrowRight aria-hidden="true" className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 pb-24">
        {/* 2. Builder registration — directly beneath the hero. */}
        <BuilderSignupCard
          open={BUILDER_SIGNUP_OPEN}
          signupHref={BUILDER_SIGNUP_HREF}
        />

        {/* 3. Aries strip.

            The definitional line is sanctioned copy. It is read from the /aries
            page's own message key, `aries.hero.definition`, so the two pages can
            never drift apart — this page holds no second copy to fall out of date.

            That key is deliberately the SAME ENGLISH STRING in all five locale
            catalogues. Do not translate it and do not rewrite it here. */}
        <section className="mb-20">
          <div className="glass-card p-8 text-center">
            <Sparkles
              aria-hidden="true"
              className="w-6 h-6 text-[color:var(--sf-primary)] mx-auto mb-4"
            />
            <p className="font-mono text-xs uppercase tracking-wider text-[color:var(--sf-primary)] mb-3">
              {t("aries.eyebrow")}
            </p>
            <p className="text-xl md:text-2xl text-[color:var(--sf-text)] max-w-3xl mx-auto leading-relaxed">
              {tAries("hero.definition")}
            </p>
            <Link
              href="/aries"
              className="btn-secondary inline-flex items-center gap-2 mt-8"
            >
              {t("aries.cta")}
              <ArrowRight aria-hidden="true" className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* 4. Tools and ecosystem.

            Rendered as plain list items, not links: no `href`, nothing
            focusable, nothing to click. Each carries a visible "coming soon"
            label so the state is legible rather than merely dimmed. */}
        <section>
          <h2 className="text-2xl font-bold text-[color:var(--sf-text)] mb-2">
            {t("tools.title")}
          </h2>
          <p className="text-[color:var(--sf-muted)] mb-6">{t("tools.lead")}</p>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TOOLS.map(({ key, icon: Icon }) => (
              <li key={key} className="glass-card p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <Icon
                    aria-hidden="true"
                    className="w-5 h-5 text-[color:var(--sf-primary)] opacity-70"
                  />
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--sf-muted)] border border-[color:var(--sf-outline)] rounded-full px-2.5 py-1">
                    {t("tools.comingSoon")}
                  </span>
                </div>
                <p className="font-semibold text-[color:var(--sf-text)] mb-1">
                  {t(`tools.${key}.title`)}
                </p>
                <p className="text-sm text-[color:var(--sf-muted)] leading-relaxed">
                  {t(`tools.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
