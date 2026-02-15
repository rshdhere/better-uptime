import { describe, it, expect } from "vitest";
import {
  createStatusPageInput,
  publicStatusPageByHostInput,
  statusPageHostnameSchema,
  statusPageSlugSchema,
  updateStatusPageInput,
} from "../status-page/index.js";

describe("statusPageSlugSchema", () => {
  it("accepts valid slugs", () => {
    expect(statusPageSlugSchema.safeParse("acme-status").success).toBe(true);
    expect(statusPageSlugSchema.safeParse("status123").success).toBe(true);
  });

  it("rejects invalid slug formats", () => {
    expect(statusPageSlugSchema.safeParse("Acme").success).toBe(false);
    expect(statusPageSlugSchema.safeParse("acme_status").success).toBe(false);
    expect(statusPageSlugSchema.safeParse("-acme").success).toBe(false);
  });
});

describe("statusPageHostnameSchema", () => {
  it("accepts status-prefixed hostnames", () => {
    expect(
      statusPageHostnameSchema.safeParse("status.startup.com").success,
    ).toBe(true);
  });

  it("normalizes hostnames to lowercase without trailing dot", () => {
    const parsed = statusPageHostnameSchema.safeParse("Status.Startup.com.");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe("status.startup.com");
    }
  });

  it("rejects non-status hostnames", () => {
    expect(statusPageHostnameSchema.safeParse("app.startup.com").success).toBe(
      false,
    );
  });
});

describe("createStatusPageInput", () => {
  it("accepts valid payload", () => {
    const result = createStatusPageInput.safeParse({
      name: "Acme Status",
      slug: "acme-status",
      monitorIds: ["w1", "w2"],
      isPublished: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate monitor IDs", () => {
    const result = createStatusPageInput.safeParse({
      name: "Acme Status",
      slug: "acme-status",
      monitorIds: ["w1", "w1"],
    });
    expect(result.success).toBe(false);
  });
});

describe("updateStatusPageInput", () => {
  it("accepts partial updates", () => {
    const result = updateStatusPageInput.safeParse({
      id: "sp1",
      isPublished: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("publicStatusPageByHostInput", () => {
  it("defaults viewMode to per-check", () => {
    const result = publicStatusPageByHostInput.safeParse({
      hostname: "status.startup.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.viewMode).toBe("per-check");
    }
  });
});
