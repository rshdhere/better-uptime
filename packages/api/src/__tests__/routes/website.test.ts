import { describe, it, expect } from "bun:test";
import { TRPCError } from "@trpc/server";
import { prismaClient } from "@repo/store";
import {
  createTestUser,
  createTestCaller,
  createAuthenticatedCaller,
  createTestWebsite,
} from "../helpers.js";

// TODO: Remove .skip once websiteRouter is implemented in src/routes/website.ts
describe.skip("Website Routes", () => {
  describe("createWebsite", () => {
    it("should allow authenticated user to add a URL to monitor", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      const result = await caller.website.create({
        url: "https://example.com",
        name: "My Example Site",
      });

      expect(result.id).toBeDefined();
      expect(result.url).toBe("https://example.com");
      expect(result.name).toBe("My Example Site");
      expect(result.isActive).toBe(true);
      expect(result.userId).toBe(user.id);

      // Verify in database
      const website = await prismaClient.website.findUnique({
        where: { id: result.id },
      });
      expect(website).not.toBeNull();
      expect(website?.url).toBe("https://example.com");
    });

    it("should create website without optional name", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      const result = await caller.website.create({
        url: "https://example.com",
      });

      expect(result.id).toBeDefined();
      expect(result.url).toBe("https://example.com");
      expect(result.name).toBeNull();
    });

    it("should fail if not authenticated", async () => {
      const caller = createTestCaller();

      try {
        await caller.website.create({
          url: "https://example.com",
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("UNAUTHORIZED");
      }
    });

    it("should validate URL format", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.website.create({
          url: "not-a-valid-url",
        }),
      ).rejects.toThrow();
    });

    it("should reject non-HTTP protocols", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.website.create({
          url: "ftp://example.com",
        }),
      ).rejects.toThrow();
    });
  });

  describe("listWebsites", () => {
    it("should return only the authenticated user's websites", async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      // Create websites for both users
      await createTestWebsite(user1.id, { url: "https://user1-site.com" });
      await createTestWebsite(user1.id, { url: "https://user1-site2.com" });
      await createTestWebsite(user2.id, { url: "https://user2-site.com" });

      const caller = createAuthenticatedCaller(user1.id);
      const result = await caller.website.list();

      expect(result.websites).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.websites.every((w) => w.userId === user1.id)).toBe(true);
    });

    it("should return empty array for user with no websites", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      const result = await caller.website.list();

      expect(result.websites).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("should fail if not authenticated", async () => {
      const caller = createTestCaller();

      try {
        await caller.website.list();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("UNAUTHORIZED");
      }
    });
  });

  describe("getWebsite", () => {
    it("should return a single website by ID", async () => {
      const user = await createTestUser();
      const website = await createTestWebsite(user.id, {
        url: "https://get-test.com",
        name: "Get Test Site",
      });

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.website.get({ id: website.id });

      expect(result.id).toBe(website.id);
      expect(result.url).toBe("https://get-test.com");
      expect(result.name).toBe("Get Test Site");
    });

    it("should fail if website belongs to another user", async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const website = await createTestWebsite(user1.id);

      const caller = createAuthenticatedCaller(user2.id);

      try {
        await caller.website.get({ id: website.id });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("should fail if website does not exist", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      try {
        await caller.website.get({ id: "nonexistent-id" });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("should fail if not authenticated", async () => {
      const user = await createTestUser();
      const website = await createTestWebsite(user.id);
      const caller = createTestCaller();

      await expect(caller.website.get({ id: website.id })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe("updateWebsite", () => {
    it("should allow user to update their website URL", async () => {
      const user = await createTestUser();
      const website = await createTestWebsite(user.id, {
        url: "https://old-url.com",
      });

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.website.update({
        id: website.id,
        url: "https://new-url.com",
      });

      expect(result.url).toBe("https://new-url.com");

      // Verify in database
      const updated = await prismaClient.website.findUnique({
        where: { id: website.id },
      });
      expect(updated?.url).toBe("https://new-url.com");
    });

    it("should allow user to update website name", async () => {
      const user = await createTestUser();
      const website = await createTestWebsite(user.id, {
        name: "Old Name",
      });

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.website.update({
        id: website.id,
        name: "New Name",
      });

      expect(result.name).toBe("New Name");
    });

    it("should allow user to toggle isActive status", async () => {
      const user = await createTestUser();
      const website = await createTestWebsite(user.id, { isActive: true });

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.website.update({
        id: website.id,
        isActive: false,
      });

      expect(result.isActive).toBe(false);
    });

    it("should fail if website belongs to another user", async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const website = await createTestWebsite(user1.id);

      const caller = createAuthenticatedCaller(user2.id);

      try {
        await caller.website.update({
          id: website.id,
          name: "Hacked!",
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("should fail if not authenticated", async () => {
      const user = await createTestUser();
      const website = await createTestWebsite(user.id);
      const caller = createTestCaller();

      await expect(
        caller.website.update({
          id: website.id,
          name: "New Name",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("deleteWebsite", () => {
    it("should allow user to delete their website", async () => {
      const user = await createTestUser();
      const website = await createTestWebsite(user.id);

      const caller = createAuthenticatedCaller(user.id);
      const result = await caller.website.delete({ id: website.id });

      expect(result.success).toBe(true);

      // Verify deletion
      const deleted = await prismaClient.website.findUnique({
        where: { id: website.id },
      });
      expect(deleted).toBeNull();
    });

    it("should fail if website belongs to another user", async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const website = await createTestWebsite(user1.id);

      const caller = createAuthenticatedCaller(user2.id);

      try {
        await caller.website.delete({ id: website.id });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }

      // Verify website still exists
      const stillExists = await prismaClient.website.findUnique({
        where: { id: website.id },
      });
      expect(stillExists).not.toBeNull();
    });

    it("should fail if website does not exist", async () => {
      const user = await createTestUser();
      const caller = createAuthenticatedCaller(user.id);

      await expect(
        caller.website.delete({ id: "nonexistent-id" }),
      ).rejects.toThrow(TRPCError);
    });

    it("should fail if not authenticated", async () => {
      const user = await createTestUser();
      const website = await createTestWebsite(user.id);
      const caller = createTestCaller();

      await expect(caller.website.delete({ id: website.id })).rejects.toThrow(
        TRPCError,
      );
    });
  });
});
