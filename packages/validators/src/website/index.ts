import { z } from "zod";

/**
 * URL validation helper that ensures HTTP/HTTPS protocol
 */
const httpUrlSchema = z
  .string()
  .min(1, "URL is required")
  .url("Invalid URL format")
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must use HTTP or HTTPS protocol" },
  );

/**
 * Input validation for creating a new website to monitor
 */
export const createWebsiteInput = z.object({
  url: httpUrlSchema,
  name: z.string().max(255, "Name must be 255 characters or less").optional(),
});

/**
 * Input validation for updating an existing website
 */
export const updateWebsiteInput = z.object({
  id: z.string().min(1, "Website ID is required"),
  url: httpUrlSchema.optional(),
  name: z.string().max(255, "Name must be 255 characters or less").optional(),
  isActive: z.boolean().optional(),
});

/**
 * Input validation for getting/deleting a website by ID
 */
export const websiteIdInput = z.object({
  id: z.string().min(1, "Website ID is required"),
});

/**
 * Output validation for a single website
 */
export const websiteOutput = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string().nullable(),
  isActive: z.boolean(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Output validation for a list of websites
 */
export const websiteListOutput = z.object({
  websites: z.array(websiteOutput),
  total: z.number(),
});

/**
 * Type exports for use in API routes
 */
export type CreateWebsiteInput = z.infer<typeof createWebsiteInput>;
export type UpdateWebsiteInput = z.infer<typeof updateWebsiteInput>;
export type WebsiteIdInput = z.infer<typeof websiteIdInput>;
export type WebsiteOutput = z.infer<typeof websiteOutput>;
export type WebsiteListOutput = z.infer<typeof websiteListOutput>;
