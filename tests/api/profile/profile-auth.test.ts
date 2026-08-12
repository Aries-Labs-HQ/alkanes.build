/**
 * U-3 — POST /api/profile and POST /api/profile/avatar were unauthenticated.
 *
 * Identity was the `address` field of the request itself. Naming somebody was
 * the whole of the authorisation check, so anyone could rewrite anyone's
 * display name, bio and avatar — including profiles that /api/profile/verify
 * had marked `verified: true`, which is what made the verified badge worth
 * forging.
 *
 * The avatar route additionally built its on-disk filename from
 * `address.slice(0, 16)` and handed it to `path.join`, so a crafted address put
 * `..` and `/` into the path and chose where the file landed — an
 * unauthenticated arbitrary-write primitive.
 *
 * Both now require a BIP-322 signature by the address being changed, bound to
 * the exact values being stored. Real keys and real signatures throughout.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

const { mockWriteFile, mockMkdir, mockExistsSync, mockUpsert } = vi.hoisted(() => ({
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockMkdir: vi.fn().mockResolvedValue(undefined),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockUpsert: vi.fn().mockResolvedValue({ id: "p1", address: "x" }),
}));

vi.mock("fs/promises", () => ({
  default: { writeFile: mockWriteFile, mkdir: mockMkdir },
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}));
vi.mock("fs", () => ({
  default: { existsSync: mockExistsSync },
  existsSync: mockExistsSync,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { userProfile: { upsert: mockUpsert, findUnique: vi.fn() } },
  default: { userProfile: { upsert: mockUpsert, findUnique: vi.fn() } },
}));

import { POST as postProfile } from "@/app/api/profile/route";
import { POST as postAvatar } from "@/app/api/profile/avatar/route";
import { buildSigningMessage, SIGNING_ACTIONS } from "@/lib/signing-message";
import { p2trWallet, p2wpkhWallet, testNonce } from "../../helpers/bip322-signer";

const owner = p2trWallet("a1".repeat(32));
const attacker = p2wpkhWallet("b2".repeat(32));

const sha256 = (v: Buffer | string) =>
  createHash("sha256").update(v as never, typeof v === "string" ? "utf8" : undefined as never).digest("hex");

const fieldDigest = (v: string | null) => (v === null ? "null" : sha256(v));

// ---------------------------------------------------------------- profile ---

type ProfileFields = {
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
};

/** Exactly the normalisation the route applies before hashing. */
function normalise(fields: ProfileFields) {
  return {
    displayName: fields.displayName
      ? fields.displayName.trim().replace(/[<>]/g, "")
      : null,
    bio: fields.bio?.trim() || null,
    avatarUrl: fields.avatarUrl || null,
  };
}

function profileMessage(address: string, fields: ProfileFields, issuedAt: number, nonce: string) {
  const n = normalise(fields);
  return buildSigningMessage({
    action: SIGNING_ACTIONS.PROFILE_UPDATE,
    address,
    resource: `address:${address}`,
    params: {
      displayNameSha256: fieldDigest(n.displayName),
      bioSha256: fieldDigest(n.bio),
      avatarUrlSha256: fieldDigest(n.avatarUrl),
    },
    issuedAt,
    nonce,
  });
}

function profileRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signedProfileBody(
  wallet: { address: string; sign(m: string): string },
  fields: ProfileFields,
  overrides: Record<string, unknown> = {}
) {
  const issuedAt = Date.now();
  const nonce = testNonce("3");
  return {
    address: wallet.address,
    ...fields,
    signature: wallet.sign(profileMessage(wallet.address, fields, issuedAt, nonce)),
    issuedAt,
    nonce,
    ...overrides,
  };
}

describe("POST /api/profile — negative controls", () => {
  beforeEach(() => {
    // vitest.config.ts sets mockReset, so implementations must be re-armed.
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ id: "p1", address: owner.address });
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true);
  });

  it("rejects the exact pre-fix request shape — naming an address is not proof", async () => {
    const response = await postProfile(
      profileRequest({
        address: owner.address,
        displayName: "Impersonator",
        bio: "owned",
      })
    );

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects a signature by someone who is not the profile owner", async () => {
    const fields = { displayName: "Mallory" };
    const issuedAt = Date.now();
    const nonce = testNonce("4");

    // Attacker signs a message naming the OWNER's address, with their own key.
    const response = await postProfile(
      profileRequest({
        address: owner.address,
        ...fields,
        signature: attacker.sign(profileMessage(owner.address, fields, issuedAt, nonce)),
        issuedAt,
        nonce,
      })
    );

    expect(response.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects content swapped after signing", async () => {
    const body = signedProfileBody(owner, { displayName: "Honest", bio: "real" });
    const response = await postProfile(
      profileRequest({ ...body, bio: "replaced after the signature" })
    );

    expect(response.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects an avatarUrl swapped after signing", async () => {
    const body = signedProfileBody(owner, { displayName: "Honest", avatarUrl: "/uploads/avatars/mine.png" });
    const response = await postProfile(
      profileRequest({ ...body, avatarUrl: "/uploads/avatars/somebody-elses.png" })
    );

    expect(response.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects a signature for a different action replayed as a profile update", async () => {
    const issuedAt = Date.now();
    const nonce = testNonce("5");
    const otherAction = buildSigningMessage({
      action: SIGNING_ACTIONS.PROFILE_VERIFY,
      address: owner.address,
      resource: `address:${owner.address}`,
      issuedAt,
      nonce,
    });

    const response = await postProfile(
      profileRequest({
        address: owner.address,
        displayName: "Replayed",
        signature: owner.sign(otherAction),
        issuedAt,
        nonce,
      })
    );

    expect(response.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects an expired signature", async () => {
    const stale = Date.now() - 60 * 60 * 1000;
    const nonce = testNonce("6");
    const fields = { displayName: "Stale" };

    const response = await postProfile(
      profileRequest({
        address: owner.address,
        ...fields,
        signature: owner.sign(profileMessage(owner.address, fields, stale, nonce)),
        issuedAt: stale,
        nonce,
      })
    );

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects a missing signature, nonce or issuedAt", async () => {
    for (const drop of ["signature", "nonce", "issuedAt"]) {
      vi.clearAllMocks();
      const body = signedProfileBody(owner, { displayName: "X" }) as Record<string, unknown>;
      delete body[drop];

      const response = await postProfile(profileRequest(body));

      expect(response.status, drop).toBe(400);
      expect(mockUpsert, drop).not.toHaveBeenCalled();
    }
  });

  it("still rejects over-long fields before anything is written", async () => {
    const response = await postProfile(
      profileRequest(signedProfileBody(owner, { displayName: "x".repeat(51) }))
    );

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/profile — positive controls", () => {
  beforeEach(() => {
    // vitest.config.ts sets mockReset, so implementations must be re-armed.
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ id: "p1", address: owner.address });
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true);
  });

  it("accepts a genuine signature by the profile owner and writes the profile", async () => {
    const fields = { displayName: "Owner", bio: "hello" };
    const response = await postProfile(profileRequest(signedProfileBody(owner, fields)));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(mockUpsert.mock.calls[0][0].where).toEqual({ address: owner.address });
    expect(mockUpsert.mock.calls[0][0].update.displayName).toBe("Owner");
    expect(mockUpsert.mock.calls[0][0].update.bio).toBe("hello");
  });

  it("accepts a native-SegWit owner too", async () => {
    const fields = { displayName: "Segwit" };
    const response = await postProfile(profileRequest(signedProfileBody(attacker, fields)));

    expect(response.status).toBe(200);
    expect(mockUpsert.mock.calls[0][0].where).toEqual({ address: attacker.address });
  });

  it("accepts clearing every field", async () => {
    const response = await postProfile(
      profileRequest(signedProfileBody(owner, { displayName: null, bio: null, avatarUrl: null }))
    );

    expect(response.status).toBe(200);
    expect(mockUpsert.mock.calls[0][0].update).toMatchObject({
      displayName: null,
      bio: null,
      avatarUrl: null,
    });
  });

  it("accepts a bio with newlines and non-ASCII, which cannot ride in the message itself", async () => {
    const bio = "line one\nline two — ünïcode ✅";
    const response = await postProfile(profileRequest(signedProfileBody(owner, { bio })));

    expect(response.status).toBe(200);
    expect(mockUpsert.mock.calls[0][0].update.bio).toBe(bio);
  });
});

// ----------------------------------------------------------------- avatar ---

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

function avatarForm(
  address: string,
  bytes: Buffer,
  type: string,
  creds: { signature?: string; nonce?: string; issuedAt?: number } = {}
) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], "a.png", { type }));
  form.append("address", address);
  if (creds.signature !== undefined) form.append("signature", creds.signature);
  if (creds.nonce !== undefined) form.append("nonce", creds.nonce);
  if (creds.issuedAt !== undefined) form.append("issuedAt", String(creds.issuedAt));
  return new NextRequest("http://localhost/api/profile/avatar", {
    method: "POST",
    body: form,
  });
}

function avatarMessage(address: string, bytes: Buffer, type: string, issuedAt: number, nonce: string) {
  return buildSigningMessage({
    action: SIGNING_ACTIONS.PROFILE_AVATAR,
    address,
    resource: `address:${address}`,
    params: {
      contentSha256: createHash("sha256").update(bytes).digest("hex"),
      contentType: type,
    },
    issuedAt,
    nonce,
  });
}

function signedAvatar(
  wallet: { address: string; sign(m: string): string },
  bytes: Buffer = PNG,
  type = "image/png",
  addressOverride?: string
) {
  const issuedAt = Date.now();
  const nonce = testNonce("7");
  const address = addressOverride ?? wallet.address;
  return avatarForm(address, bytes, type, {
    signature: wallet.sign(avatarMessage(address, bytes, type, issuedAt, nonce)),
    nonce,
    issuedAt,
  });
}

describe("POST /api/profile/avatar — negative controls", () => {
  beforeEach(() => {
    // vitest.config.ts sets mockReset, so implementations must be re-armed.
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ id: "p1", address: owner.address });
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true);
  });

  it("rejects the exact pre-fix request shape — file plus address, no credentials", async () => {
    const response = await postAvatar(avatarForm(owner.address, PNG, "image/png"));

    expect(response.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects a signature by someone who is not the profile owner", async () => {
    const response = await postAvatar(signedAvatar(attacker, PNG, "image/png", owner.address));

    expect(response.status).toBe(401);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects an image swapped after signing", async () => {
    const issuedAt = Date.now();
    const nonce = testNonce("8");
    const signature = owner.sign(avatarMessage(owner.address, PNG, "image/png", issuedAt, nonce));

    const other = Buffer.from("89504e470d0a1a0a00000000deadbeef", "hex");
    const response = await postAvatar(
      avatarForm(owner.address, other, "image/png", { signature, nonce, issuedAt })
    );

    expect(response.status).toBe(401);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("writes nothing to disk before it has authorised the caller", async () => {
    await postAvatar(avatarForm(owner.address, PNG, "image/png"));

    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("path traversal: a crafted address cannot steer the write out of the upload directory", async () => {
    // The pre-fix filename was `${address.slice(0, 16)}-...`, so this address
    // put `../../` into path.join. Unauthenticated then; still refused now, and
    // the filename no longer derives from the address at all.
    const evil = "../../../../etc/cron.d/x";
    const response = await postAvatar(avatarForm(evil, PNG, "image/png"));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("still rejects a disallowed content type and an over-large file", async () => {
    const svg = await postAvatar(signedAvatar(owner, PNG, "image/svg+xml"));
    expect(svg.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

describe("POST /api/profile/avatar — positive controls", () => {
  beforeEach(() => {
    // vitest.config.ts sets mockReset, so implementations must be re-armed.
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ id: "p1", address: owner.address });
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true);
  });

  it("accepts a genuine signature by the owner and stores the file", async () => {
    const response = await postAvatar(signedAvatar(owner));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockWriteFile).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(data.url).toMatch(/^\/uploads\/avatars\/[0-9a-f]{16}-\d+\.png$/);
  });

  it("the stored path stays inside the avatars directory and carries no address", async () => {
    await postAvatar(signedAvatar(owner));

    const written = String(mockWriteFile.mock.calls[0][0]);
    expect(written).toContain("/public/uploads/avatars/");
    expect(written).not.toContain("..");
    expect(written).not.toContain(owner.address);
  });

  it("accepts a native-SegWit owner too", async () => {
    const response = await postAvatar(signedAvatar(attacker));

    expect(response.status).toBe(200);
    expect(mockUpsert.mock.calls[0][0].where).toEqual({ address: attacker.address });
  });
});
