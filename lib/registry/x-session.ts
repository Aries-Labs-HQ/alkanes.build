/**
 * The registry's own session for an X-authenticated builder.
 *
 * SCOPE: this file is REAL and complete. What is stubbed is the OAuth exchange
 * that would mint a session — see `app/api/auth/x/*`. Once those routes are
 * filled in they call `issueSession`, and everything downstream already works.
 *
 * The session is a signed cookie, not a database row. It carries only the
 * numeric X user id and a handle snapshot, and it is verified with an HMAC
 * over the exact payload bytes, so it cannot be edited by its holder. There is
 * no server-side session table, deliberately: the registry needs to know "this
 * request proved control of X account N in the last half hour" and nothing
 * more.
 *
 * FAILS CLOSED. With `REGISTRY_SESSION_SECRET` unset, every session check
 * returns 503 — the registration and rotation routes are unavailable, not
 * open.
 */

import { createHmac, timingSafeEqual } from "crypto";
import {
  REGISTRY_ENV,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  X_HANDLE_PATTERN,
  X_USER_ID_PATTERN,
} from "@/lib/registry/config";

/** Shortest secret this module will accept as configured. */
export const MIN_SESSION_SECRET_LENGTH = 32;

export interface XSession {
  /** Numeric X user id — the canonical identity. */
  xUserId: string;
  /** Handle snapshot at authentication time. Display only. */
  xHandle: string;
  /** Unix milliseconds at which this session stops being valid. */
  expiresAt: number;
}

export type SessionResult =
  | { ok: true; session: XSession }
  | { ok: false; status: number; error: string };

function secret(): string | null {
  const value = process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET];
  return typeof value === "string" && value.length >= MIN_SESSION_SECRET_LENGTH
    ? value
    : null;
}

/** True when this deployment can mint and check sessions at all. */
export function isSessionConfigured(): boolean {
  return secret() !== null;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function mac(payload: string, key: string): string {
  return base64url(createHmac("sha256", key).update(payload).digest());
}

/**
 * Serialise a session into a cookie value: `<payload>.<hmac>`.
 *
 * Called by the OAuth callback once it has exchanged the code and read the
 * authenticated user. Returns null when the deployment has no secret.
 */
export function issueSession(
  xUserId: string,
  xHandle: string,
  now: number = Date.now()
): string | null {
  const key = secret();
  if (key === null) return null;
  if (!X_USER_ID_PATTERN.test(xUserId)) return null;
  if (!X_HANDLE_PATTERN.test(xHandle)) return null;

  const session: XSession = {
    xUserId,
    xHandle,
    expiresAt: now + SESSION_TTL_MS,
  };
  const payload = base64url(JSON.stringify(session));
  return `${payload}.${mac(payload, key)}`;
}

/** Parse and authenticate a cookie value. */
export function readSessionCookie(
  value: string | undefined,
  now: number = Date.now()
): SessionResult {
  const key = secret();
  if (key === null) {
    return {
      ok: false,
      status: 503,
      error: "Builder registration is not configured on this deployment",
    };
  }
  if (!value) {
    return { ok: false, status: 401, error: "Connect your X account first" };
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return { ok: false, status: 401, error: "Malformed session" };
  }

  const expected = mac(payload, key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Invalid session" };
  }

  let session: XSession;
  try {
    session = JSON.parse(fromBase64url(payload).toString("utf8"));
  } catch {
    return { ok: false, status: 401, error: "Malformed session" };
  }

  if (
    typeof session?.xUserId !== "string" ||
    !X_USER_ID_PATTERN.test(session.xUserId) ||
    typeof session?.xHandle !== "string" ||
    !X_HANDLE_PATTERN.test(session.xHandle) ||
    typeof session?.expiresAt !== "number"
  ) {
    return { ok: false, status: 401, error: "Malformed session" };
  }

  if (session.expiresAt <= now) {
    return {
      ok: false,
      status: 401,
      error: "Your X session has expired. Connect again.",
    };
  }

  return { ok: true, session };
}

/**
 * Pull one cookie out of a raw `Cookie:` header.
 *
 * Done by hand rather than through `NextRequest.cookies` because that accessor
 * is not populated in every runtime this code is exercised in — it returns
 * nothing under the test environment, which would have made every
 * session-authenticated test silently pass as "unauthenticated".
 */
export function cookieValue(
  header: string | null | undefined,
  name: string
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export interface SessionCarrier {
  headers: { get(name: string): string | null };
  cookies?: { get(name: string): { value: string } | undefined };
}

/** Read and authenticate the session on an incoming request. */
export function requireXSession(
  request: SessionCarrier,
  now: number = Date.now()
): SessionResult {
  const value =
    cookieValue(request.headers.get("cookie"), SESSION_COOKIE) ??
    request.cookies?.get(SESSION_COOKIE)?.value;
  return readSessionCookie(value, now);
}
