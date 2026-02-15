import { z } from "zod";
import { websiteStatusOutput } from "../website/index.js";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hostnameRegex =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;

const normalizeHostname = (hostname: string): string =>
  hostname.trim().toLowerCase().replace(/\.$/, "");

export const statusPageSlugSchema = z
  .string()
  .trim()
  .min(2, "Slug must be at least 2 characters long")
  .max(63, "Slug must be 63 characters or less")
  .regex(
    slugRegex,
    "Slug can only contain lowercase letters, numbers, and hyphens",
  );

export const statusPageHostnameSchema = z
  .string()
  .trim()
  .min(1, "Hostname is required")
  .transform(normalizeHostname)
  .refine((hostname) => hostnameRegex.test(hostname), {
    message: "Invalid hostname format",
  })
  .refine((hostname) => hostname.startsWith("status."), {
    message: "Hostname must start with status.",
  });

export const statusDomainVerificationStatusSchema = z.enum([
  "PENDING",
  "VERIFIED",
  "FAILED",
]);

const monitorIdsSchema = z
  .array(z.string().min(1, "Monitor ID is required"))
  .min(1, "Select at least one monitor")
  .max(100, "A status page can include at most 100 monitors")
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Monitor IDs must be unique",
  });

export const statusPageIdInput = z.object({
  id: z.string().min(1, "Status page ID is required"),
});

export const createStatusPageInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(120, "Name must be 120 characters or less"),
    slug: statusPageSlugSchema,
    monitorIds: monitorIdsSchema,
    isPublished: z.boolean().optional(),
  })
  .strict();

export const updateStatusPageInput = z
  .object({
    id: z.string().min(1, "Status page ID is required"),
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(120, "Name must be 120 characters or less")
      .optional(),
    slug: statusPageSlugSchema.optional(),
    monitorIds: monitorIdsSchema.optional(),
    isPublished: z.boolean().optional(),
  })
  .strict();

export const websiteStatusViewModeInput = z.object({
  viewMode: z.enum(["per-check", "per-day"]).default("per-check"),
});

export const publicStatusPageByHostInput = z.object({
  hostname: statusPageHostnameSchema,
  viewMode: z.enum(["per-check", "per-day"]).default("per-check"),
});

export const statusPageDomainOutput = z.object({
  id: z.string(),
  hostname: z.string(),
  verificationStatus: statusDomainVerificationStatusSchema,
  verifiedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const statusPageOutput = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  isPublished: z.boolean(),
  userId: z.string(),
  monitorCount: z.number().int().nonnegative(),
  domain: statusPageDomainOutput.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const statusPageListOutput = z.object({
  statusPages: z.array(statusPageOutput),
});

export const statusPagePublicOutput = z.object({
  statusPage: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    hostname: z.string(),
    websites: z.array(websiteStatusOutput),
  }),
});

export type StatusDomainVerificationStatus = z.infer<
  typeof statusDomainVerificationStatusSchema
>;
export type StatusPageIdInput = z.infer<typeof statusPageIdInput>;
export type CreateStatusPageInput = z.infer<typeof createStatusPageInput>;
export type UpdateStatusPageInput = z.infer<typeof updateStatusPageInput>;
export type PublicStatusPageByHostInput = z.infer<
  typeof publicStatusPageByHostInput
>;
