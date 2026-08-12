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

/**
 * The in-browser keystore wallet.
 *
 * When enabled, the site can generate a BIP-39 mnemonic in the browser, encrypt
 * it under a password into localStorage, and hold the plaintext phrase in
 * sessionStorage for the life of the tab. `/terminal` depends on exactly that:
 * its DIESEL auto-mint signs chains of transactions unattended, using a taproot
 * key derived from the session mnemonic, which no browser extension can do
 * without prompting for every signature.
 *
 * When disabled, none of that is reachable: no phrase is generated, nothing is
 * written to storage, no stored keystore is restored on load, and `/terminal`
 * reports itself unavailable rather than offering to make a wallet.
 *
 * Default is ENABLED, so merging this changes nothing in production. This box's
 * staging env sets `NEXT_PUBLIC_KEYSTORE_WALLET=off`, so the connect-surface
 * redesign is developed and reviewed with no in-browser key generation present.
 *
 * The connect modal in the header does NOT consult this flag — it offers
 * SUBFROST and UniSat and nothing else, in both states.
 */
export const KEYSTORE_WALLET_ENABLED =
  process.env.NEXT_PUBLIC_KEYSTORE_WALLET !== "off";
