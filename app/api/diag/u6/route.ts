/**
 * U-6 closure harness — server side. STAGING ONLY.
 *
 * Everything the connect surface assumes about SUBFROST's signMessage — its
 * call signature, its return shape, which address types it covers, and whether
 * its output verifies against lib/bip322.ts — is INFERRED. No SUBFROST
 * extension exists on the box this was written on, so none of it has ever been
 * executed against the real thing. This route exists so an operator who does
 * have the extension can settle it in one page load.
 *
 * It is gated OFF by default and answers 404 unless U6_DIAGNOSTIC=on, it is
 * linked from nothing, and it must never reach a branch destined for upstream.
 *
 * It reads exactly four fields from the request and returns a verification
 * verdict. It touches no database, enumerates no environment, reaches no
 * network, and returns nothing it was not given.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyMessageSignature } from "@/lib/bip322";

const ENABLED = process.env.U6_DIAGNOSTIC === "on";

type Verdict = {
  pass: boolean;
  detail: string;
  observations: Record<string, string | number | boolean | null>;
};

function networkForAddress(address: string): "mainnet" | "testnet" | null {
  if (/^bc1[qp]/.test(address)) return "mainnet";
  if (/^tb1[qp]/.test(address)) return "testnet";
  return null;
}

/** Everything that can be said about a signature string without verifying it. */
function describeSignature(signature: string): Record<string, string | number | boolean | null> {
  const looksBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(signature);
  const looksHex = /^[0-9a-fA-F]+$/.test(signature) && signature.length % 2 === 0;

  let decodedLength: number | null = null;
  let decodedPrefixHex: string | null = null;
  try {
    const buf = Buffer.from(signature, looksHex && !looksBase64 ? "hex" : "base64");
    decodedLength = buf.length;
    decodedPrefixHex = buf.subarray(0, 8).toString("hex");
  } catch {
    /* leave null */
  }

  return {
    length: signature.length,
    looksBase64,
    looksHex,
    decodedLength,
    decodedPrefixHex,
    // 65 bytes is the recoverable-ECDSA shape many wallets return for a plain
    // "signMessage"; a full BIP-322 proof is a serialised witness transaction
    // and is much longer.
    shape:
      decodedLength === 65
        ? "65-byte recoverable ECDSA (NOT bip322-simple)"
        : decodedLength === 64
          ? "64-byte compact signature"
          : decodedLength !== null && decodedLength > 80
            ? "long — consistent with a BIP-322 witness transaction"
            : "unrecognised",
  };
}

export async function POST(request: NextRequest) {
  if (!ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message : null;
  const address = typeof body.address === "string" ? body.address : null;
  const signature = typeof body.signature === "string" ? body.signature : null;
  const publicKey = typeof body.publicKey === "string" ? body.publicKey : undefined;

  if (!message || !address || !signature) {
    return NextResponse.json(
      { error: "message, address and signature are all required" },
      { status: 400 }
    );
  }

  const network = networkForAddress(address);
  const observations = {
    ...describeSignature(signature),
    address,
    addressType: address.startsWith("bc1p") || address.startsWith("tb1p")
      ? "P2TR (taproot)"
      : address.startsWith("bc1q") || address.startsWith("tb1q")
        ? "P2WPKH (native segwit)"
        : "unsupported by lib/request-auth.ts",
    network: network ?? "unrecognised",
    publicKeySupplied: publicKey !== undefined,
    messageLength: message.length,
  };

  if (network === null) {
    const verdict: Verdict = {
      pass: false,
      detail:
        "Address prefix is not one lib/request-auth.ts accepts. It routes only " +
        "bc1q/tb1q (P2WPKH) and bc1p/tb1p (P2TR); everything else is rejected " +
        "before verification, so this wallet's default address type would fail " +
        "authentication regardless of whether the signature itself is valid.",
      observations,
    };
    return NextResponse.json(verdict);
  }

  // The real question: does what the wallet returned verify against the
  // repository's own verifier, called exactly as lib/request-auth.ts calls it?
  let verifiedWithoutKey = false;
  let errorWithoutKey: string | null = null;
  try {
    verifiedWithoutKey = await verifyMessageSignature(message, address, signature, network);
  } catch (error) {
    errorWithoutKey = error instanceof Error ? error.message : String(error);
  }

  // Informational only: request-auth deliberately passes no public key, and the
  // verifier ignores one that does not derive the address. Running it both ways
  // tells the operator whether a supplied key would have made any difference.
  let verifiedWithKey: boolean | null = null;
  if (publicKey) {
    try {
      verifiedWithKey = await verifyMessageSignature(
        message,
        address,
        signature,
        network,
        publicKey
      );
    } catch {
      verifiedWithKey = false;
    }
  }

  const verdict: Verdict = {
    pass: verifiedWithoutKey,
    detail: verifiedWithoutKey
      ? "PASS — the signature this wallet returned verifies against lib/bip322.ts " +
        "called exactly as lib/request-auth.ts calls it (no public key supplied). " +
        "The adapter's assumption holds for this wallet and this address type."
      : errorWithoutKey
        ? `FAIL — the verifier threw: ${errorWithoutKey}`
        : "FAIL — the verifier returned false. The signature is well-formed enough " +
          "to reach it but is not a BIP-322 proof this address can be checked " +
          "against. Compare 'shape' below: a 65-byte decode means the wallet " +
          "ignored the 'bip322-simple' argument and returned a legacy recoverable " +
          "ECDSA signature instead, which is the most likely mismatch.",
    observations: {
      ...observations,
      verifiedWithoutPublicKey: verifiedWithoutKey,
      verifiedWithPublicKey: verifiedWithKey,
      publicKeyChangedOutcome:
        verifiedWithKey === null ? null : verifiedWithKey !== verifiedWithoutKey,
    },
  };

  return NextResponse.json(verdict);
}
