import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireXSession } from "@/lib/registry/x-session";
import {
  publicBuilder,
  verifyBindingRequest,
} from "@/lib/registry/binding";
import { SIGNING_ACTIONS } from "@/lib/signing-message";
import { X_HANDLE_PATTERN } from "@/lib/registry/config";
import { isUniqueViolation } from "@/lib/registry/prisma-errors";

/**
 * GET /api/registry/builders
 *
 * The caller's own builder record, or `{ builder: null }` if they have not
 * registered. Requires the X session — this is not the public directory, which
 * is a separate, later piece of work.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireXSession(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const builder = await prisma.registryBuilder.findUnique({
      where: { xUserId: auth.session.xUserId },
      include: { bindings: { orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json({
      builder: builder ? publicBuilder(builder) : null,
    });
  } catch (error) {
    console.error("[registry] failed to read builder:", error);
    return NextResponse.json(
      { error: "Failed to read builder record" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/registry/builders
 *
 * Register: bind a wallet to an X account, once.
 *
 * Two proofs are required and neither substitutes for the other:
 *   - control of the X account, via the registry session (see
 *     lib/registry/x-session.ts); and
 *   - control of the wallet, via a BIP-322 signature over the canonical
 *     `builder:register` message, bound to that X user id.
 *
 * The X user id comes from the session, never from the request body — a caller
 * cannot register a wallet against somebody else's account by naming it.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireXSession(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { xUserId, xHandle } = auth.session;

    const body = await request.json();

    const existing = await prisma.registryBuilder.findUnique({
      where: { xUserId },
      include: { bindings: { where: { supersededAt: null } } },
    });
    if (existing && existing.bindings.length > 0) {
      return NextResponse.json(
        {
          error:
            "This X account already has a registered wallet. Use the rotation flow to change it.",
        },
        { status: 409 }
      );
    }

    const check = await verifyBindingRequest(
      SIGNING_ACTIONS.BUILDER_REGISTER,
      xUserId,
      body ?? {}
    );
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error },
        { status: check.status }
      );
    }

    // The handle is a snapshot; keep the freshest one the session has seen.
    const handle = X_HANDLE_PATTERN.test(xHandle) ? xHandle : "unknown";

    const builder = await prisma.$transaction(async (tx) => {
      const record = await tx.registryBuilder.upsert({
        where: { xUserId },
        create: { xUserId, xHandle: handle },
        update: { xHandle: handle, xHandleUpdatedAt: new Date() },
      });

      await tx.registryWalletBinding.create({
        data: {
          builderId: record.id,
          address: check.address,
          walletType: check.walletType,
          signature: check.signature,
          signedMessage: check.message,
          nonce: check.nonce,
          issuedAt: check.issuedAt,
          action: "REGISTER",
        },
      });

      return tx.registryBuilder.findUniqueOrThrow({
        where: { id: record.id },
        include: { bindings: { orderBy: { createdAt: "desc" } } },
      });
    });

    return NextResponse.json(
      { builder: publicBuilder(builder) },
      { status: 201 }
    );
  } catch (error) {
    // The database enforces "one live binding per builder" and "one live
    // binding per address" with partial unique indexes, and the nonce with a
    // plain unique index, so a race or a replay lands here rather than
    // producing a second live row.
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "That wallet or signature is already registered." },
        { status: 409 }
      );
    }
    console.error("[registry] registration failed:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
