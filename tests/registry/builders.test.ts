// @vitest-environment node
//
// Node, not happy-dom: `cookie` is a forbidden header name in the browser
// fetch spec, and happy-dom's Headers implementation strips it. Under
// happy-dom every session-authenticated request here would arrive
// unauthenticated and the tests would pass for the wrong reason.
/**
 * Builder registration and wallet rotation.
 *
 * Real keys, real BIP-322 signatures, real canonical messages. The negatives
 * fail because the cryptography or the session check rejects them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registryBuilder: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      upsert: vi.fn(),
    },
    registryWalletBinding: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  default: {},
}));

import { POST as REGISTER, GET as READ_ME } from "@/app/api/registry/builders/route";
import { POST as ROTATE } from "@/app/api/registry/builders/rotate/route";
import { prisma } from "@/lib/prisma";
import { issueSession } from "@/lib/registry/x-session";
import { REGISTRY_ENV, SESSION_COOKIE } from "@/lib/registry/config";
import { buildSigningMessage, SIGNING_ACTIONS } from "@/lib/signing-message";
import { p2trWallet, testNonce } from "../helpers/bip322-signer";

const SECRET = "0123456789abcdef0123456789abcdef0123";
const X_USER_ID = "1234567890123456789";
const X_HANDLE = "alkanes_builder";
const OTHER_X_USER_ID = "9876543210987654321";

const wallet = p2trWallet("9a".repeat(32));
const newWallet = p2trWallet("8b".repeat(32));

const mockBuilder = prisma.registryBuilder as any;
const mockBinding = prisma.registryWalletBinding as any;
const mockTx = prisma.$transaction as any;

const original = process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET];
beforeEach(() => {
  vi.clearAllMocks();
  process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET] = SECRET;
});
afterEach(() => {
  if (original === undefined) delete process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET];
  else process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET] = original;
});

function signedBody(
  action: typeof SIGNING_ACTIONS.BUILDER_REGISTER | typeof SIGNING_ACTIONS.BUILDER_ROTATE,
  w: { address: string; sign(m: string): string },
  xUserId = X_USER_ID,
  nonceSeed = "1"
) {
  const issuedAt = Date.now();
  const nonce = testNonce(nonceSeed);
  const message = buildSigningMessage({
    action,
    address: w.address,
    resource: `x:${xUserId}`,
    params: { walletType: "SUBFROST" },
    issuedAt,
    nonce,
  });
  return {
    address: w.address,
    walletType: "SUBFROST",
    signature: w.sign(message),
    issuedAt,
    nonce,
  };
}

function req(url: string, body: unknown, session?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers.cookie = `${SESSION_COOKIE}=${session}`;
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const validSession = () => issueSession(X_USER_ID, X_HANDLE)!;

const builderRow = (bindings: any[] = []) => ({
  id: "builder-1",
  xUserId: X_USER_ID,
  xHandle: X_HANDLE,
  status: "ACTIVE",
  createdAt: new Date(),
  updatedAt: new Date(),
  bindings,
});

const liveBinding = {
  id: "binding-1",
  address: wallet.address,
  walletType: "SUBFROST",
  action: "REGISTER",
  createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  supersededAt: null,
};

describe("POST /api/registry/builders — registration", () => {
  describe("negative controls", () => {
    it("rejects a request with no X session", async () => {
      const res = await REGISTER(
        req("http://localhost/api/registry/builders", signedBody(SIGNING_ACTIONS.BUILDER_REGISTER, wallet))
      );
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toContain("X account");
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("is unavailable, not open, when no session secret is configured", async () => {
      delete process.env[REGISTRY_ENV.REGISTRY_SESSION_SECRET];

      const res = await REGISTER(
        req("http://localhost/api/registry/builders", signedBody(SIGNING_ACTIONS.BUILDER_REGISTER, wallet), "anything")
      );

      expect(res.status).toBe(503);
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("rejects a valid session with no wallet signature", async () => {
      mockBuilder.findUnique.mockResolvedValue(null);

      const res = await REGISTER(
        req("http://localhost/api/registry/builders", { walletType: "SUBFROST" }, validSession())
      );

      expect(res.status).toBe(400);
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("rejects a signature bound to a DIFFERENT X account", async () => {
      mockBuilder.findUnique.mockResolvedValue(null);

      // Signed for someone else's X id, submitted under this session.
      const res = await REGISTER(
        req(
          "http://localhost/api/registry/builders",
          signedBody(SIGNING_ACTIONS.BUILDER_REGISTER, wallet, OTHER_X_USER_ID),
          validSession()
        )
      );

      expect(res.status).toBe(401);
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("rejects a rotate signature replayed as a registration", async () => {
      mockBuilder.findUnique.mockResolvedValue(null);

      const res = await REGISTER(
        req(
          "http://localhost/api/registry/builders",
          signedBody(SIGNING_ACTIONS.BUILDER_ROTATE, wallet),
          validSession()
        )
      );

      expect(res.status).toBe(401);
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("rejects a signature by a wallet other than the one named", async () => {
      mockBuilder.findUnique.mockResolvedValue(null);

      const body = signedBody(SIGNING_ACTIONS.BUILDER_REGISTER, wallet);
      body.address = newWallet.address; // claim a wallet that did not sign

      const res = await REGISTER(
        req("http://localhost/api/registry/builders", body, validSession())
      );

      expect(res.status).toBe(401);
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("rejects an unknown wallet type", async () => {
      mockBuilder.findUnique.mockResolvedValue(null);

      const body = { ...signedBody(SIGNING_ACTIONS.BUILDER_REGISTER, wallet), walletType: "LEDGER" };
      const res = await REGISTER(
        req("http://localhost/api/registry/builders", body, validSession())
      );

      expect(res.status).toBe(400);
    });

    it("refuses a second registration for an account that already has a wallet", async () => {
      mockBuilder.findUnique.mockResolvedValue(builderRow([liveBinding]));

      const res = await REGISTER(
        req("http://localhost/api/registry/builders", signedBody(SIGNING_ACTIONS.BUILDER_REGISTER, wallet), validSession())
      );
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toContain("rotation");
      expect(mockTx).not.toHaveBeenCalled();
    });
  });

  describe("positive control", () => {
    it("registers with a valid session and a real signature", async () => {
      mockBuilder.findUnique.mockResolvedValue(null);
      const created = builderRow([liveBinding]);
      mockTx.mockImplementation(async (fn: any) =>
        fn({
          registryBuilder: {
            upsert: vi.fn().mockResolvedValue({ id: "builder-1" }),
            findUniqueOrThrow: vi.fn().mockResolvedValue(created),
          },
          registryWalletBinding: { create: vi.fn() },
        })
      );

      const res = await REGISTER(
        req("http://localhost/api/registry/builders", signedBody(SIGNING_ACTIONS.BUILDER_REGISTER, wallet), validSession())
      );
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.builder.xUserId).toBe(X_USER_ID);
      expect(data.builder.wallet.address).toBe(wallet.address);
      expect(mockTx).toHaveBeenCalled();
    });
  });
});

describe("GET /api/registry/builders — own record", () => {
  it("requires the X session", async () => {
    const res = await READ_ME(new NextRequest("http://localhost/api/registry/builders"));
    expect(res.status).toBe(401);
  });

  it("returns null for an unregistered account", async () => {
    mockBuilder.findUnique.mockResolvedValue(null);

    const res = await READ_ME(
      new NextRequest("http://localhost/api/registry/builders", {
        headers: { cookie: `${SESSION_COOKIE}=${validSession()}` },
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.builder).toBeNull();
  });

  it("exposes the full rotation history — rotations are public", async () => {
    const superseded = {
      ...liveBinding,
      id: "binding-0",
      address: "bc1qold",
      supersededAt: new Date(),
    };
    mockBuilder.findUnique.mockResolvedValue(builderRow([liveBinding, superseded]));

    const res = await READ_ME(
      new NextRequest("http://localhost/api/registry/builders", {
        headers: { cookie: `${SESSION_COOKIE}=${validSession()}` },
      })
    );
    const data = await res.json();

    expect(data.builder.wallet.address).toBe(wallet.address);
    expect(data.builder.walletHistory).toHaveLength(2);
    expect(data.builder.walletHistory.map((b: any) => b.address)).toContain("bc1qold");
  });
});

describe("POST /api/registry/builders/rotate", () => {
  beforeEach(() => {
    mockBinding.findMany.mockResolvedValue([]);
  });

  describe("negative controls", () => {
    it("rejects a rotation with no X session — the new wallet's signature is not enough", async () => {
      const res = await ROTATE(
        req("http://localhost/api/registry/builders/rotate", signedBody(SIGNING_ACTIONS.BUILDER_ROTATE, newWallet))
      );

      expect(res.status).toBe(401);
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("rejects a rotation with a session but no valid signature — the session is not enough either", async () => {
      mockBuilder.findUnique.mockResolvedValue(builderRow([liveBinding]));

      const res = await ROTATE(
        req("http://localhost/api/registry/builders/rotate", { walletType: "SUBFROST" }, validSession())
      );

      expect(res.status).toBe(400);
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("rejects a registration signature replayed as a rotation", async () => {
      mockBuilder.findUnique.mockResolvedValue(builderRow([liveBinding]));

      const res = await ROTATE(
        req(
          "http://localhost/api/registry/builders/rotate",
          signedBody(SIGNING_ACTIONS.BUILDER_REGISTER, newWallet),
          validSession()
        )
      );

      expect(res.status).toBe(401);
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("404s when there is nothing to rotate", async () => {
      mockBuilder.findUnique.mockResolvedValue(null);

      const res = await ROTATE(
        req("http://localhost/api/registry/builders/rotate", signedBody(SIGNING_ACTIONS.BUILDER_ROTATE, newWallet), validSession())
      );

      expect(res.status).toBe(404);
    });

    it("rate limits a rotation that is too soon after the last one", async () => {
      mockBuilder.findUnique.mockResolvedValue(builderRow([liveBinding]));
      mockBinding.findMany.mockResolvedValue([
        { createdAt: new Date(Date.now() - 60 * 60 * 1000) }, // an hour ago
      ]);

      const res = await ROTATE(
        req("http://localhost/api/registry/builders/rotate", signedBody(SIGNING_ACTIONS.BUILDER_ROTATE, newWallet), validSession())
      );
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.error).toContain("too recently");
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("rate limits after too many rotations in the window", async () => {
      mockBuilder.findUnique.mockResolvedValue(builderRow([liveBinding]));
      const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mockBinding.findMany.mockResolvedValue([
        { createdAt: old },
        { createdAt: old },
        { createdAt: old },
      ]);

      const res = await ROTATE(
        req("http://localhost/api/registry/builders/rotate", signedBody(SIGNING_ACTIONS.BUILDER_ROTATE, newWallet), validSession())
      );
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.error).toContain("Too many");
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("rejects rotating to the wallet that is already bound", async () => {
      mockBuilder.findUnique.mockResolvedValue(builderRow([liveBinding]));

      const res = await ROTATE(
        req("http://localhost/api/registry/builders/rotate", signedBody(SIGNING_ACTIONS.BUILDER_ROTATE, wallet), validSession())
      );

      expect(res.status).toBe(400);
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("refuses a suspended record", async () => {
      mockBuilder.findUnique.mockResolvedValue({
        ...builderRow([liveBinding]),
        status: "SUSPENDED",
      });

      const res = await ROTATE(
        req("http://localhost/api/registry/builders/rotate", signedBody(SIGNING_ACTIONS.BUILDER_ROTATE, newWallet), validSession())
      );

      expect(res.status).toBe(403);
      expect(mockTx).not.toHaveBeenCalled();
    });
  });

  describe("positive control", () => {
    it("supersedes rather than overwrites, and keeps the history", async () => {
      mockBuilder.findUnique.mockResolvedValue(builderRow([liveBinding]));

      const bindingUpdate = vi.fn();
      const bindingCreate = vi.fn();
      const after = builderRow([
        { ...liveBinding, id: "binding-2", address: newWallet.address, action: "ROTATE" },
        { ...liveBinding, supersededAt: new Date() },
      ]);
      mockTx.mockImplementation(async (fn: any) =>
        fn({
          registryWalletBinding: { update: bindingUpdate, create: bindingCreate },
          registryBuilder: { findUniqueOrThrow: vi.fn().mockResolvedValue(after) },
        })
      );

      const res = await ROTATE(
        req("http://localhost/api/registry/builders/rotate", signedBody(SIGNING_ACTIONS.BUILDER_ROTATE, newWallet), validSession())
      );
      const data = await res.json();

      expect(res.status).toBe(200);

      // The old row is stamped, never deleted or mutated in place.
      expect(bindingUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "binding-1" },
          data: expect.objectContaining({ supersededAt: expect.any(Date) }),
        })
      );
      // The new row records what it replaced.
      expect(bindingCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            address: newWallet.address,
            action: "ROTATE",
            supersedesId: "binding-1",
          }),
        })
      );
      expect(data.builder.walletHistory.length).toBe(2);
    });
  });
});
