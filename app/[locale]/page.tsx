import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  Blocks,
  BookOpen,
  MessageSquare,
  Rocket,
  Snowflake,
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

/** Ecosystem teaser row — every one of these is a page that already exists. */
const TOOLS = [
  { key: "docs", href: "/docs", icon: BookOpen },
  { key: "quickstart", href: "/docs/quickstart", icon: Rocket },
  { key: "cli", href: "/docs/cli", icon: Terminal },
  { key: "terminal", href: "/terminal", icon: Blocks },
  { key: "governance", href: "/governance", icon: Vote },
  { key: "forum", href: "/forum", icon: MessageSquare },
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
    <main className="max-w-5xl mx-auto px-4 py-12 w-full">
      {/* 1. Hero — what Alkanes is, and the way in. */}
      <section className="text-center mb-20">
        <p className="font-mono text-xs uppercase tracking-wider text-[color:var(--sf-primary)] mb-4">
          {t("hero.eyebrow")}
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[color:var(--sf-text)]">
          {t("hero.title")}
        </h1>
        <p className="mt-6 text-lg md:text-xl text-[color:var(--sf-muted)] max-w-3xl mx-auto leading-relaxed">
          {t("hero.lead")}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
          <Link
            href="/docs/quickstart"
            className="btn-primary inline-flex items-center gap-2"
          >
            <Rocket aria-hidden="true" className="w-4 h-4" />
            {t("hero.ctaPrimary")}
          </Link>
          <Link
            href="/docs"
            className="btn-secondary inline-flex items-center gap-2"
          >
            <BookOpen aria-hidden="true" className="w-4 h-4" />
            {t("hero.ctaSecondary")}
          </Link>
        </div>
      </section>

      {/* 2. Two tracks. */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-[color:var(--sf-text)] mb-2">
          {t("tracks.title")}
        </h2>
        <p className="text-[color:var(--sf-muted)] mb-6">{t("tracks.lead")}</p>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass-card p-6 flex flex-col">
            <Blocks
              aria-hidden="true"
              className="w-6 h-6 text-[color:var(--sf-primary)] mb-4"
            />
            <p className="font-mono text-xs uppercase tracking-wider text-[color:var(--sf-muted)] mb-2">
              {t("tracks.build.eyebrow")}
            </p>
            <h3 className="text-lg font-semibold text-[color:var(--sf-text)] mb-2">
              {t("tracks.build.title")}
            </h3>
            <p className="text-[color:var(--sf-muted)] leading-relaxed mb-6">
              {t("tracks.build.body")}
            </p>
            <Link
              href="/docs/contracts/setup"
              className="mt-auto inline-flex items-center gap-2 font-medium text-[color:var(--sf-primary)] underline underline-offset-4"
            >
              {t("tracks.build.cta")}
              <ArrowRight aria-hidden="true" className="w-4 h-4" />
            </Link>
          </div>
          <div className="glass-card p-6 flex flex-col">
            <Snowflake
              aria-hidden="true"
              className="w-6 h-6 text-[color:var(--sf-primary)] mb-4"
            />
            <p className="font-mono text-xs uppercase tracking-wider text-[color:var(--sf-muted)] mb-2">
              {t("tracks.subfrost.eyebrow")}
            </p>
            <h3 className="text-lg font-semibold text-[color:var(--sf-text)] mb-2">
              {t("tracks.subfrost.title")}
            </h3>
            <p className="text-[color:var(--sf-muted)] leading-relaxed mb-6">
              {t("tracks.subfrost.body")}
            </p>
            <Link
              href="/docs/tutorials/wrap-btc"
              className="mt-auto inline-flex items-center gap-2 font-medium text-[color:var(--sf-primary)] underline underline-offset-4"
            >
              {t("tracks.subfrost.cta")}
              <ArrowRight aria-hidden="true" className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 3. Builder signup — the centrepiece. */}
      <BuilderSignupCard
        open={BUILDER_SIGNUP_OPEN}
        signupHref={BUILDER_SIGNUP_HREF}
      />

      {/* 4. Aries strip.

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

      {/* 5. Tools and ecosystem teaser. */}
      <section>
        <h2 className="text-2xl font-bold text-[color:var(--sf-text)] mb-2">
          {t("tools.title")}
        </h2>
        <p className="text-[color:var(--sf-muted)] mb-6">{t("tools.lead")}</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map(({ key, href, icon: Icon }) => (
            <Link key={key} href={href} className="glass-card-hover p-5 block">
              <Icon
                aria-hidden="true"
                className="w-5 h-5 text-[color:var(--sf-primary)] mb-3"
              />
              <p className="font-semibold text-[color:var(--sf-text)] mb-1">
                {t(`tools.${key}.title`)}
              </p>
              <p className="text-sm text-[color:var(--sf-muted)] leading-relaxed">
                {t(`tools.${key}.body`)}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
