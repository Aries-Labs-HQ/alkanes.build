/**
 * Locale-relative navigation.
 *
 * The bug class: a link written as a raw `<a href="/docs/quickstart">`, or a
 * `useRouter().push()` taken from `next/navigation`, carries no locale. With
 * `localePrefix: 'always'` the middleware then re-derives one from a cookie or
 * an Accept-Language header — so a reader on `/ko` clicking "next steps" can be
 * bounced to `/en`. A literal prefix (`/en/docs`) is the same bug, nailed shut.
 *
 * The site already ships the right tool: `@/i18n/navigation` re-exports
 * next-intl's `Link`, `useRouter`, `usePathname`, `redirect` and `getPathname`,
 * all of which carry the active locale.
 *
 * Two kinds of test here:
 *   1. behavioural — the idiom really does produce in-locale URLs; and
 *   2. a static guard, so the class cannot quietly come back.
 */

import { describe, it, expect, vi } from "vitest";

// The global setup mock omits `redirect`/`permanentRedirect`, which next-intl's
// createNavigation wraps at module scope. Provide the fuller shape here.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  notFound: vi.fn(),
  RedirectType: { push: "push", replace: "replace" },
}));

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

import { Link, getPathname } from "@/i18n/navigation";
import { locales } from "@/i18n/config";

/** Every internal target the shared navigation and the landing point at. */
const NAV_TARGETS = [
  "/",
  "/dashboard",
  "/docs",
  "/docs/quickstart",
  "/docs/cli",
  "/docs/concepts/alkanes",
  "/docs/contracts/setup",
  "/docs/contracts/testing",
  "/docs/tutorials/token",
  "/forum",
  "/aries",
];

describe("the locale-aware navigation idiom", () => {
  it("carries all five locales, and en is prefixed like the rest", () => {
    expect([...locales]).toEqual(["en", "zh", "ms", "vi", "ko"]);
  });

  it("getPathname prefixes every nav target with the active locale", () => {
    for (const locale of locales) {
      for (const href of NAV_TARGETS) {
        const resolved = getPathname({ href, locale });
        expect(resolved, `${locale} ${href}`).toBe(
          href === "/" ? `/${locale}` : `/${locale}${href}`
        );
      }
    }
  });

  it("renders in-locale hrefs for non-EN readers", () => {
    for (const locale of ["ko", "vi", "zh"] as const) {
      const { unmount } = render(
        <NextIntlClientProvider locale={locale} messages={{}}>
          <Link href="/docs/quickstart">next</Link>
        </NextIntlClientProvider>
      );

      expect(screen.getByText("next").getAttribute("href")).toBe(
        `/${locale}/docs/quickstart`
      );
      unmount();
    }
  });

  it("never produces a literal locale prefix twice", () => {
    // The failure mode a hardcoded "/en/..." would cause once wrapped.
    expect(getPathname({ href: "/docs", locale: "ko" })).not.toContain("/en/");
    expect(getPathname({ href: "/docs", locale: "ko" })).toBe("/ko/docs");
  });
});

// ---------------------------------------------------------------------------
// Static guard.
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCES = [...walk("app"), ...walk("components")].map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
}));

/**
 * `notFound` and `useParams` are not navigation and never emit a URL, so they
 * are fine to take from next/navigation.
 */
const NAVIGATION_HOOKS = /\b(useRouter|usePathname|redirect)\b/;

describe("static guard against the locale-drop class", () => {
  it("finds sources to check at all", () => {
    expect(SOURCES.length).toBeGreaterThan(40);
  });

  it("no file takes a URL-emitting navigation hook from next/navigation", () => {
    const offenders = SOURCES.filter(({ text }) => {
      const imports = text.match(/import\s*\{([^}]*)\}\s*from\s*"next\/navigation"/g);
      return imports?.some((line) => NAVIGATION_HOOKS.test(line));
    }).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("no file hardcodes a locale segment in a URL", () => {
    const literal = new RegExp(
      `(href|action|push\\(|replace\\()\\s*=?\\s*["'\`]/(?:${locales.join("|")})/`
    );
    const offenders = SOURCES.filter(({ text }) => literal.test(text)).map(
      ({ path }) => path
    );

    expect(offenders).toEqual([]);
  });

  it("no file strips the locale with a hand-rolled regex", () => {
    const offenders = SOURCES.filter(({ text }) =>
      /replace\(\s*\/\^\\\/\[a-z\]\{2\}/.test(text)
    ).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("no internal anchor bypasses the router", () => {
    // A raw <a href="/..."> hard-navigates and loses the locale. External
    // hrefs, in-page fragments and mailto are all fine.
    const offenders: string[] = [];
    for (const { path, text } of SOURCES) {
      for (const match of text.matchAll(/<a\s[^>]*href=(["'])(\/[^"']*)\1/g)) {
        offenders.push(`${path}: ${match[2]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
