import { describe, it, expect, mock, beforeEach } from "bun:test";
import { TRPCError } from "@trpc/server";
import { prismaClient } from "@repo/store";
import {
  createTestUser,
  createTestCaller,
  createVerificationToken,
} from "../helpers.js";

// Mock the email sending function
mock.module("../../email.js", () => ({
  sendVerificationEmail: mock(() => Promise.resolve({ success: true })),
}));

describe("User Routes", () => {
  describe("signup", () => {
    it("should create a new user and send verification email", async () => {
      const caller = createTestCaller();
      const email = `signup-test-${Date.now()}@example.com`;
      const password = "TestPassword123!";

      const result = await caller.user.signup({ email, password });

      expect(result.message).toContain("check your email");
      expect(result.email).toBe(email);

      // Verify user was created in database
      const user = await prismaClient.user.findUnique({
        where: { email },
      });
      expect(user).not.toBeNull();
      expect(user?.emailVerified).toBe(false);

      // Verify verification token was created
      const token = await prismaClient.emailVerificationToken.findFirst({
        where: { email },
      });
      expect(token).not.toBeNull();
    });

    it("should fail if user already exists", async () => {
      const caller = createTestCaller();
      const existingUser = await createTestUser();

      try {
        await caller.user.signup({
          email: existingUser.email,
          password: "TestPassword123!",
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("CONFLICT");
        expect((error as TRPCError).message).toContain("already exists");
      }
    });

    it("should hash the password before storing", async () => {
      const caller = createTestCaller();
      const email = `hash-test-${Date.now()}@example.com`;
      const password = "TestPassword123!";

      await caller.user.signup({ email, password });

      const user = await prismaClient.user.findUnique({
        where: { email },
      });
      expect(user?.passwordHash).not.toBe(password);
      expect(user?.passwordHash).toBeDefined();
    });
  });

  describe("verifyEmail", () => {
    it("should verify email with valid token and return JWT", async () => {
      const caller = createTestCaller();

      // Create an unverified user
      const user = await createTestUser({ emailVerified: false });

      // Create a verification token
      const token = await createVerificationToken(user.email);

      const result = await caller.user.verifyEmail({ token });

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");

      // Verify user is now verified
      const updatedUser = await prismaClient.user.findUnique({
        where: { email: user.email },
      });
      expect(updatedUser?.emailVerified).toBe(true);

      // Verify token was deleted
      const deletedToken = await prismaClient.emailVerificationToken.findUnique(
        {
          where: { token },
        },
      );
      expect(deletedToken).toBeNull();
    });

    it("should fail with invalid token", async () => {
      const caller = createTestCaller();

      try {
        await caller.user.verifyEmail({ token: "invalid-token-12345" });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("should fail with expired token", async () => {
      const caller = createTestCaller();

      // Create an unverified user
      const user = await createTestUser({ emailVerified: false });

      // Create an expired verification token (-1 second in the past)
      const token = await createVerificationToken(user.email, -1000);

      try {
        await caller.user.verifyEmail({ token });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("BAD_REQUEST");
        expect((error as TRPCError).message).toContain("expired");
      }
    });
  });

  describe("login", () => {
    it("should return JWT for verified user with correct password", async () => {
      const caller = createTestCaller();
      const user = await createTestUser({ emailVerified: true });

      const result = await caller.user.login({
        email: user.email,
        password: user.plainPassword,
      });

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");
      // JWT format check (three parts separated by dots)
      expect(result.token.split(".")).toHaveLength(3);
    });

    it("should fail if email is not verified", async () => {
      const caller = createTestCaller();
      const user = await createTestUser({ emailVerified: false });

      try {
        await caller.user.login({
          email: user.email,
          password: user.plainPassword,
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("FORBIDDEN");
        expect((error as TRPCError).message).toContain("verify your email");
      }
    });

    it("should fail with wrong password", async () => {
      const caller = createTestCaller();
      const user = await createTestUser({ emailVerified: true });

      try {
        await caller.user.login({
          email: user.email,
          password: "WrongPassword123!",
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("UNAUTHORIZED");
      }
    });

    it("should fail if user does not exist", async () => {
      const caller = createTestCaller();

      try {
        await caller.user.login({
          email: "nonexistent@example.com",
          password: "TestPassword123!",
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });
  });

  describe("resendVerification", () => {
    it("should send new verification email for unverified user", async () => {
      const caller = createTestCaller();
      const user = await createTestUser({ emailVerified: false });

      const result = await caller.user.resendVerification({
        email: user.email,
      });

      expect(result.message).toContain("verification email");

      // Verify a new token was created
      const token = await prismaClient.emailVerificationToken.findFirst({
        where: { email: user.email },
      });
      expect(token).not.toBeNull();
    });

    it("should fail if email is already verified", async () => {
      const caller = createTestCaller();
      const user = await createTestUser({ emailVerified: true });

      try {
        await caller.user.resendVerification({ email: user.email });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("BAD_REQUEST");
        expect((error as TRPCError).message).toContain("already verified");
      }
    });

    it("should return success message even for non-existent user (security)", async () => {
      const caller = createTestCaller();

      // Should not reveal if user exists or not
      const result = await caller.user.resendVerification({
        email: "nonexistent@example.com",
      });

      expect(result.message).toContain("verification email");
    });

    it("should delete old tokens before creating new one", async () => {
      const caller = createTestCaller();
      const user = await createTestUser({ emailVerified: false });

      // Create an old token
      await createVerificationToken(user.email);

      // Get count before resend
      const beforeCount = await prismaClient.emailVerificationToken.count({
        where: { email: user.email },
      });

      await caller.user.resendVerification({ email: user.email });

      // Should still only have one token
      const afterCount = await prismaClient.emailVerificationToken.count({
        where: { email: user.email },
      });

      expect(afterCount).toBe(1);
    });
  });
});
