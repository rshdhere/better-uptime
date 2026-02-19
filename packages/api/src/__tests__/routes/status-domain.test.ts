import { describe, it, expect, beforeAll } from "bun:test";
import { TRPCError } from "@trpc/server";
import { prismaClient } from "@repo/store";
import { Prisma } from "@repo/store/generated/prisma";

async function hasStatusSchema(): Promise<boolean> {
  try {
    await prismaClient.statusPage.count();
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    ) {
      return false;
    }
    throw error;
  }
}

describe("Status Domain Routes", () => {
  let createAuthenticatedCaller: typeof import("../helpers.js").createAuthenticatedCaller;
  let createTestCaller: typeof import("../helpers.js").createTestCaller;
  let createTestStatusDomain: typeof import("../helpers.js").createTestStatusDomain;
  let createTestStatusPage: typeof import("../helpers.js").createTestStatusPage;
  let createTestUser: typeof import("../helpers.js").createTestUser;
  let createTestWebsite: typeof import("../helpers.js").createTestWebsite;

  beforeAll(async () => {
    const h = await import("../helpers.js");
    createAuthenticatedCaller = h.createAuthenticatedCaller;
    createTestCaller = h.createTestCaller;
    createTestStatusDomain = h.createTestStatusDomain;
    createTestStatusPage = h.createTestStatusPage;
    createTestUser = h.createTestUser;
    createTestWebsite = h.createTestWebsite;
  });

  describe("requestVerification", () => {
    it(
      "creates DNS verification instructions for a status page",
      async () => {
        if (!(await hasStatusSchema())) return;
        const user = await createTestUser();
        const website = await createTestWebsite(user.id);
        const statusPage = await createTestStatusPage(user.id, [website.id], {
          slug: `status-${Date.now()}`,
        });
        const hostname = `status.test${Date.now()}.example.com`;

        const caller = createAuthenticatedCaller(user.id);
        const result = await caller.statusDomain.requestVerification({
          statusPageId: statusPage.id,
          hostname,
        });

        expect(result.hostname).toBe(hostname);
        expect(result.verificationStatus).toBe("PENDING");
        expect(result.cnameRecordName).toBe(hostname);
        expect(result.txtRecordName).toContain(hostname);

        const persisted = await prismaClient.statusPageDomain.findUnique({
          where: { statusPageId: statusPage.id },
        });
        expect(persisted).not.toBeNull();
        expect(persisted?.hostname).toBe(hostname);
      },
      { timeout: 15_000 },
    );

    it("rejects requesting verification on another user's status page", async () => {
      if (!(await hasStatusSchema())) return;
      const owner = await createTestUser();
      const intruder = await createTestUser();
      const website = await createTestWebsite(owner.id);
      const statusPage = await createTestStatusPage(owner.id, [website.id], {
        slug: `owner-${Date.now()}`,
      });

      const caller = createAuthenticatedCaller(intruder.id);
      await expect(
        caller.statusDomain.requestVerification({
          statusPageId: statusPage.id,
          hostname: `status.test${Date.now()}.example.com`,
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("verify", () => {
    it("marks domain as FAILED when DNS records do not match", async () => {
      if (!(await hasStatusSchema())) return;
      const user = await createTestUser();
      const website = await createTestWebsite(user.id);
      const statusPage = await createTestStatusPage(user.id, [website.id], {
        slug: `verify-${Date.now()}`,
      });

      const hostname = `status.test${Date.now()}.example.invalid`;
      const caller = createAuthenticatedCaller(user.id);

      await caller.statusDomain.requestVerification({
        statusPageId: statusPage.id,
        hostname,
      });

      const result = await caller.statusDomain.verify({
        statusPageId: statusPage.id,
        hostname,
      });

      expect(result.verificationStatus).toBe("FAILED");
      expect(result.txtVerified).toBe(false);
      expect(result.cnameVerified).toBe(false);
    });
  });

  describe("canIssueTls", () => {
    it("returns false for unverified domains", async () => {
      if (!(await hasStatusSchema())) return;
      const user = await createTestUser();
      const website = await createTestWebsite(user.id);
      const statusPage = await createTestStatusPage(user.id, [website.id], {
        slug: `tls-pending-${Date.now()}`,
      });
      const hostname = `status.test${Date.now()}.example.com`;

      await createTestStatusDomain(statusPage.id, {
        hostname,
        verificationStatus: "PENDING",
      });

      const caller = createTestCaller();
      const result = await caller.statusDomain.canIssueTls({ hostname });
      expect(result.allowed).toBe(false);
    });

    it("returns true for verified published domains", async () => {
      if (!(await hasStatusSchema())) return;
      const user = await createTestUser();
      const website = await createTestWebsite(user.id);
      const statusPage = await createTestStatusPage(user.id, [website.id], {
        slug: `tls-verified-${Date.now()}`,
        isPublished: true,
      });
      const hostname = `status.test${Date.now()}.example.com`;

      await createTestStatusDomain(statusPage.id, {
        hostname,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
      });

      const caller = createTestCaller();
      const result = await caller.statusDomain.canIssueTls({ hostname });
      expect(result.allowed).toBe(true);
    });
  });
});
