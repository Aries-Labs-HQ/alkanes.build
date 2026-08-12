import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Use vi.hoisted to ensure mocks are available before vi.mock hoisting
const { mockWriteFile, mockMkdir, mockExistsSync, mockUpsert } = vi.hoisted(
  () => ({
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockExistsSync: vi.fn().mockReturnValue(true),
    mockUpsert: vi.fn().mockResolvedValue({}),
  })
);

vi.mock("fs/promises", () => ({
  default: {
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}));

vi.mock("fs", () => ({
  default: {
    existsSync: mockExistsSync,
  },
  existsSync: mockExistsSync,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: {
      upsert: mockUpsert,
    },
  },
  default: {
    userProfile: {
      upsert: mockUpsert,
    },
  },
}));

// Import after mocking
import { createHash } from "crypto";
import { POST } from "@/app/api/profile/avatar/route";
import { buildSigningMessage, SIGNING_ACTIONS } from "@/lib/signing-message";
import { p2trWallet, testNonce } from "../../helpers/bip322-signer";

// The route now requires a BIP-322 signature by the address being changed, so
// these tests need a real key rather than a placeholder string.
const wallet = p2trWallet("c3".repeat(32));

// Helper to create a mock file
const createMockFile = (
  name: string,
  type: string,
  size: number
): File => {
  const bytes = Buffer.alloc(size);
  const file = new File([new Uint8Array(bytes)], name, { type });
  // Keep the bytes to hand so the request helper can bind a signature to them.
  (file as unknown as { __bytes: Buffer }).__bytes = bytes;
  return file;
};

// Helper to create FormData request. Signs by default: the interesting cases
// here are the non-auth ones, and an unsigned request never reaches them.
const createFormDataRequest = (
  file: File | null,
  address: string | null,
  { sign = true }: { sign?: boolean } = {}
): NextRequest => {
  const formData = new FormData();
  if (file) formData.append("file", file);
  if (address) formData.append("address", address);

  if (sign && file && address) {
    const issuedAt = Date.now();
    const nonce = testNonce("2");
    // The signature is bound to the bytes, so it has to be built from them.
    const bytes = (file as unknown as { __bytes?: Buffer }).__bytes ?? Buffer.alloc(0);
    const message = buildSigningMessage({
      action: SIGNING_ACTIONS.PROFILE_AVATAR,
      address,
      resource: `address:${address}`,
      params: {
        contentSha256: createHash("sha256").update(bytes).digest("hex"),
        contentType: file.type,
      },
      issuedAt,
      nonce,
    });
    formData.append("signature", wallet.sign(message));
    formData.append("nonce", nonce);
    formData.append("issuedAt", String(issuedAt));
  }

  return new NextRequest("http://localhost/api/profile/avatar", {
    method: "POST",
    body: formData,
  });
};

describe("POST /api/profile/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockUpsert.mockResolvedValue({});
  });

  it("returns 400 when no file provided", async () => {
    const request = createFormDataRequest(null, "bc1ptest");
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No file provided");
  });

  it("returns 400 when address is missing", async () => {
    const file = createMockFile("avatar.jpg", "image/jpeg", 1024);
    const request = createFormDataRequest(file, null);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Address is required");
  });

  it("returns 400 for invalid file type", async () => {
    const file = createMockFile("document.pdf", "application/pdf", 1024);
    const request = createFormDataRequest(file, wallet.address);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid file type. Allowed: JPEG, PNG, GIF, WebP");
  });

  it("returns 400 when file is too large (>2MB)", async () => {
    const file = createMockFile(
      "large.jpg",
      "image/jpeg",
      3 * 1024 * 1024 // 3MB
    );
    const request = createFormDataRequest(file, wallet.address);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("File too large. Maximum size is 2MB");
  });

  it("successfully uploads a JPEG image", async () => {
    const file = createMockFile("avatar.jpg", "image/jpeg", 1024);
    const request = createFormDataRequest(file, wallet.address);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Filename is now `${sha256(address).slice(0,16)}-${Date.now()}.${ext}` —
    // the address no longer reaches the path.
    expect(data.url).toMatch(/^\/uploads\/avatars\/[0-9a-f]{16}-\d+\.jpg$/);
    expect(mockWriteFile).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { address: wallet.address },
        update: expect.objectContaining({
          avatarUrl: expect.stringMatching(/^\/uploads\/avatars\//),
        }),
      })
    );
  });

  it("successfully uploads a PNG image", async () => {
    const file = createMockFile("avatar.png", "image/png", 1024);
    const request = createFormDataRequest(file, wallet.address);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toMatch(/\.png$/);
  });

  it("successfully uploads a GIF image", async () => {
    const file = createMockFile("avatar.gif", "image/gif", 1024);
    const request = createFormDataRequest(file, wallet.address);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toMatch(/\.gif$/);
  });

  it("successfully uploads a WebP image", async () => {
    const file = createMockFile("avatar.webp", "image/webp", 1024);
    const request = createFormDataRequest(file, wallet.address);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toMatch(/\.webp$/);
  });

  it("creates upload directory if it does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const file = createMockFile("avatar.jpg", "image/jpeg", 1024);
    const request = createFormDataRequest(file, wallet.address);
    await POST(request);

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining("avatars"),
      { recursive: true }
    );
  });

  it("does not create directory if it already exists", async () => {
    mockExistsSync.mockReturnValue(true);

    const file = createMockFile("avatar.jpg", "image/jpeg", 1024);
    const request = createFormDataRequest(file, wallet.address);
    await POST(request);

    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it("returns 500 when file write fails", async () => {
    mockWriteFile.mockRejectedValueOnce(new Error("Write failed"));

    const file = createMockFile("avatar.jpg", "image/jpeg", 1024);
    const request = createFormDataRequest(file, wallet.address);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to upload avatar");
  });

  it("returns 500 when database update fails", async () => {
    mockUpsert.mockRejectedValueOnce(new Error("Database error"));

    const file = createMockFile("avatar.jpg", "image/jpeg", 1024);
    const request = createFormDataRequest(file, wallet.address);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to upload avatar");
  });

  it("derives the filename from a hash of the address, never the address itself", async () => {
    const file = createMockFile("avatar.jpg", "image/jpeg", 1024);
    const request = createFormDataRequest(file, wallet.address);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toMatch(/^\/uploads\/avatars\/[0-9a-f]{16}-\d+\.jpg$/);
    expect(data.url).not.toContain(wallet.address);
  });
});
