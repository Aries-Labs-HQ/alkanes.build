/**
 * Prisma error shapes the registry routes need to distinguish.
 *
 * Lives here rather than in a route file because a Next.js route module may
 * only export the HTTP method handlers — anything else fails the build with
 * "does not match the required types of a Next.js Route".
 */

/**
 * P2002: a unique constraint failed.
 *
 * The registry leans on the database for its invariants — a plain unique index
 * on the nonce, and partial unique indexes for "one live binding per builder"
 * and "one live binding per address". A concurrent double-submit or a replayed
 * signature therefore surfaces here rather than producing a second live row.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}
