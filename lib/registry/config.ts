/**
 * Builder-registry policy constants and the environment contract.
 *
 * Everything here is a value an operator may need to reason about or change,
 * gathered in one place rather than scattered through route handlers.
 */

/** Environment variables the registry reads. Names are the contract. */
export const REGISTRY_ENV = {
  /** X (Twitter) OAuth 2.0 client id, from the X developer portal. */
  X_OAUTH_CLIENT_ID: "X_OAUTH_CLIENT_ID",
  /** X OAuth 2.0 client secret. Confidential client. */
  X_OAUTH_CLIENT_SECRET: "X_OAUTH_CLIENT_SECRET",
  /** Exact redirect URI registered with the X app; must match byte for byte. */
  X_OAUTH_REDIRECT_URI: "X_OAUTH_REDIRECT_URI",
  /** Space-separated scopes. See REQUIRED_X_SCOPES below. */
  X_OAUTH_SCOPES: "X_OAUTH_SCOPES",
  /** HMAC key for the registry's own session cookie. >= 32 chars. */
  REGISTRY_SESSION_SECRET: "REGISTRY_SESSION_SECRET",
} as const;

/**
 * The minimum scopes the registration flow needs.
 *
 * `users.read` is what yields the numeric user id and the handle. `tweet.read`
 * is required alongside it by X's own scope model. `offline.access` is NOT
 * needed: the registry reads the identity once, at registration, and never
 * acts on the account afterwards — so there is no refresh token to hold and
 * nothing to keep authorised.
 */
export const REQUIRED_X_SCOPES = ["users.read", "tweet.read"] as const;

/** How long a registry session cookie stays valid. */
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** Cookie name for the registry's X session. */
export const SESSION_COOKIE = "registry_x_session";

/** Cookie name holding the OAuth state + PKCE verifier between start and callback. */
export const OAUTH_STATE_COOKIE = "registry_x_oauth";

// ---------------------------------------------------------------------------
// Wallet rotation policy
// ---------------------------------------------------------------------------

/**
 * Shortest gap between two rotations on one builder record.
 *
 * A rotation is a public, permanent event on a public identity. Rate limiting
 * it is not about load — it is about making a compromised X session unable to
 * churn the binding faster than a human can notice.
 */
export const ROTATION_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Rotations allowed within `ROTATION_WINDOW_MS`, beyond the interval rule. */
export const ROTATION_MAX_PER_WINDOW = 3;

/** The window `ROTATION_MAX_PER_WINDOW` is counted over. */
export const ROTATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Field limits
// ---------------------------------------------------------------------------

/** X user ids are numeric strings; the value exceeds JS safe-integer range. */
export const X_USER_ID_PATTERN = /^[0-9]{1,20}$/;

/** X handles: 1-15 characters, letters, digits and underscore. */
export const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

/** Longest base64 signature the registry will accept. */
export const MAX_SIGNATURE_LENGTH = 2048;
