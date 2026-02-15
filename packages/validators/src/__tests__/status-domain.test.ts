import { describe, it, expect } from "vitest";
import {
  canIssueTlsInput,
  requestStatusDomainVerificationInput,
  verifyStatusDomainInput,
} from "../status-domain/index.js";

describe("requestStatusDomainVerificationInput", () => {
  it("accepts valid payload", () => {
    const result = requestStatusDomainVerificationInput.safeParse({
      statusPageId: "sp1",
      hostname: "status.startup.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-status hostname", () => {
    const result = requestStatusDomainVerificationInput.safeParse({
      statusPageId: "sp1",
      hostname: "app.startup.com",
    });
    expect(result.success).toBe(false);
  });
});

describe("verifyStatusDomainInput", () => {
  it("accepts verify payload", () => {
    const result = verifyStatusDomainInput.safeParse({
      statusPageId: "sp1",
      hostname: "status.startup.com",
    });
    expect(result.success).toBe(true);
  });
});

describe("canIssueTlsInput", () => {
  it("accepts status hostname", () => {
    const result = canIssueTlsInput.safeParse({
      hostname: "status.startup.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid hostname", () => {
    const result = canIssueTlsInput.safeParse({
      hostname: "bad host",
    });
    expect(result.success).toBe(false);
  });
});
