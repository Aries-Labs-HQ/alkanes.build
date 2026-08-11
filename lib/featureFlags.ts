/**
 * Build-time feature flags.
 *
 * Keep these boolean and keep them here — a flag that lives in one place can be
 * flipped in one place.
 */

/**
 * Builder registration.
 *
 * `false` (the default) renders the signup card's CTA in its "opening soon"
 * state: present, described, and inert. `true` turns the CTA into a link to the
 * signup wizard.
 *
 * DO NOT flip this until the wizard route referenced by
 * `BUILDER_SIGNUP_HREF` in `app/[locale]/page.tsx` actually exists — flipping it
 * first points the site's most prominent CTA at a 404.
 */
export const BUILDER_SIGNUP_OPEN = false;
