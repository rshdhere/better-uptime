import { prismaClient } from "@repo/store";
import jwt from "jsonwebtoken";
import type { User, Website } from "@repo/store/generated/prisma";
import { userRouter } from "../routes/user.js";
// TODO: Uncomment once websiteRouter is implemented
// import { websiteRouter } from "../routes/website.js";
import { router, createContext, JWT_SECRET } from "../trpc.js";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import type { IncomingMessage, ServerResponse } from "http";

// Create the app router with user routes
// TODO: Add websiteRouter once implemented
const appRouter = router({
  user: userRouter,
  // website: websiteRouter,
});

export type AppRouter = typeof appRouter;

/**
 * Create a test user directly in the database (bypasses email verification flow)
 */
export async function createTestUser(
  overrides: Partial<{
    email: string;
    password: string;
    emailVerified: boolean;
    name: string;
    avatarUrl: string;
    isActive: boolean;
  }> = {},
): Promise<User & { plainPassword: string }> {
  const email = overrides.email || `test-${Date.now()}@example.com`;
  const password = overrides.password || "TestPassword123!";
  const passwordHash = await Bun.password.hash(password);

  const user = await prismaClient.user.create({
    data: {
      email,
      passwordHash,
      emailVerified: overrides.emailVerified ?? true, // Default to verified for easier testing
      name: overrides.name || null,
      avatarUrl: overrides.avatarUrl || null,
      isActive: overrides.isActive ?? true,
    },
  });

  return { ...user, plainPassword: password };
}

/**
 * Create an email verification token for a user
 */
export async function createVerificationToken(
  email: string,
  expiresInMs: number = 24 * 60 * 60 * 1000, // 24 hours default
): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + expiresInMs);

  await prismaClient.emailVerificationToken.create({
    data: {
      token,
      email,
      expiresAt,
    },
  });

  return token;
}

/**
 * Create a test website for a user
 */
export async function createTestWebsite(
  userId: string,
  overrides: Partial<{
    url: string;
    name: string;
    isActive: boolean;
  }> = {},
): Promise<Website> {
  return prismaClient.website.create({
    data: {
      userId,
      url: overrides.url || "https://example.com",
      name: overrides.name || "Example Website",
      isActive: overrides.isActive ?? true,
    },
  });
}

/**
 * Generate a valid JWT token for a user
 */
export function generateTestToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "1h" });
}

/**
 * Create a mock HTTP context for tRPC
 */
function createMockHttpContext(authToken?: string): CreateHTTPContextOptions {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }

  return {
    req: {
      headers,
    } as unknown as IncomingMessage,
    res: {} as unknown as ServerResponse,
    info: {
      isBatchCall: false,
      calls: [],
    },
  };
}

/**
 * Create a tRPC caller for testing (unauthenticated)
 */
export function createTestCaller() {
  const ctx = createContext(createMockHttpContext());
  return appRouter.createCaller(ctx);
}

/**
 * Create an authenticated tRPC caller for testing
 */
export function createAuthenticatedCaller(userId: string) {
  const token = generateTestToken(userId);
  const ctx = createContext(createMockHttpContext(token));
  return appRouter.createCaller(ctx);
}

/**
 * Clean up all test data (useful for manual cleanup)
 */
export async function cleanupTestData(): Promise<void> {
  await prismaClient.emailVerificationToken.deleteMany();
  await prismaClient.website.deleteMany();
  await prismaClient.account.deleteMany();
  await prismaClient.user.deleteMany();
}
