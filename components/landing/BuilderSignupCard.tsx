import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CircleCheck, CircleDashed, UserPlus } from "lucide-react";

/**
 * The landing page's centrepiece: what registering as a builder gets you.
 *
 * Server component — it renders text and, in its default state, an inert
 * button. Nothing here connects a wallet, calls an API, or reads a database.
 *
 * The whole open/closed behaviour hangs off the single `open` prop, which the
 * page feeds from `BUILDER_SIGNUP_OPEN`. Closed is the default.
 */
export async function BuilderSignupCard({
  open = false,
  signupHref,
}: {
  open?: boolean;
  signupHref: string;
}) {
  const t = await getTranslations("landing.signup");

  const included = ["profile", "directory"] as const;
  const later = ["forum", "buildathon", "polls"] as const;

  return (
    <section className="mb-20">
      <div className="glass-card p-8 md:p-10">
        <p className="font-mono text-xs uppercase tracking-wider text-[color:var(--sf-primary)] mb-3">
          {t("eyebrow")}
        </p>
        <h2 className="text-2xl md:text-3xl font-bold text-[color:var(--sf-text)] mb-3">
          {t("title")}
        </h2>
        <p className="text-[color:var(--sf-muted)] leading-relaxed max-w-2xl mb-8">
          {t("lead")}
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* What registration includes */}
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
              {t("includedLabel")}
            </p>
            <ul className="space-y-4">
              {included.map((key) => (
                <li key={key} className="flex items-start gap-3">
                  <CircleCheck
                    aria-hidden="true"
                    className="w-5 h-5 shrink-0 mt-0.5 text-[color:var(--sf-primary)]"
                  />
                  <div>
                    <p className="font-semibold text-[color:var(--sf-text)]">
                      {t(`${key}.title`)}
                    </p>
                    <p className="text-sm text-[color:var(--sf-muted)] leading-relaxed">
                      {t(`${key}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* What is planned but not built */}
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
              {t("laterLabel")}
            </p>
            <ul className="space-y-4">
              {later.map((key) => (
                <li key={key} className="flex items-start gap-3">
                  <CircleDashed
                    aria-hidden="true"
                    className="w-5 h-5 shrink-0 mt-0.5 text-[color:var(--sf-muted)]"
                  />
                  <div>
                    <p className="font-semibold text-[color:var(--sf-text)]">
                      {t(`${key}.title`)}
                    </p>
                    <p className="text-sm text-[color:var(--sf-muted)] leading-relaxed">
                      {t(`${key}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* The one CTA. Closed by default; the flag is the only thing that moves it. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {open ? (
            <Link
              href={signupHref}
              className="btn-primary inline-flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <UserPlus aria-hidden="true" className="w-4 h-4" />
              {t("ctaOpen")}
            </Link>
          ) : (
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="btn-primary inline-flex items-center justify-center gap-2 w-full sm:w-auto opacity-50 cursor-not-allowed"
            >
              <UserPlus aria-hidden="true" className="w-4 h-4" />
              {t("ctaSoon")}
            </button>
          )}
          <p className="text-sm text-[color:var(--sf-muted)]">
            {open ? t("noteOpen") : t("noteSoon")}
          </p>
        </div>
      </div>
    </section>
  );
}
