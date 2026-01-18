import { describe, it, expect } from "vitest";
import {
  userInputValidation,
  userOutputValidation,
  githubAuthInput,
  signupOutputValidation,
} from "../user/index.js";

describe("userInputValidation", () => {
  describe("email validation", () => {
    it("should accept a valid email", () => {
      const result = userInputValidation.safeParse({
        email: "test@example.com",
        password: "Password123!",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an invalid email format", () => {
      const result = userInputValidation.safeParse({
        email: "invalid-email",
        password: "Password123!",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("email");
      }
    });

    it("should reject an email that is too short", () => {
      const result = userInputValidation.safeParse({
        email: "a@b.c",
        password: "Password123!",
      });
      expect(result.success).toBe(false);
    });

    it("should reject an email that is too long", () => {
      const longEmail = "a".repeat(50) + "@example.com";
      const result = userInputValidation.safeParse({
        email: longEmail,
        password: "Password123!",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("password validation", () => {
    it("should accept a valid password with all requirements", () => {
      const result = userInputValidation.safeParse({
        email: "test@example.com",
        password: "Password123!",
      });
      expect(result.success).toBe(true);
    });

    it("should reject a password that is too short", () => {
      const result = userInputValidation.safeParse({
        email: "test@example.com",
        password: "Pass1!",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a password that is too long", () => {
      const result = userInputValidation.safeParse({
        email: "test@example.com",
        password: "Password123!" + "a".repeat(20),
      });
      expect(result.success).toBe(false);
    });

    it("should reject a password without uppercase letter", () => {
      const result = userInputValidation.safeParse({
        email: "test@example.com",
        password: "password123!",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a password without lowercase letter", () => {
      const result = userInputValidation.safeParse({
        email: "test@example.com",
        password: "PASSWORD123!",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a password without a number", () => {
      const result = userInputValidation.safeParse({
        email: "test@example.com",
        password: "Password!!!",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a password without a special character", () => {
      const result = userInputValidation.safeParse({
        email: "test@example.com",
        password: "Password123",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("strict mode", () => {
    it("should reject additional properties", () => {
      const result = userInputValidation.safeParse({
        email: "test@example.com",
        password: "Password123!",
        extraField: "not allowed",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("userOutputValidation", () => {
  it("should accept a valid token response", () => {
    const result = userOutputValidation.safeParse({
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
    });
    expect(result.success).toBe(true);
  });

  it("should reject a response without token", () => {
    const result = userOutputValidation.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject a response with non-string token", () => {
    const result = userOutputValidation.safeParse({
      token: 12345,
    });
    expect(result.success).toBe(false);
  });
});

describe("githubAuthInput", () => {
  it("should accept a valid authorization code", () => {
    const result = githubAuthInput.safeParse({
      code: "abc123def456",
    });
    expect(result.success).toBe(true);
  });

  it("should accept code with optional state", () => {
    const result = githubAuthInput.safeParse({
      code: "abc123def456",
      state: "random-state-string",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty code", () => {
    const result = githubAuthInput.safeParse({
      code: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing code", () => {
    const result = githubAuthInput.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("signupOutputValidation", () => {
  it("should accept a valid signup response", () => {
    const result = signupOutputValidation.safeParse({
      message: "Please check your email to verify your account",
      email: "test@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("should reject response without message", () => {
    const result = signupOutputValidation.safeParse({
      email: "test@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("should reject response without email", () => {
    const result = signupOutputValidation.safeParse({
      message: "Please check your email",
    });
    expect(result.success).toBe(false);
  });

  it("should reject response with invalid email", () => {
    const result = signupOutputValidation.safeParse({
      message: "Please check your email",
      email: "invalid-email",
    });
    expect(result.success).toBe(false);
  });
});
