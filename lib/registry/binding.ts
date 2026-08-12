/**
 * Server-side helpers for builder wallet bindings.
 *
 * Two things live here rather than in the route handlers: the shared shape of
 * a signed binding request, and the rotation rate-limit policy.
 */

import { prisma } from "@/lib/prisma";
import { verifySignedAction } from "@/lib/request-auth";
import { SIGNING_ACTIONS, type SigningAction } from "@/lib/signing-message";
import {
  MAX_SIGNATURE_LENGTH,
  ROTATION_MAX_PER_WINDOW,
  ROTATION_MIN_INTERVAL_MS,
  ROTATION_WINDOW_MS,
} from "@/lib/registry/config";

export const WALLET_TYPES = ["SUBFROST", "UNISAT", "OTHER"] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

export function isWalletType(value: unknown): value is WalletType {
  return (
    typeof value === "string" && (WALLET_TYPES as readonly string[]).includes(value)
  );
}

export interface BindingRequest {
  address?: unknown;
  walletType?: unknown;
  signature?: unknown;
  issuedAt?: unknown;
  nonce?: unknown;
}

export type BindingCheck =
  | {
      ok: true;
      address: string;
      walletType: WalletType;
      signature: string;
      /** The exact message the signature was checked against. */
      message: string;
      nonce: string;
      issuedAt: Date;
    }
  | { ok: false; status: number; error: string };

/**
 * Verify a wallet binding request.
 *
 * The signature is checked against the canonical message for THIS action,
 * bound to the builder's X user id — so a signature collected for a
 * registration cannot be replayed as a rotation, nor a rotation on one
 * account replayed onto another.
 */
export async function verifyBindingRequest(
  action: Extract<
    SigningAction,
    typeof SIGNING_ACTIONS.BUILDER_REGISTER | typeof SIGNING_ACTIONS.BUILDER_ROTATE
  >,
  xUserId: string,
  body: BindingRequest,
  now: number = Date.now()
): Promise<BindingCheck> {
  const { address, walletType, signature, issuedAt, nonce } = body;

  if (!isWalletType(walletType)) {
    return {
      ok: false,
      status: 400,
      error: `walletType must be one of: ${WALLET_TYPES.join(", ")}`,
    };
  }
  if (typeof signature !== "string" || signature.length > MAX_SIGNATURE_LENGTH) {
    return { ok: false, status: 400, error: "Missing or oversized signature" };
  }

  const auth = await verifySignedAction({
    action,
    address,
    signature,
    issuedAt,
    nonce,
    // Binds the signature to the X identity being claimed.
    resource: `x:${xUserId}`,
    params: { walletType },
    now,
  });

  if (!auth.ok) return auth;

  return {
    ok: true,
    address: address as string,
    walletType,
    signature,
    message: auth.message,
    nonce: nonce as string,
    issuedAt: new Date(Number(issuedAt)),
  };
}

export type RotationLimit =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Rotation rate limit, read from the binding history rather than from a
 * counter — the history is append-only, so it cannot disagree with itself.
 */
export async function checkRotationLimit(
  builderId: string,
  now: number = Date.now()
): Promise<RotationLimit> {
  const recent = await prisma.registryWalletBinding.findMany({
    where: {
      builderId,
      action: "ROTATE",
      createdAt: { gte: new Date(now - ROTATION_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (recent.length > 0) {
    const since = now - recent[0].createdAt.getTime();
    if (since < ROTATION_MIN_INTERVAL_MS) {
      const hours = Math.ceil((ROTATION_MIN_INTERVAL_MS - since) / 3_600_000);
      return {
        ok: false,
        status: 429,
        error: `Wallet was rotated too recently. Try again in ${hours} hour${hours === 1 ? "" : "s"}.`,
      };
    }
  }

  if (recent.length >= ROTATION_MAX_PER_WINDOW) {
    return {
      ok: false,
      status: 429,
      error: `Too many wallet rotations in the last 30 days (limit ${ROTATION_MAX_PER_WINDOW}).`,
    };
  }

  return { ok: true };
}

/** The public shape of a builder record. History included — rotations are public. */
export function publicBuilder(builder: {
  id: string;
  xUserId: string;
  xHandle: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  bindings: Array<{
    address: string;
    walletType: string;
    action: string;
    createdAt: Date;
    supersededAt: Date | null;
  }>;
}) {
  const live = builder.bindings.find((b) => b.supersededAt === null) ?? null;
  return {
    id: builder.id,
    xUserId: builder.xUserId,
    xHandle: builder.xHandle,
    status: builder.status,
    wallet: live
      ? {
          address: live.address,
          walletType: live.walletType,
          boundAt: live.createdAt,
        }
      : null,
    // Deliberately public: a wallet swap on a public identity should be
    // visible, and the signature history is what makes the record auditable.
    walletHistory: builder.bindings.map((b) => ({
      address: b.address,
      walletType: b.walletType,
      action: b.action,
      boundAt: b.createdAt,
      supersededAt: b.supersededAt,
    })),
    createdAt: builder.createdAt,
    updatedAt: builder.updatedAt,
  };
}
