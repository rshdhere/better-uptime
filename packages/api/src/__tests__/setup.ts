import { beforeAll, afterAll, afterEach } from "bun:test";
import { prismaClient } from "@repo/store";
import { Prisma } from "@repo/store/generated/prisma";

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

// Clean up database before tests run
beforeAll(async () => {
  // Ensure we're using a test database
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl.includes("test") && !dbUrl.includes("localhost")) {
    console.warn(
      "WARNING: Tests may be running against production database. Set DATABASE_URL to a test database.",
    );
  }
});

// Clean up data after each test
afterEach(async () => {
  // Delete in order to respect foreign key constraints
  await safeDeleteMany(() => prismaClient.statusPageDomain.deleteMany());
  await safeDeleteMany(() => prismaClient.statusPageMonitor.deleteMany());
  await safeDeleteMany(() => prismaClient.statusPage.deleteMany());
  await safeDeleteMany(() => prismaClient.emailVerificationToken.deleteMany());
  await safeDeleteMany(() => prismaClient.website.deleteMany());
  await safeDeleteMany(() => prismaClient.account.deleteMany());
  await safeDeleteMany(() => prismaClient.user.deleteMany());
});

// Disconnect after all tests
afterAll(async () => {
  await prismaClient.$disconnect();
});
