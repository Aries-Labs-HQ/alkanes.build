import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isSessionConfigured,
  issueSession,
  MIN_SESSION_SECRET_LENGTH,
  readSessionCookie,
  requireXSession,
} from "@/lib/registry/x-session";
import { REGISTRY_ENV, SESSION_COOKIE } from "@/lib/registry/config";

const SECRET = "0123456789abcdef0123456789abcdef0123";
const OTHER_SECRET = "fedcba9876543210fedcba9876543210fedc";
const X_USER_ID = "1234567890123456789";
const X_HANDLE = "alkanes_builder";

const original = process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET];

beforeEach(() => {
  process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET] = SECRET;
});
afterEach(() => {
  if (original === undefined) delete process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET];
  else process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET] = original;
});

function cookieRequest(value?: string) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "cookie" && value !== undefined
          ? `${SESSION_COOKIE}=${encodeURIComponent(value)}`
          : null,
    },
  };
}

describe("registry X session", () => {
  describe("positive control", () => {
    it("round-trips an issued session", () => {
      const cookie = issueSession(X_USER_ID, X_HANDLE)!;
      const result = readSessionCookie(cookie);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.session.xUserId).toBe(X_USER_ID);
        expect(result.session.xHandle).toBe(X_HANDLE);
        expect(result.session.expiresAt).toBeGreaterThan(Date.now());
      }
    });

    it("reads the session off a request cookie", () => {
      const cookie = issueSession(X_USER_ID, X_HANDLE)!;
      const result = requireXSession(cookieRequest(cookie));
      expect(result.ok).toBe(true);
    });
  });

  describe("negative controls", () => {
    it("rejects a forged payload", () => {
      const cookie = issueSession(X_USER_ID, X_HANDLE)!;
      const [, signature] = cookie.split(".");

      // Same signature, different claimed identity.
      const forged = Buffer.from(
        JSON.stringify({
          xUserId: "9999999999",
          xHandle: "someone_else",
          expiresAt: Date.now() + 60_000,
        })
      )
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const result = readSessionCookie(`${forged}.${signature}`);
      expect(result.ok).toBe(false);
      expect((result as any).status).toBe(401);
    });

    it("rejects a session signed with a different secret", () => {
      const cookie = issueSession(X_USER_ID, X_HANDLE)!;
      process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET] = OTHER_SECRET;

      const result = readSessionCookie(cookie);
      expect(result.ok).toBe(false);
      expect((result as any).status).toBe(401);
    });

    it("rejects an expired session", () => {
      const cookie = issueSession(X_USER_ID, X_HANDLE, Date.now() - 60 * 60 * 1000)!;
      const result = readSessionCookie(cookie);

      expect(result.ok).toBe(false);
      expect((result as any).error).toContain("expired");
    });

    it("rejects a missing or malformed cookie", () => {
      for (const value of [undefined, "", "nodot", "a.b.c.d", "..", "x."]) {
        const result = readSessionCookie(value as string | undefined);
        expect(result.ok, String(value)).toBe(false);
      }
    });

    it("fails closed when no secret is configured", () => {
      delete process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET];

      expect(isSessionConfigured()).toBe(false);
      expect(issueSession(X_USER_ID, X_HANDLE)).toBeNull();

      const result = readSessionCookie("anything");
      expect(result.ok).toBe(false);
      expect((result as any).status).toBe(503);
    });

    it("treats a short secret as absent", () => {
      process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET] = "x".repeat(
        MIN_SESSION_SECRET_LENGTH - 1
      );
      expect(isSessionConfigured()).toBe(false);
      expect((readSessionCookie("anything") as any).status).toBe(503);
    });

    it("refuses to issue for a non-numeric user id or a bad handle", () => {
      expect(issueSession("not-numeric", X_HANDLE)).toBeNull();
      expect(issueSession("", X_HANDLE)).toBeNull();
      expect(issueSession(X_USER_ID, "has spaces")).toBeNull();
      expect(issueSession(X_USER_ID, "waaaaaaaaaaaaaaaytoolong")).toBeNull();
    });
  });
});
