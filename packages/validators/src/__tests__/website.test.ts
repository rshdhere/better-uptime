import { describe, it, expect } from "vitest";
import {
  createWebsiteInput,
  updateWebsiteInput,
  websiteIdInput,
  websiteOutput,
  websiteListOutput,
} from "../website/index.js";

describe("createWebsiteInput", () => {
  describe("url validation", () => {
    it("should accept a valid HTTP URL", () => {
      const result = createWebsiteInput.safeParse({
        url: "http://example.com",
      });
      expect(result.success).toBe(true);
    });

    it("should accept a valid HTTPS URL", () => {
      const result = createWebsiteInput.safeParse({
        url: "https://example.com",
      });
      expect(result.success).toBe(true);
    });

    it("should accept a URL with path", () => {
      const result = createWebsiteInput.safeParse({
        url: "https://example.com/api/health",
      });
      expect(result.success).toBe(true);
    });

    it("should accept a URL with port", () => {
      const result = createWebsiteInput.safeParse({
        url: "https://example.com:8080",
      });
      expect(result.success).toBe(true);
    });

    it("should accept a URL with subdomain", () => {
      const result = createWebsiteInput.safeParse({
        url: "https://api.example.com",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an invalid URL format", () => {
      const result = createWebsiteInput.safeParse({
        url: "not-a-valid-url",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a URL without protocol", () => {
      const result = createWebsiteInput.safeParse({
        url: "example.com",
      });
      expect(result.success).toBe(false);
    });

    it("should reject an empty URL", () => {
      const result = createWebsiteInput.safeParse({
        url: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-HTTP protocols (ftp)", () => {
      const result = createWebsiteInput.safeParse({
        url: "ftp://example.com",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("name validation", () => {
    it("should accept a URL with optional name", () => {
      const result = createWebsiteInput.safeParse({
        url: "https://example.com",
        name: "My Website",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("My Website");
      }
    });

    it("should accept a URL without name", () => {
      const result = createWebsiteInput.safeParse({
        url: "https://example.com",
      });
      expect(result.success).toBe(true);
    });

    it("should reject a name that is too long", () => {
      const result = createWebsiteInput.safeParse({
        url: "https://example.com",
        name: "a".repeat(256),
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("updateWebsiteInput", () => {
  it("should accept updating url only", () => {
    const result = updateWebsiteInput.safeParse({
      id: "clx123abc",
      url: "https://updated.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("should accept updating name only", () => {
    const result = updateWebsiteInput.safeParse({
      id: "clx123abc",
      name: "Updated Name",
    });
    expect(result.success).toBe(true);
  });

  it("should accept updating isActive status", () => {
    const result = updateWebsiteInput.safeParse({
      id: "clx123abc",
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it("should accept updating multiple fields", () => {
    const result = updateWebsiteInput.safeParse({
      id: "clx123abc",
      url: "https://new.example.com",
      name: "New Name",
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it("should require id", () => {
    const result = updateWebsiteInput.safeParse({
      name: "Updated Name",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid URL in update", () => {
    const result = updateWebsiteInput.safeParse({
      id: "clx123abc",
      url: "invalid-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("websiteIdInput", () => {
  it("should accept a valid website ID", () => {
    const result = websiteIdInput.safeParse({
      id: "clx123abcdef",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing id", () => {
    const result = websiteIdInput.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject empty id", () => {
    const result = websiteIdInput.safeParse({
      id: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("websiteOutput", () => {
  it("should accept a valid website response", () => {
    const result = websiteOutput.safeParse({
      id: "clx123abc",
      url: "https://example.com",
      name: "My Website",
      isActive: true,
      userId: "user123",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("should accept website with null name", () => {
    const result = websiteOutput.safeParse({
      id: "clx123abc",
      url: "https://example.com",
      name: null,
      isActive: true,
      userId: "user123",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("should reject website without required fields", () => {
    const result = websiteOutput.safeParse({
      id: "clx123abc",
      url: "https://example.com",
    });
    expect(result.success).toBe(false);
  });
});

describe("websiteListOutput", () => {
  it("should accept an array of websites", () => {
    const result = websiteListOutput.safeParse({
      websites: [
        {
          id: "clx123abc",
          url: "https://example1.com",
          name: "Website 1",
          isActive: true,
          userId: "user123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "clx456def",
          url: "https://example2.com",
          name: null,
          isActive: false,
          userId: "user123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      total: 2,
    });
    expect(result.success).toBe(true);
  });

  it("should accept an empty array", () => {
    const result = websiteListOutput.safeParse({
      websites: [],
      total: 0,
    });
    expect(result.success).toBe(true);
  });

  it("should require total count", () => {
    const result = websiteListOutput.safeParse({
      websites: [],
    });
    expect(result.success).toBe(false);
  });
});
