import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { verifySignedAction } from "@/lib/request-auth";
import { SIGNING_ACTIONS } from "@/lib/signing-message";

// Max file size: 2MB
const MAX_FILE_SIZE = 2 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/**
 * POST /api/profile/avatar
 * Upload user avatar
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const address = formData.get("address") as string | null;
    const signature = formData.get("signature") as string | null;
    const nonce = formData.get("nonce") as string | null;
    const issuedAt = formData.get("issuedAt") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!address) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 2MB" },
        { status: 400 }
      );
    }

    // Authorise before writing anything to disk or to the database.
    //
    // Identity used to be the `address` form field of this very request, so
    // anyone could replace anyone's avatar by naming them. The signature is
    // bound to the bytes being stored, so it cannot be replayed with a
    // different image.
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const auth = await verifySignedAction({
      action: SIGNING_ACTIONS.PROFILE_AVATAR,
      address,
      signature,
      issuedAt,
      nonce,
      resource: `address:${address}`,
      params: {
        contentSha256: createHash("sha256").update(buffer).digest("hex"),
        contentType: file.type,
      },
    });

    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Derive the filename from a hash of the address rather than from the
    // address itself. `address.slice(0, 16)` went straight into path.join, so a
    // crafted address put `..` and `/` into the path and chose where the file
    // landed. A hex digest cannot contain a separator or a dot segment, and the
    // result is still stable per address.
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const addressKey = createHash("sha256")
      .update(address, "utf8")
      .digest("hex")
      .slice(0, 16);
    const filename = `${addressKey}-${Date.now()}.${ext}`;

    // Ensure uploads directory exists
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Belt and braces: whatever the derivation did, the destination must be
    // inside the upload directory.
    const filePath = path.join(uploadDir, filename);
    if (path.dirname(path.resolve(filePath)) !== path.resolve(uploadDir)) {
      return NextResponse.json(
        { error: "Invalid upload path" },
        { status: 400 }
      );
    }

    await writeFile(filePath, buffer);

    // Generate URL
    const url = `/uploads/avatars/${filename}`;

    // Update user profile with new avatar URL
    await prisma.userProfile.upsert({
      where: { address },
      create: {
        address,
        avatarUrl: url,
      },
      update: {
        avatarUrl: url,
      },
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Error uploading avatar:", error);
    return NextResponse.json(
      { error: "Failed to upload avatar" },
      { status: 500 }
    );
  }
}
