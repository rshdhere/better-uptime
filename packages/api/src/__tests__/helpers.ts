import { prismaClient } from "@repo/store";
import jwt from "jsonwebtoken";
import type {
  StatusPage,
  StatusPageDomain,
  User,
  Website,
} from "@repo/store/generated/prisma";
import { Prisma } from "@repo/store/generated/prisma";
import { userRouter } from "../routes/user.js";
import { websiteRouter } from "../routes/website.js";
import { statusPageRouter } from "../routes/status-page.js";
import { statusDomainRouter } from "../routes/status-domain.js";
import {
  router,
  createContext,
  JWT_SECRET,
  createCallerFactory,
} from "../trpc.js";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import type { IncomingMessage, ServerResponse } from "http";

// Create the app router with user routes
const appRouter = router({
  user: userRouter,
  website: websiteRouter,
  statusPage: statusPageRouter,
  statusDomain: statusDomainRouter,
});

export type AppRouter = typeof appRouter;

// Create caller factory for type-safe test callers
const createCaller = createCallerFactory(appRouter);
type RouterCaller = ReturnType<typeof createCaller>;

async function safeDeleteMany(deleteOperation: () => Promise<unknown>) {
  try {
    await deleteOperation();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    ) {
      return;
    }
    throw error;
  }
}

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
 * Create a test status page for a user
 */
export async function createTestStatusPage(
  userId: string,
  websiteIds: string[] = [],
  overrides: Partial<{
    name: string;
    slug: string;
    isPublished: boolean;
  }> = {},
): Promise<StatusPage> {
  return prismaClient.statusPage.create({
    data: {
      userId,
      name: overrides.name || "Test Status Page",
      slug: overrides.slug || `status-${Date.now()}`,
      isPublished: overrides.isPublished ?? true,
      monitors: websiteIds.length
        ? {
            createMany: {
              data: websiteIds.map((websiteId) => ({ websiteId })),
            },
          }
        : undefined,
    },
  });
}

/**
 * Create a test status page domain mapping
 */
export async function createTestStatusDomain(
  statusPageId: string,
  overrides: Partial<{
    hostname: string;
    verificationToken: string;
    verificationStatus: "PENDING" | "VERIFIED" | "FAILED";
    verifiedAt: Date | null;
  }> = {},
): Promise<StatusPageDomain> {
  return prismaClient.statusPageDomain.create({
    data: {
      statusPageId,
      hostname: overrides.hostname || `status.test${Date.now()}.example.com`,
      verificationToken:
        overrides.verificationToken || `uptique-${crypto.randomUUID()}`,
      verificationStatus: overrides.verificationStatus ?? "PENDING",
      verifiedAt:
        overrides.verifiedAt !== undefined ? overrides.verifiedAt : null,
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
      accept: "application/json",
      type: "query",
      connectionParams: null,
      signal: undefined,
    },
  } as unknown as CreateHTTPContextOptions;
}

/**
 * Create a tRPC caller for testing (unauthenticated)
 */
export function createTestCaller(): RouterCaller {
  const ctx = createContext(createMockHttpContext());
  return createCaller(ctx);
}

/**
 * Create an authenticated tRPC caller for testing
 */
export function createAuthenticatedCaller(userId: string): RouterCaller {
  const token = generateTestToken(userId);
  const ctx = createContext(createMockHttpContext(token));
  return createCaller(ctx);
}

/**
 * Clean up all test data (useful for manual cleanup)
 */
export async function cleanupTestData(): Promise<void> {
  await safeDeleteMany(() => prismaClient.statusPageDomain.deleteMany());
  await safeDeleteMany(() => prismaClient.statusPageMonitor.deleteMany());
  await safeDeleteMany(() => prismaClient.statusPage.deleteMany());
  await safeDeleteMany(() => prismaClient.emailVerificationToken.deleteMany());
  await safeDeleteMany(() => prismaClient.website.deleteMany());
  await safeDeleteMany(() => prismaClient.account.deleteMany());
  await safeDeleteMany(() => prismaClient.user.deleteMany());
}
