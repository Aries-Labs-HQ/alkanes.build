import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireXSession } from "@/lib/registry/x-session";
import {
  checkRotationLimit,
  publicBuilder,
  verifyBindingRequest,
} from "@/lib/registry/binding";
import { SIGNING_ACTIONS } from "@/lib/signing-message";
import { isUniqueViolation } from "@/lib/registry/prisma-errors";

/**
 * POST /api/registry/builders/rotate
 *
 * Replace the wallet on an existing builder record.
 *
 * Both halves are required, as the mission specifies:
 *   - the NEW wallet signs the canonical `builder:rotate` message, bound to
 *     this X user id; and
 *   - the X session authorises it.
 *
 * The old wallet is deliberately NOT asked to sign. A rotation exists for the
 * case where the old key is gone — requiring it would make the flow useless
 * exactly when it is needed. The X session is what stands in its place, which
 * is why rotations are rate limited and permanently visible on the record.
 *
 * The previous binding is superseded, never overwritten: a new row is written
 * and the old one is stamped `supersededAt` and linked from the new row. The
 * whole history, with every signature, is retained and public.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireXSession(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { xUserId } = auth.session;

    const body = await request.json();

    const builder = await prisma.registryBuilder.findUnique({
      where: { xUserId },
      include: { bindings: { where: { supersededAt: null } } },
    });

    if (!builder || builder.bindings.length === 0) {
      return NextResponse.json(
        { error: "No registered wallet to rotate. Register first." },
        { status: 404 }
      );
    }
    if (builder.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This builder record is suspended." },
        { status: 403 }
      );
    }

    const limit = await checkRotationLimit(builder.id);
    if (!limit.ok) {
      return NextResponse.json(
        { error: limit.error },
        { status: limit.status }
      );
    }

    const check = await verifyBindingRequest(
      SIGNING_ACTIONS.BUILDER_ROTATE,
      xUserId,
      body ?? {}
    );
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error },
        { status: check.status }
      );
    }

    const current = builder.bindings[0];
    if (current.address === check.address) {
      return NextResponse.json(
        { error: "That wallet is already the registered one." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Supersede first: the partial unique index allows only one live binding
      // per builder, so the insert below would be rejected otherwise. That is
      // the intended ordering, and it is the database — not this code — that
      // guarantees two concurrent rotations cannot both win.
      await tx.registryWalletBinding.update({
        where: { id: current.id },
        data: { supersededAt: new Date() },
      });

      await tx.registryWalletBinding.create({
        data: {
          builderId: builder.id,
          address: check.address,
          walletType: check.walletType,
          signature: check.signature,
          signedMessage: check.message,
          nonce: check.nonce,
          issuedAt: check.issuedAt,
          action: "ROTATE",
          supersedesId: current.id,
        },
      });

      return tx.registryBuilder.findUniqueOrThrow({
        where: { id: builder.id },
        include: { bindings: { orderBy: { createdAt: "desc" } } },
      });
    });

    return NextResponse.json({ builder: publicBuilder(updated) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "That wallet or signature is already registered." },
        { status: 409 }
      );
    }
    console.error("[registry] rotation failed:", error);
    return NextResponse.json({ error: "Rotation failed" }, { status: 500 });
  }
}
