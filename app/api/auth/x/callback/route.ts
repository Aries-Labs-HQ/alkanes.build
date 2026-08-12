import { NextRequest, NextResponse } from "next/server";
import { REGISTRY_ENV } from "@/lib/registry/config";

/**
 * GET /api/auth/x/callback — STUB. Not implemented, deliberately.
 *
 * Pair of app/api/auth/x/start/route.ts. See that file for why this is unbuilt.
 *
 * TODO(x-oauth): implement the authorization-code + PKCE callback leg.
 *   1. Read `state` and `code` from the query string.
 *   2. Read the state cookie named by OAUTH_STATE_COOKIE. REJECT unless the
 *      `state` values match — this is the CSRF control, not a formality — then
 *      clear the cookie so it cannot be replayed.
 *   3. POST https://api.x.com/2/oauth2/token with grant_type=authorization_code,
 *      the code, the redirect_uri, the stored code_verifier, and HTTP Basic
 *      auth of <X_OAUTH_CLIENT_ID>:<X_OAUTH_CLIENT_SECRET>.
 *   4. GET https://api.x.com/2/users/me with the access token. Take `data.id`
 *      (the NUMERIC id — canonical, immutable) and `data.username` (the
 *      handle — a snapshot, display only, never an identifier).
 *   5. Discard the access token. The registry reads the identity once and
 *      never acts on the account; there is nothing to keep.
 *   6. issueSession(id, username) from lib/registry/x-session.ts, set it as
 *      the SESSION_COOKIE with httpOnly, secure, SameSite=Lax and a Max-Age
 *      matching SESSION_TTL_MS, then redirect back to the wizard at /signup.
 *
 * Note there is no user table to create a row in: registration itself writes
 * the RegistryBuilder record, and the session is a signed cookie rather than a
 * server-side row.
 */
export async function GET(_request: NextRequest) {
  const missing = [
    REGISTRY_ENV.X_OAUTH_CLIENT_ID,
    REGISTRY_ENV.X_OAUTH_CLIENT_SECRET,
    REGISTRY_ENV.X_OAUTH_REDIRECT_URI,
    REGISTRY_ENV.REGISTRY_SESSION_SECRET,
  ].filter((name) => !process.env[name]);

  return NextResponse.json(
    {
      error: "X sign-in is not available yet",
      detail:
        "The OAuth callback leg is a stub. See the TODO in app/api/auth/x/callback/route.ts.",
      requiredEnv: missing,
    },
    { status: 501 }
  );
}
