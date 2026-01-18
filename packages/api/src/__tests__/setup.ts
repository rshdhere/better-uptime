import { beforeAll, afterAll, afterEach } from "bun:test";
import { prismaClient } from "@repo/store";

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
  await prismaClient.emailVerificationToken.deleteMany();
  await prismaClient.website.deleteMany();
  await prismaClient.account.deleteMany();
  await prismaClient.user.deleteMany();
});

// Disconnect after all tests
afterAll(async () => {
  await prismaClient.$disconnect();
});
