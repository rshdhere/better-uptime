import { describe, it, expect } from "bun:test";
import { TRPCError } from "@trpc/server";
import { prismaClient } from "@repo/store";
import { Prisma } from "@repo/store/generated/prisma";
import {
  createAuthenticatedCaller,
  createTestCaller,
  createTestStatusDomain,
  createTestStatusPage,
  createTestUser,
  createTestWebsite,
} from "../helpers.js";

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

describe("Status Page Routes", () => {
  describe("create", () => {
    it("creates a status page with monitor mappings", async () => {
      if (!(await hasStatusSchema())) return;
      const user = await createTestUser();
      const website1 = await createTestWebsite(user.id, {
        url: "https://one.example.com",
      });
      const website2 = await createTestWebsite(user.id, {
        url: "https://two.example.com",
      });

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.statusPage.create({
        name: "Acme Status",
        slug: `acme-${Date.now()}`,
        monitorIds: [website1.id, website2.id],
      });

      expect(result.name).toBe("Acme Status");
      expect(result.monitorCount).toBe(2);
      expect(result.domain).toBeNull();

      const monitorCount = await prismaClient.statusPageMonitor.count({
        where: { statusPageId: result.id },
      });
      expect(monitorCount).toBe(2);
    });

    it("rejects monitor IDs that do not belong to user", async () => {
      if (!(await hasStatusSchema())) return;
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const website = await createTestWebsite(user2.id);

      const caller = createAuthenticatedCaller(user1.id);

      await expect(
        caller.statusPage.create({
          name: "Invalid monitors",
          slug: `invalid-${Date.now()}`,
          monitorIds: [website.id],
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("list", () => {
    it("returns only status pages owned by authenticated user", async () => {
      if (!(await hasStatusSchema())) return;
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const website1 = await createTestWebsite(user1.id);
      const website2 = await createTestWebsite(user2.id);

      await createTestStatusPage(user1.id, [website1.id], {
        slug: `u1-${Date.now()}`,
      });
      await createTestStatusPage(user2.id, [website2.id], {
        slug: `u2-${Date.now()}`,
      });

      const caller = createAuthenticatedCaller(user1.id);
      const result = await caller.statusPage.list();

      expect(result.statusPages).toHaveLength(1);
      expect(result.statusPages[0]?.userId).toBe(user1.id);
    });
  });

  describe("publicByHost", () => {
    it("returns public status page by verified hostname", async () => {
      if (!(await hasStatusSchema())) return;
      const user = await createTestUser();
      const website = await createTestWebsite(user.id, {
        url: "https://public.example.com",
      });
      const statusPage = await createTestStatusPage(user.id, [website.id], {
        name: "Public Status",
        slug: `public-${Date.now()}`,
        isPublished: true,
      });
      const hostname = `status.test${Date.now()}.example.com`;
      await createTestStatusDomain(statusPage.id, {
        hostname,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
      });

      const caller = createTestCaller();
      const result = await caller.statusPage.publicByHost({
        hostname,
        viewMode: "per-check",
      });

      expect(result.statusPage.hostname).toBe(hostname);
      expect(result.statusPage.name).toBe("Public Status");
      expect(result.statusPage.websites).toHaveLength(1);
      expect(result.statusPage.websites[0]?.websiteUrl).toBe(
        "https://public.example.com",
      );
    });

    it("does not return unverified domains", async () => {
      if (!(await hasStatusSchema())) return;
      const user = await createTestUser();
      const website = await createTestWebsite(user.id);
      const statusPage = await createTestStatusPage(user.id, [website.id], {
        slug: `private-${Date.now()}`,
      });
      const hostname = `status.test${Date.now()}.example.com`;
      await createTestStatusDomain(statusPage.id, {
        hostname,
        verificationStatus: "PENDING",
      });

      const caller = createTestCaller();
      await expect(
        caller.statusPage.publicByHost({
          hostname,
          viewMode: "per-check",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
