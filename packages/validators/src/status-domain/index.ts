import { z } from "zod";
import {
  statusDomainVerificationStatusSchema,
  statusPageHostnameSchema,
} from "../status-page/index.js";

const statusPageDomainIdentityInput = z
  .object({
    statusPageId: z.string().min(1, "Status page ID is required"),
    hostname: statusPageHostnameSchema,
  })
  .strict();

export const requestStatusDomainVerificationInput =
  statusPageDomainIdentityInput;

export const requestStatusDomainVerificationOutput = z.object({
  statusPageId: z.string(),
  hostname: z.string(),
  verificationStatus: statusDomainVerificationStatusSchema,
  cnameRecordName: z.string(),
  cnameRecordValue: z.string(),
  txtRecordName: z.string(),
  txtRecordValue: z.string(),
});

export const verifyStatusDomainInput = statusPageDomainIdentityInput;

export const verifyStatusDomainOutput = z.object({
  statusPageId: z.string(),
  hostname: z.string(),
  verificationStatus: statusDomainVerificationStatusSchema,
  txtVerified: z.boolean(),
  cnameVerified: z.boolean(),
  cnameRecordName: z.string(),
  cnameRecordValue: z.string(),
  txtRecordName: z.string(),
  txtRecordValue: z.string(),
  verifiedAt: z.date().nullable(),
});

export const canIssueTlsInput = z
  .object({
    hostname: statusPageHostnameSchema,
  })
  .strict();

export const canIssueTlsOutput = z.object({
  allowed: z.boolean(),
});
