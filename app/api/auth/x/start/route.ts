import { NextRequest, NextResponse } from "next/server";
import { REGISTRY_ENV, REQUIRED_X_SCOPES } from "@/lib/registry/config";

/**
 * GET /api/auth/x/start — STUB. Not implemented, deliberately.
 *
 * This mission was explicitly not to create an X app or account, so the OAuth
 * exchange is left unbuilt. Everything downstream of it is real: once this
 * route and its callback are filled in, `issueSession` in
 * lib/registry/x-session.ts mints the cookie and registration works.
 *
 * The route answers 501 rather than 404 so the gap is legible, and it reports
 * exactly which environment variables are missing so an operator wiring it up
 * gets a checklist rather than a mystery.
 *
 * TODO(x-oauth): implement the authorization-code + PKCE start leg.
 *   1. Generate a cryptographically random `state` and a PKCE `code_verifier`.
 *   2. Store both in the short-lived, httpOnly, SameSite=Lax cookie named by
 *      OAUTH_STATE_COOKIE in lib/registry/config.ts. They must NOT go in the
 *      URL or in localStorage.
 *   3. Redirect to https://x.com/i/oauth2/authorize with:
 *        response_type=code
 *        client_id=<X_OAUTH_CLIENT_ID>
 *        redirect_uri=<X_OAUTH_REDIRECT_URI>   (must match the app config byte for byte)
 *        scope=<X_OAUTH_SCOPES, default REQUIRED_X_SCOPES>
 *        state=<state>
 *        code_challenge=<S256(code_verifier)>
 *        code_challenge_method=S256
 *   4. Do not request offline.access — the registry reads the identity once
 *      and never acts on the account, so there is no refresh token to hold.
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
        "The OAuth start leg is a stub. See the TODO in app/api/auth/x/start/route.ts.",
      requiredEnv: missing,
      defaultScopes: REQUIRED_X_SCOPES,
    },
    { status: 501 }
  );
}
